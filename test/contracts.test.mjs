import assert from "node:assert/strict";
import test from "node:test";

import { contractLimits, errorCodes, isBoundedJsonValue, protocolVersion, safeRelativePath, toolContractVersion, toolDefinitions, tools } from "../src/contracts.mjs";

export const finding = {
  contract_version: "0.1",
  id: "finding-1",
  kind: "unexpected-relationship",
  decision: "BLOCK",
  message: "frontend bypasses gateway",
};

export const evidence = [{ id: "e-1", kind: "source", text: "fetch(payment)", file: "src/a.ts", line: 1, rule_id: "ARCH-001" }];

export const inputs = {
  architecture_validate: { contract_version: "0.1", model_path: "architecture.yaml" },
  architecture_graph: { contract_version: "0.1", model_path: "architecture.yaml", repository_path: "packages/app" },
  architecture_check_diff: { contract_version: "0.1", model_path: "architecture.yaml", repository_path: "packages/app", base_revision: "main~1", head_revision: "HEAD" },
  architecture_explain_finding: { contract_version: "0.1", finding, evidence },
  architecture_propose_evolution: { contract_version: "0.1", finding, desired_change: "Route through gateway", target_files: ["src/a.ts"] },
};

export const outputs = {
  architecture_validate: { contract_version: "0.1", valid: true, issues: [] },
  architecture_graph: { contract_version: "0.1", expected: {}, observed: {} },
  architecture_check_diff: { contract_version: "0.1", classification: "violation", decision: "BLOCK", findings: [{}], diff: {} },
  architecture_explain_finding: {
    contract_version: "0.1",
    explanation: {
      contract_version: "0.1",
      summary: "A summary",
      root_cause: "A cause",
      claims: [{ text: "A claim", citations: ["e-1"], source_location: { file: "src/a.ts", line: 1, rule_id: "ARCH-001" } }],
      uncertainty: { level: "low", reason: "Exact evidence" },
      recommended_next_action: "Review",
      model_provenance: { provider: "fake", model: "fake", prompt_version: "p1", request_hash: "hash" },
    },
    citation_validation: { valid: true, unsupported_claims: 0, issues: [] },
  },
  architecture_propose_evolution: {
    contract_version: "0.1",
    proposal: {
      contract_version: "0.1",
      status: "PROPOSED",
      patch: "diff",
      target_files: ["src/a.ts"],
      rationale: "reason",
      expected_architecture_impact: "impact",
      risk: "low",
      verification_commands: ["pnpm test"],
      rollback: "revert",
    },
    approval: { required: true, state: "PENDING_HUMAN" },
  },
};

test("tool registry pins the current MCP and ArchSync contract revisions", () => {
  assert.equal(protocolVersion, "2026-07-28");
  assert.equal(toolContractVersion, "0.1");
  assert.equal(tools.length, 5);
  assert.deepEqual(Object.keys(toolDefinitions), tools);
  assert.equal(errorCodes.size, 9);
  for (const tool of tools) {
    assert.equal(toolDefinitions[tool].inputSchema.safeParse(inputs[tool]).success, true, tool);
    assert.equal(toolDefinitions[tool].outputSchema.safeParse(outputs[tool]).success, true, tool);
  }
});

test("workspace paths and Git revisions reject traversal and shell syntax", () => {
  for (const path of ["src/a.ts", "packages/app", "architecture.yaml"]) assert.equal(safeRelativePath(path), true);
  for (const path of [null, "", "/tmp/x", "../x", "a/../x", "a//x", "./x", "a\\x"]) assert.equal(safeRelativePath(path), false);
  assert.equal(toolDefinitions.architecture_check_diff.inputSchema.safeParse({ ...inputs.architecture_check_diff, base_revision: "main;rm" }).success, false);
  assert.equal(toolDefinitions.architecture_check_diff.inputSchema.safeParse({ ...inputs.architecture_check_diff, base_revision: "--help" }).success, false);
  assert.equal(toolDefinitions.architecture_validate.inputSchema.safeParse({ ...inputs.architecture_validate, extra: true }).success, false);
});

