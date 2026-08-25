import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { contractLimits, errorCodes, protocolVersion, toolContractVersion, toolDefinitions, tools } from "../src/contracts.mjs";

const registry = JSON.parse(await readFile(new URL("../schemas/tools.v0.1.json", import.meta.url), "utf8"));
const quickstart = await readFile(new URL("../docs/QUICKSTART.md", import.meta.url), "utf8");
const threatModel = await readFile(new URL("../docs/security/THREAT-MODEL.md", import.meta.url), "utf8");

assert.equal(registry.schema_version, 1);
assert.equal(registry.tool_contract_version, toolContractVersion);
assert.equal(registry.mcp_protocol_version, protocolVersion);
assert.equal(registry.status, "technical-foundation-not-accepted");
assert.equal(registry.source_contracts.core_integration_commit, "503b5fe97aa39a78d5e5de80b794a94508e106cc");
assert.equal(registry.source_contracts.guardian_integration_commit, "ebaaf2711602890ef6ead8983bd33e2cf4853e17");
assert.deepEqual(registry.local_backend.real_package_tools, tools.slice(0, 3));
assert.deepEqual(registry.local_backend.provider_gated_tools, tools.slice(3));
assert.equal(registry.local_backend.workspace_symlinks, "reject");
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
assert.match(threatModel, /TECHNICAL FOUNDATION/iu);
assert.match(threatModel, /does not constitute the human security approval/iu);
console.log(`PASS MCP SCHEMAS (${tools.length} tools; protocol ${protocolVersion}; real local backend; acceptance gated)`);
