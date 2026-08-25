import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { contractLimits, errorCodes, protocolVersion, toolContractVersion, toolDefinitions, tools } from "../src/contracts.mjs";

const registry = JSON.parse(await readFile(new URL("../schemas/tools.v0.1.json", import.meta.url), "utf8"));
const quickstart = await readFile(new URL("../docs/QUICKSTART.md", import.meta.url), "utf8");
const threatModel = await readFile(new URL("../docs/security/THREAT-MODEL.md", import.meta.url), "utf8");

assert.equal(registry.schema_version, 1);
assert.equal(registry.tool_contract_version, toolContractVersion);
assert.equal(registry.mcp_protocol_version, protocolVersion);
assert.equal(registry.status, "preparatory-not-accepted");
assert.deepEqual(registry.tools.map(({ name }) => name), tools);
assert.deepEqual(registry.error_codes, [...errorCodes]);
assert.equal(registry.authority.baseline_write, false);
assert.equal(registry.authority.evolution_approval, false);
assert.equal(registry.authority.repair_acceptance, false);
assert.equal(registry.limits.input_bytes, contractLimits.inputBytes);
assert.equal(registry.limits.output_bytes, contractLimits.outputBytes);
assert.equal(registry.limits.json_depth, contractLimits.jsonDepth);
assert.equal(registry.explanation_release_gate.citation_validation_valid, true);
assert.equal(registry.explanation_release_gate.unsupported_claims, 0);
for (const item of registry.tools) {
  assert.ok(toolDefinitions[item.name]);
  for (const key of item.required_input) assert.ok(toolDefinitions[item.name].inputSchema.shape[key], `${item.name} input ${key}`);
  for (const key of item.required_output) assert.ok(toolDefinitions[item.name].outputSchema.shape[key], `${item.name} output ${key}`);
}
assert.match(quickstart, /MCP protocol `2026-07-28`/u);
assert.match(quickstart, /cannot write a baseline or record a human decision/iu);
assert.match(threatModel, /PREPARATORY/iu);
assert.match(threatModel, /does not constitute the human security approval/iu);
console.log(`PASS MCP SCHEMAS (${tools.length} tools; protocol ${protocolVersion}; upstream acceptance still gated)`);
