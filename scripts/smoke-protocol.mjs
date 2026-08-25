import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = join(root, "test", "fixtures", "local-workspace");
const metadata = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "archsync-smoke", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
const messages = [
  { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: metadata } },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: metadata } },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "architecture_validate",
      arguments: { contract_version: "0.1", model_path: "architecture.yaml" },
      _meta: metadata,
    },
  },
];

const child = spawn(process.execPath, [join(root, "src", "stdio.mjs")], {
  cwd: root,
  shell: false,
  windowsHide: true,
  env: {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    ARCHSYNC_WORKSPACE_ROOT: workspaceRoot,
    ARCHSYNC_BACKEND_MODULE: join(root, "src", "local-backend.mjs"),
    ARCHSYNC_PRINCIPAL: "protocol-smoke",
    ARCHSYNC_ALLOWED_TOOLS: "architecture_validate",
  },
  stdio: ["pipe", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill(), 10_000);
child.stdin.end(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`);
const [code] = await once(child, "close");
clearTimeout(timeout);
assert.equal(code, 0, stderr);

const responses = stdout.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
assert.equal(responses.length, 3);
assert.deepEqual(responses.map(({ id }) => id), [1, 2, 3]);
assert.deepEqual(responses[0].result.supportedVersions, ["2026-07-28"]);
assert.equal(responses[0].result.resultType, "complete");
assert.equal(responses[1].result.tools.length, 5);
assert.equal(responses[1].result.tools.every((tool) => tool.annotations.readOnlyHint === true && tool.annotations.destructiveHint === false), true);
assert.deepEqual(responses[2].result.structuredContent, { contract_version: "0.1", valid: true, issues: [] });

const audits = stderr.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
assert.equal(audits.length, 1);
assert.deepEqual(Object.keys(audits[0]).sort(), ["duration_ms", "outcome", "schema_version", "tool"]);
assert.equal(audits[0].outcome, "SUCCESS");
assert.equal(stderr.includes("architecture.yaml"), false);
console.log("PASS MCP 2026-07-28 STDIO (discover, list five tools, real Core validation, safe audit)");
