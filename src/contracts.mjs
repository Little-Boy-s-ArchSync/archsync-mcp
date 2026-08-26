import { isAbsolute } from "node:path";

import { z } from "zod";

export const protocolVersion = "2026-07-28";
export const toolContractVersion = "0.1";
export const contractLimits = Object.freeze({
  inputBytes: 1_048_576,
  outputBytes: 2_097_152,
  jsonBytes: 1_048_576,
  stringBytes: 32_768,
  patchCharacters: 1_048_576,
  collectionItems: 256,
  jsonDepth: 8,
  jsonNodes: 4_096,
  objectKeys: 256,
});
export const tools = [
  "architecture_validate",
  "architecture_graph",
  "architecture_check_diff",
  "architecture_explain_finding",
  "architecture_propose_evolution",
];

export function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || isAbsolute(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isBoundedJsonValue(value, {
  maxBytes = contractLimits.jsonBytes,
  maxStringBytes = contractLimits.stringBytes,
} = {}) {
  const seen = new Set();
  let nodes = 0;
  function visit(current, depth) {
    nodes += 1;
    if (nodes > contractLimits.jsonNodes || depth > contractLimits.jsonDepth) return false;
    if (current === null || typeof current === "boolean") return true;
    if (typeof current === "number") return Number.isFinite(current);
    if (typeof current === "string") return Buffer.byteLength(current, "utf8") <= maxStringBytes;
    if (typeof current !== "object" || seen.has(current)) return false;
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false;
    seen.add(current);
    if (Array.isArray(current)) {
      if (current.length > contractLimits.collectionItems) return false;
      return current.every((item) => visit(item, depth + 1));
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > contractLimits.objectKeys || keys.some((key) => typeof key !== "string" || Buffer.byteLength(key, "utf8") > 256)) return false;
    return keys.every((key) => {
      const descriptor = descriptors[key];
      return descriptor.enumerable === true && Object.hasOwn(descriptor, "value") && visit(descriptor.value, depth + 1);
    });
  }
  try {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || !Number.isInteger(maxStringBytes) || maxStringBytes < 1 || !visit(value, 0)) return false;
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= maxBytes;
  } catch {
    return false;
  }
}

const relativePath = z.string().max(4096).refine(safeRelativePath, "must be a safe workspace-relative path");
const version = z.literal(toolContractVersion);
const shortString = z.string().min(1).max(256);
const boundedString = z.string().min(1).max(32768);
const shaOrRef = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._/@:+~-]*$/u, "must be a Git revision without leading options or shell syntax");
const jsonValue = z.lazy(() => z.union([
  z.string().max(32768),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValue).max(contractLimits.collectionItems),
  z.record(z.string().max(256), jsonValue).refine((value) => Object.keys(value).length <= contractLimits.objectKeys, "too many object keys"),
]));
const recursiveJsonObject = z.record(z.string().max(256), jsonValue)
  .refine((value) => Object.keys(value).length <= contractLimits.objectKeys, "too many object keys");
const jsonObject = z.unknown()
  .refine((value) => isBoundedJsonValue(value), "must be bounded JSON without cycles or exotic objects")
  .pipe(recursiveJsonObject);
const evidence = z.object({
  id: shortString,
  kind: z.enum(["source", "model", "finding"]),
  text: boundedString,
  file: relativePath.optional(),
  line: z.number().int().positive().optional(),
  rule_id: shortString.optional(),
}).strict();
const finding = z.object({
  contract_version: version,
  id: shortString,
  kind: shortString,
  decision: z.enum(["PASS", "BLOCK", "REVIEW"]),
  message: boundedString,
}).strict();

