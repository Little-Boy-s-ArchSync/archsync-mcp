import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("evidence/local-backend-evidence.json", root);
const provenance = JSON.parse(await readFile(new URL("vendor/provenance.json", root), "utf8"));
const inputs = [
  "boundary-policy.json",
  "package.json",
  "pnpm-lock.yaml",
  "schemas/tools.v0.1.json",
  "scripts/package-install-e2e.mjs",
  "scripts/smoke-protocol.mjs",
  "scripts/verify-dependencies.mjs",
  "src/adapter.mjs",
  "src/contracts.mjs",
  "src/local-backend.mjs",
  "test/local-backend.test.mjs",
  "docs/security/THREAT-MODEL.md",
  "vendor/provenance.json",
];

const artifacts = {};
for (const path of inputs) {
  const content = await readFile(new URL(path, root));
  artifacts[path] = createHash("sha256").update(content).digest("hex");
}

const evidence = {
  schema_version: 1,
  status: "technical-foundation-not-accepted",
  mcp_protocol_version: "2026-07-28",
  tool_contract_version: "0.1",
  package_boundary: Object.fromEntries(Object.entries(provenance.packages).map(([name, value]) => [name, {
    version: value.version,
    source_commit: value.source_commit,
    sha256: value.sha256,
    ...(value.package_content_sha256 ? { package_content_sha256: value.package_content_sha256 } : {}),
  }])),
  automated_scope: {
    real_package_tools: ["architecture_validate", "architecture_graph", "architecture_check_diff"],
    provider_gated_tools: ["architecture_explain_finding", "architecture_propose_evolution"],
    controls: [
      "canonical workspace containment",
      "recursive symlink rejection",
      "safe Git argv with --end-of-options revision resolution",
      "detached local clone for exact base/head analysis",
      "temporary-clone hooks and filesystem monitor disabled",
      "default-deny provider execution",
      "no baseline write or evolution approval authority",
    ],
  },
  authority: {
    accepted_release: false,
    security_approved: false,
    provider_enabled: false,
    research_evidence: false,
    human_evolution_approval: false,
  },
  artifacts,
};
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (process.argv.includes("--write")) {
  await writeFile(output, serialized, "utf8");
  console.log("WROTE MCP LOCAL BACKEND EVIDENCE");
} else {
  assert.equal(await readFile(output, "utf8"), serialized);
  console.log("PASS MCP LOCAL BACKEND EVIDENCE (real packages; human/provider gates preserved)");
}
