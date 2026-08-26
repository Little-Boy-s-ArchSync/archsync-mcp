import { contractLimits, errorCodes, isBoundedJsonValue, toolDefinitions, tools } from "./contracts.mjs";

const backendMethods = {
  architecture_validate: "validateArchitecture",
  architecture_graph: "buildArchitectureGraph",
  architecture_check_diff: "checkArchitectureDiff",
  architecture_explain_finding: "explainFinding",
  architecture_propose_evolution: "proposeEvolution",
};

const publicMessages = {
  INVALID_ARGUMENT: "Tool arguments do not match contract 0.1.",
  UNAUTHORIZED: "The caller is not authorized for this tool.",
  RATE_LIMITED: "The tool call rate limit was reached.",
  VERSION_MISMATCH: "The requested contract version is unsupported.",
  BACKEND_UNAVAILABLE: "The delegated ArchSync backend is unavailable.",
  PROVIDER_UNAVAILABLE: "The explanation provider is unavailable; deterministic gates remain available.",
  OUTPUT_REJECTED: "The delegated output failed its versioned contract or safety check.",
  TIMEOUT: "The delegated operation exceeded its configured time limit.",
  INTERNAL_ERROR: "The tool call failed without exposing internal details.",
};

const secretPattern = /(?:github_pat_|ghp_|sk-(?:live|test|proj)-|bearer\s+)[A-Za-z0-9._-]{8,}/iu;

export class AdapterError extends Error {
  constructor(code, cause) {
    super(publicMessages[errorCodes.has(code) ? code : "INTERNAL_ERROR"]);
    this.name = "AdapterError";
    this.code = errorCodes.has(code) ? code : "INTERNAL_ERROR";
    this.cause = cause;
  }
}

export function createFixedWindowRateLimiter({ maxCalls, windowMs, now = Date.now }) {
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || !Number.isInteger(windowMs) || windowMs < 1 || typeof now !== "function") {
    throw new Error("invalid fixed-window rate limiter configuration");
  }
  const buckets = new Map();
  return ({ principal, tool }) => {
    const key = `${principal}\0${tool}`;
    const time = now();
    const current = buckets.get(key);
    if (!current || time - current.startedAt >= windowMs) {
      buckets.set(key, { startedAt: time, calls: 1 });
      return true;
    }
    if (current.calls >= maxCalls) return false;
    current.calls += 1;
    return true;
  };
}

function checkBackend(backend) {
  if (!backend || typeof backend !== "object") throw new Error("backend must be an object");
  for (const method of Object.values(backendMethods)) {
    if (typeof backend[method] !== "function") throw new Error(`backend is missing ${method}`);
  }
}

async function withTimeout(operation, timeoutMs, controller) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterError("TIMEOUT"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function safeAudit(audit, event) {
  try {
    audit(event);
  } catch {
    // Audit sinks are reporting-only and receive no arguments, source, paths, or credentials.
  }
}

function citationsAreBound(tool, input, output) {
  if (tool !== "architecture_explain_finding") return true;
  const supplied = new Map(input.evidence.map((item) => [item.id, item]));
  return output.explanation.claims.every((claim) => claim.citations.every((citation) => {
    const item = supplied.get(citation);
    if (!item) return false;
    const location = claim.source_location;
    return !location || (
      (location.file === undefined || location.file === item.file)
      && (location.line === undefined || location.line === item.line)
      && (location.rule_id === undefined || location.rule_id === item.rule_id)
    );
  }));
}

export function createToolExecutor({
  backend,
  workspaceRoot,
  principal,
  authorize,
  rateLimit,
  audit = () => {},
  timeoutMs = 30_000,
  now = Date.now,
}) {
  checkBackend(backend);
  if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0 || typeof principal !== "string" || principal.length === 0 || typeof authorize !== "function" || typeof rateLimit !== "function" || typeof audit !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || typeof now !== "function") {
    throw new Error("invalid adapter configuration");
  }

  return async (tool, rawArguments) => {
    const startedAt = now();
    let outcome = "INTERNAL_ERROR";
    try {
      if (!tools.includes(tool)) throw new AdapterError("INVALID_ARGUMENT");
      if (!isBoundedJsonValue(rawArguments, { maxBytes: contractLimits.inputBytes })) throw new AdapterError("INVALID_ARGUMENT");
      const definition = toolDefinitions[tool];
      if (rawArguments && typeof rawArguments === "object" && rawArguments.contract_version !== "0.1") {
        throw new AdapterError("VERSION_MISMATCH");
      }
      const parsed = definition.inputSchema.safeParse(rawArguments);
      if (!parsed.success) throw new AdapterError("INVALID_ARGUMENT", parsed.error);
      if (!await authorize({ principal, tool })) throw new AdapterError("UNAUTHORIZED");
      if (!await rateLimit({ principal, tool })) throw new AdapterError("RATE_LIMITED");

      const controller = new AbortController();
      const method = backendMethods[tool];
      let delegated;
      try {
        delegated = await withTimeout(Promise.resolve(backend[method]({
          ...parsed.data,
          workspace_root: workspaceRoot,
          signal: controller.signal,
        })), timeoutMs, controller);
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        throw new AdapterError("BACKEND_UNAVAILABLE", error);
      }
      if (!isBoundedJsonValue(delegated, {
        maxBytes: contractLimits.outputBytes,
        maxStringBytes: contractLimits.patchCharacters,
      })) throw new AdapterError("OUTPUT_REJECTED");
      const output = definition.outputSchema.safeParse(delegated);
      if (!output.success || !citationsAreBound(tool, parsed.data, output.data) || secretPattern.test(JSON.stringify(output.data))) {
        throw new AdapterError("OUTPUT_REJECTED", output.error);
      }
      outcome = "SUCCESS";
      safeAudit(audit, {
        schema_version: 1,
        tool,
        outcome,
        duration_ms: Math.max(0, now() - startedAt),
      });
      return output.data;
    } catch (error) {
      const safe = error instanceof AdapterError ? error : new AdapterError("INTERNAL_ERROR", error);
      outcome = safe.code;
      safeAudit(audit, {
        schema_version: 1,
        tool: tools.includes(tool) ? tool : "unknown",
        outcome,
        duration_ms: Math.max(0, now() - startedAt),
      });
      throw safe;
    }
  };
}

export function toToolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false,
  };
}

export function toToolError(error) {
  const safe = error instanceof AdapterError ? error : new AdapterError("INTERNAL_ERROR", error);
  const payload = { contract_version: "0.1", error_code: safe.code, message: safe.message };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}
