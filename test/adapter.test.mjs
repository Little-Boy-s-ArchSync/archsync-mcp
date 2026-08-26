import assert from "node:assert/strict";
import test from "node:test";

import { AdapterError, createFixedWindowRateLimiter, createToolExecutor, toToolError, toToolResult } from "../src/adapter.mjs";
import { inputs, outputs } from "./fixtures/contract-values.mjs";

function backend(overrides = {}) {
  return {
    validateArchitecture: async () => structuredClone(outputs.architecture_validate),
    buildArchitectureGraph: async () => structuredClone(outputs.architecture_graph),
    checkArchitectureDiff: async () => structuredClone(outputs.architecture_check_diff),
    explainFinding: async () => structuredClone(outputs.architecture_explain_finding),
    proposeEvolution: async () => structuredClone(outputs.architecture_propose_evolution),
    ...overrides,
  };
}

function executor(overrides = {}) {
  return createToolExecutor({
    backend: backend(),
    workspaceRoot: "/authorized/workspace",
    principal: "local-launcher",
    authorize: async () => true,
    rateLimit: async () => true,
    timeoutMs: 100,
    ...overrides,
  });
}

test("fixed-window limiter isolates principal/tool and resets deterministically", () => {
  let time = 100;
  const limit = createFixedWindowRateLimiter({ maxCalls: 2, windowMs: 10, now: () => time });
  assert.equal(limit({ principal: "a", tool: "x" }), true);
  assert.equal(limit({ principal: "a", tool: "x" }), true);
  assert.equal(limit({ principal: "a", tool: "x" }), false);
  assert.equal(limit({ principal: "a", tool: "y" }), true);
  assert.equal(limit({ principal: "b", tool: "x" }), true);
  time = 110;
  assert.equal(limit({ principal: "a", tool: "x" }), true);
  for (const invalid of [
    { maxCalls: 0, windowMs: 1 },
    { maxCalls: 1.5, windowMs: 1 },
    { maxCalls: 1, windowMs: 0 },
    { maxCalls: 1, windowMs: 1.5 },
    { maxCalls: 1, windowMs: 1, now: null },
  ]) assert.throws(() => createFixedWindowRateLimiter(invalid), /invalid/);
});

test("executor delegates each tool without duplicating Core or Guardian decisions", async () => {
  const calls = [];
  const fake = backend({
    validateArchitecture: async (input) => { calls.push(input); return structuredClone(outputs.architecture_validate); },
  });
  const audit = [];
  let time = 10;
  const execute = executor({ backend: fake, audit: (event) => audit.push(event), now: () => time++ });
  for (const tool of ["architecture_validate", "architecture_graph", "architecture_check_diff"]) {
    const first = await execute(tool, inputs[tool]);
    assert.deepEqual(await execute(tool, inputs[tool]), first, `${tool} must replay exactly`);
  }
  for (const tool of ["architecture_explain_finding", "architecture_propose_evolution"]) {
    assert.deepEqual(await execute(tool, inputs[tool]), outputs[tool]);
  }
  assert.equal(calls[0].workspace_root, "/authorized/workspace");
  assert.equal(calls[0].signal instanceof AbortSignal, true);
  assert.equal(audit.length, 8);
  assert.equal(audit.every((event) => !Object.hasOwn(event, "arguments") && event.outcome === "SUCCESS"), true);
});

test("executor rejects invalid version, authorization and rate before delegation", async () => {
  await assert.rejects(executor()("unknown", {}), (error) => error.code === "INVALID_ARGUMENT");
  await assert.rejects(executor()("architecture_validate", null), (error) => error.code === "INVALID_ARGUMENT");
  await assert.rejects(executor()("architecture_validate", "not-an-object"), (error) => error.code === "INVALID_ARGUMENT");
  const cyclicInput = {};
  cyclicInput.self = cyclicInput;
  await assert.rejects(executor()("architecture_validate", cyclicInput), (error) => error.code === "INVALID_ARGUMENT");
  await assert.rejects(executor()("architecture_validate", { ...inputs.architecture_validate, contract_version: "9" }), (error) => error.code === "VERSION_MISMATCH");
  await assert.rejects(executor({ authorize: async () => false })("architecture_validate", inputs.architecture_validate), (error) => error.code === "UNAUTHORIZED");
  await assert.rejects(executor({ rateLimit: async () => false })("architecture_validate", inputs.architecture_validate), (error) => error.code === "RATE_LIMITED");
});