test("recursive JSON limits reject cycles, exotic values and resource abuse", () => {
  assert.equal(isBoundedJsonValue({ nested: [null, true, 1, "ok"] }), true);
  assert.equal(isBoundedJsonValue(Object.assign(Object.create(null), { ok: false })), true);
  for (const value of [undefined, () => {}, 1n, Number.POSITIVE_INFINITY, new Date(0)]) {
    assert.equal(isBoundedJsonValue(value), false);
  }
  assert.equal(isBoundedJsonValue(new Proxy({}, { getPrototypeOf: () => { throw new Error("trap"); } })), false);
  assert.equal(isBoundedJsonValue("é", { maxStringBytes: 1 }), false);
  assert.equal(isBoundedJsonValue("abcd", { maxBytes: 2, maxStringBytes: 10 }), false);
  assert.equal(isBoundedJsonValue([], { maxBytes: 0 }), false);
  assert.equal(isBoundedJsonValue([], { maxBytes: 1.5 }), false);
  assert.equal(isBoundedJsonValue([], { maxStringBytes: 0 }), false);
  assert.equal(isBoundedJsonValue([], { maxStringBytes: 1.5 }), false);

  const cycle = {};
  cycle.self = cycle;
  assert.equal(isBoundedJsonValue(cycle), false);
  assert.equal(isBoundedJsonValue(Array(contractLimits.collectionItems + 1).fill(null)), false);
  assert.equal(isBoundedJsonValue([undefined]), false);
  assert.equal(isBoundedJsonValue(Object.fromEntries(Array.from({ length: contractLimits.objectKeys + 1 }, (_, index) => [`k${index}`, null]))), false);
  assert.equal(isBoundedJsonValue({ [Symbol("hidden")]: true }), false);
  assert.equal(isBoundedJsonValue({ ["x".repeat(257)]: true }), false);

  const hidden = {};
  Object.defineProperty(hidden, "x", { value: true, enumerable: false });
  assert.equal(isBoundedJsonValue(hidden), false);
  const accessor = {};
  Object.defineProperty(accessor, "x", { get: () => true, enumerable: true });
  assert.equal(isBoundedJsonValue(accessor), false);
  assert.equal(isBoundedJsonValue({ bad: undefined }), false);

  let deep = null;
  for (let index = 0; index <= contractLimits.jsonDepth; index += 1) deep = [deep];
  assert.equal(isBoundedJsonValue(deep), false);
  const broad = Array.from({ length: contractLimits.collectionItems }, () => Array(16).fill(null));
  assert.equal(isBoundedJsonValue(broad), false);

  assert.equal(toolDefinitions.architecture_graph.outputSchema.safeParse({
    contract_version: "0.1",
    expected: { nested: { ok: true }, values: [null, 1, "x"] },
    observed: {},
  }).success, true);
  assert.equal(toolDefinitions.architecture_graph.outputSchema.safeParse({
    contract_version: "0.1",
    expected: { nested: Object.fromEntries(Array.from({ length: contractLimits.objectKeys + 1 }, (_, index) => [`k${index}`, null])) },
    observed: {},
  }).success, false);

  for (const bad of [cycle, { date: new Date(0) }, { bad: undefined }, { huge: Array(contractLimits.collectionItems + 1).fill(null) }]) {
    assert.equal(toolDefinitions.architecture_graph.outputSchema.safeParse({ contract_version: "0.1", expected: bad, observed: {} }).success, false);
  }
});

test("reasoner and proposal schemas reject unsupported evidence and authority", () => {
  assert.equal(toolDefinitions.architecture_explain_finding.inputSchema.safeParse({ ...inputs.architecture_explain_finding, evidence: [] }).success, false);
  assert.equal(toolDefinitions.architecture_explain_finding.outputSchema.safeParse({ ...outputs.architecture_explain_finding, explanation: { contract_version: "0.1" } }).success, false);
  assert.equal(toolDefinitions.architecture_propose_evolution.outputSchema.safeParse({
    ...outputs.architecture_propose_evolution,
    proposal: { ...outputs.architecture_propose_evolution.proposal, status: "VERIFIED_FOR_REVIEW" },
  }).success, false);
  assert.equal(toolDefinitions.architecture_propose_evolution.outputSchema.safeParse({
    ...outputs.architecture_propose_evolution,
    approval: { required: false, state: "ACCEPTED" },
  }).success, false);
  assert.equal(toolDefinitions.architecture_explain_finding.outputSchema.safeParse({
    ...outputs.architecture_explain_finding,
    citation_validation: { valid: false, unsupported_claims: 1, issues: [] },
  }).success, false);
  assert.equal(toolDefinitions.architecture_propose_evolution.outputSchema.safeParse({
    ...outputs.architecture_propose_evolution,
    proposal: { ...outputs.architecture_propose_evolution.proposal, patch: "x".repeat(contractLimits.patchCharacters + 1) },
  }).success, false);
});