const explanation = z.object({
  contract_version: version,
  summary: boundedString,
  root_cause: boundedString,
  claims: z.array(z.object({
    text: boundedString,
    citations: z.array(shortString).min(1).max(64)
      .refine((citations) => new Set(citations).size === citations.length, "citations must be unique"),
    source_location: z.object({
      file: relativePath.optional(),
      line: z.number().int().positive().optional(),
      rule_id: shortString.optional(),
    }).strict().optional(),
  }).strict()).min(1).max(128),
  uncertainty: z.object({
    level: z.enum(["low", "medium", "high"]),
    reason: boundedString,
  }).strict(),
  recommended_next_action: boundedString,
  model_provenance: z.object({
    provider: shortString,
    model: shortString,
    prompt_version: shortString,
    request_hash: shortString,
  }).strict(),
}).strict();

const citationValidation = z.object({
  valid: z.literal(true),
  unsupported_claims: z.literal(0),
  issues: z.array(z.object({
    claim: z.number().int().nonnegative(),
    citation: shortString.optional(),
    message: boundedString,
  }).strict()).length(0),
}).strict();

const repairCandidate = z.object({
  contract_version: version,
  status: z.literal("PROPOSED"),
  patch: z.string().min(1).max(contractLimits.patchCharacters),
  target_files: z.array(relativePath).min(1).max(64),
  rationale: boundedString,
  expected_architecture_impact: boundedString,
  risk: z.enum(["low", "medium", "high", "critical"]),
  verification_commands: z.array(z.string().min(1).max(4096)).min(1).max(64),
  rollback: boundedString,
}).strict();

export const toolDefinitions = {
  architecture_validate: {
    title: "Validate Architecture Model",
    description: "Delegate versioned Architecture Model validation to ArchSync Core.",
    inputSchema: z.object({ contract_version: version, model_path: relativePath }).strict(),
    outputSchema: z.object({
      contract_version: version,
      valid: z.boolean(),
      issues: z.array(z.object({ path: z.string().max(4096), message: boundedString }).strict()).max(contractLimits.collectionItems),
    }).strict(),
  },
  architecture_graph: {
    title: "Read Architecture Graph",
    description: "Delegate expected and observed graph construction to Core/Guardian.",
    inputSchema: z.object({ contract_version: version, model_path: relativePath, repository_path: relativePath }).strict(),
    outputSchema: z.object({ contract_version: version, expected: jsonObject, observed: jsonObject }).strict(),
  },
  architecture_check_diff: {
    title: "Check Architecture Diff",
    description: "Delegate a Git-diff architecture decision to Guardian; never update the baseline.",
    inputSchema: z.object({
      contract_version: version,
      model_path: relativePath,
      repository_path: relativePath,
      base_revision: shaOrRef,
      head_revision: shaOrRef,
    }).strict(),
    outputSchema: z.object({
      contract_version: version,
      classification: z.enum(["no-impact", "violation", "evolution"]),
      decision: z.enum(["PASS", "BLOCK", "REVIEW"]),
      findings: z.array(jsonObject).max(contractLimits.collectionItems),
      diff: jsonObject,
    }).strict(),
  },
  architecture_explain_finding: {
    title: "Explain Architecture Finding",
    description: "Delegate evidence-grounded explanation and citation validation to Guardian Reasoner Contract 0.1.",
    inputSchema: z.object({ contract_version: version, finding, evidence: z.array(evidence).min(1).max(contractLimits.collectionItems) }).strict(),
    outputSchema: z.object({ contract_version: version, explanation, citation_validation: citationValidation }).strict(),
  },
  architecture_propose_evolution: {
    title: "Propose Architecture Evolution",
    description: "Delegate a repair/evolution proposal; output always requires a separate human approval.",
    inputSchema: z.object({
      contract_version: version,
      finding,
      desired_change: z.string().min(1).max(32768),
      target_files: z.array(relativePath).min(1).max(64),
    }).strict(),
    outputSchema: z.object({
      contract_version: version,
      proposal: repairCandidate,
      approval: z.object({ required: z.literal(true), state: z.literal("PENDING_HUMAN") }).strict(),
    }).strict(),
  },
};

export const errorCodes = new Set([
  "INVALID_ARGUMENT",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "VERSION_MISMATCH",
  "BACKEND_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "OUTPUT_REJECTED",
  "TIMEOUT",
  "INTERNAL_ERROR",
]);