test("backend timeout, failure, provider and output errors fail closed", async () => {
  await assert.rejects(executor({
    backend: backend({ validateArchitecture: async () => new Promise(() => {}) }),
    timeoutMs: 5,
  })("architecture_validate", inputs.architecture_validate), (error) => error.code === "TIMEOUT");
  await assert.rejects(executor({
    backend: backend({ validateArchitecture: async () => { throw new Error("private /path"); } }),
  })("architecture_validate", inputs.architecture_validate), (error) => error.code === "BACKEND_UNAVAILABLE" && !error.message.includes("/path"));
  const providerIsolation = executor({
    backend: backend({ explainFinding: async () => { throw new AdapterError("PROVIDER_UNAVAILABLE"); } }),
  });
  await assert.rejects(providerIsolation("architecture_explain_finding", inputs.architecture_explain_finding), (error) => error.code === "PROVIDER_UNAVAILABLE");
  assert.deepEqual(await providerIsolation("architecture_validate", inputs.architecture_validate), outputs.architecture_validate);
  await assert.rejects(executor({
    backend: backend({ validateArchitecture: async () => ({ contract_version: "0.1", valid: "yes", issues: [] }) }),
  })("architecture_validate", inputs.architecture_validate), (error) => error.code === "OUTPUT_REJECTED");
  const cyclicOutput = { contract_version: "0.1", valid: true, issues: [] };
  cyclicOutput.self = cyclicOutput;
  await assert.rejects(executor({
    backend: backend({ validateArchitecture: async () => cyclicOutput }),
  })("architecture_validate", inputs.architecture_validate), (error) => error.code === "OUTPUT_REJECTED");
  await assert.rejects(executor({
    backend: backend({ validateArchitecture: async () => ({ contract_version: "0.1", valid: false, issues: [{ path: "x", message: ["ghp", "123456789"].join("_") }] }) }),
  })("architecture_validate", inputs.architecture_validate), (error) => error.code === "OUTPUT_REJECTED");
});

test("explanation release is bound to supplied evidence and valid citations", async () => {
  const missing = structuredClone(outputs.architecture_explain_finding);
  missing.explanation.claims[0].citations = ["not-supplied"];
  await assert.rejects(executor({ backend: backend({ explainFinding: async () => missing }) })(
    "architecture_explain_finding", inputs.architecture_explain_finding,
  ), (error) => error.code === "OUTPUT_REJECTED");

  for (const [field, value] of [["file", "src/other.ts"], ["line", 2], ["rule_id", "ARCH-999"]]) {
    const mismatch = structuredClone(outputs.architecture_explain_finding);
    mismatch.explanation.claims[0].source_location[field] = value;
    await assert.rejects(executor({ backend: backend({ explainFinding: async () => mismatch }) })(
      "architecture_explain_finding", inputs.architecture_explain_finding,
    ), (error) => error.code === "OUTPUT_REJECTED");
  }

  const noLocation = structuredClone(outputs.architecture_explain_finding);
  delete noLocation.explanation.claims[0].source_location;
  assert.deepEqual(await executor({ backend: backend({ explainFinding: async () => noLocation }) })(
    "architecture_explain_finding", inputs.architecture_explain_finding,
  ), noLocation);

  const invalidValidation = structuredClone(outputs.architecture_explain_finding);
  invalidValidation.citation_validation = { valid: false, unsupported_claims: 1, issues: [] };
  await assert.rejects(executor({ backend: backend({ explainFinding: async () => invalidValidation }) })(
    "architecture_explain_finding", inputs.architecture_explain_finding,
  ), (error) => error.code === "OUTPUT_REJECTED");

  const duplicate = structuredClone(outputs.architecture_explain_finding);
  duplicate.explanation.claims[0].citations = ["e-1", "e-1"];
  await assert.rejects(executor({ backend: backend({ explainFinding: async () => duplicate }) })(
    "architecture_explain_finding", inputs.architecture_explain_finding,
  ), (error) => error.code === "OUTPUT_REJECTED");
});

test("unexpected policy and audit failures are sanitized", async () => {
  const execute = executor({
    authorize: async () => { throw new Error("authorization internals"); },
    audit: () => { throw new Error("audit sink"); },
    now: (() => { let value = 10; return () => value--; })(),
  });
  await assert.rejects(execute("architecture_validate", inputs.architecture_validate), (error) => error.code === "INTERNAL_ERROR" && !error.message.includes("internals"));
  const unknown = new AdapterError("NOT_A_CODE", new Error("private"));
  assert.equal(unknown.code, "INTERNAL_ERROR");
  assert.equal(unknown.message.includes("private"), false);
});

test("adapter configuration and MCP result envelopes are strict", () => {
  assert.throws(() => createToolExecutor({ backend: null }), /backend/);
  assert.throws(() => createToolExecutor({ backend: {} }), /missing/);
  const base = {
    backend: backend(), workspaceRoot: "/w", principal: "p", authorize: () => true, rateLimit: () => true, audit: () => {}, timeoutMs: 1, now: Date.now,
  };
  for (const changes of [
    { workspaceRoot: "" }, { principal: "" }, { authorize: null }, { rateLimit: null }, { audit: null }, { timeoutMs: 0 }, { timeoutMs: 1.5 }, { now: null },
  ]) assert.throws(() => createToolExecutor({ ...base, ...changes }), /configuration/);

  assert.deepEqual(toToolResult({ ok: true }), {
    content: [{ type: "text", text: "{\"ok\":true}" }], structuredContent: { ok: true }, isError: false,
  });
  const known = toToolError(new AdapterError("UNAUTHORIZED"));
  assert.equal(known.isError, true);
  assert.equal(known.structuredContent.error_code, "UNAUTHORIZED");
  const unknown = toToolError(new Error("private"));
  assert.equal(unknown.structuredContent.error_code, "INTERNAL_ERROR");
  assert.equal(unknown.content[0].text.includes("private"), false);
});
