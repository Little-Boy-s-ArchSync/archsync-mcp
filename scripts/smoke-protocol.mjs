import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = join(root, "test", "fixtures", "local-workspace");
const metadata = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "archsync-smoke", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

function git(repository, arguments_) {
  return execFileSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "ArchSync MCP smoke",
      GIT_AUTHOR_EMAIL: "mcp-smoke@example.invalid",
      GIT_COMMITTER_NAME: "ArchSync MCP smoke",
      GIT_COMMITTER_EMAIL: "mcp-smoke@example.invalid",
    },
  }).trim();
}

const temporary = await mkdtemp(join(tmpdir(), "archsync-mcp-protocol-"));
const workspaceRoot = join(temporary, "workspace");
const repository = join(workspaceRoot, "repository");
try {
  await cp(fixture, workspaceRoot, { recursive: true });
  git(repository, ["init", "--initial-branch=main"]);
  git(repository, ["add", "--all"]);
  git(repository, ["commit", "-m", "protocol baseline"]);
  const base = git(repository, ["rev-parse", "HEAD"]);
  await writeFile(
    join(repository, "frontend", "src", "app.ts"),
    "export const render = () => \"protocol-smoke-updated\";\n",
    "utf8",
  );
  git(repository, ["add", "--all"]);
  git(repository, ["commit", "-m", "protocol head"]);
  const head = git(repository, ["rev-parse", "HEAD"]);

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
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "architecture_graph",
        arguments: {
          contract_version: "0.1",
          model_path: "architecture.yaml",
          repository_path: "repository",
        },
        _meta: metadata,
      },
    },
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "architecture_check_diff",
        arguments: {
          contract_version: "0.1",
          model_path: "architecture.yaml",
          repository_path: "repository",
          base_revision: base,
          head_revision: head,
        },
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
      ARCHSYNC_ALLOWED_TOOLS: "architecture_validate,architecture_graph,architecture_check_diff",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill(), 20_000);
  child.stdin.end(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`);
  const [code] = await once(child, "close");
  clearTimeout(timeout);
  assert.equal(code, 0, stderr);

  const responses = stdout.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(responses.length, 5);
  assert.deepEqual(responses.map(({ id }) => id), [1, 2, 3, 4, 5]);
  assert.deepEqual(responses[0].result.supportedVersions, ["2026-07-28"]);
  assert.equal(responses[0].result.resultType, "complete");
  assert.equal(responses[1].result.tools.length, 5);
  assert.equal(responses[1].result.tools.every((tool) => tool.annotations.readOnlyHint === true && tool.annotations.destructiveHint === false), true);
  assert.deepEqual(responses[2].result.structuredContent, { contract_version: "0.1", valid: true, issues: [] });
  assert.deepEqual(responses[3].result.structuredContent.expected.nodes.map(({ id }) => id), ["frontend"]);
  assert.equal(responses[3].result.structuredContent.observed.metadata.scanned_files, 1);
  assert.equal(responses[4].result.structuredContent.decision, "PASS");
  assert.equal(responses[4].result.structuredContent.diff.base_sha, base);
  assert.equal(responses[4].result.structuredContent.diff.head_sha, head);

  const audits = stderr.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(audits.length, 3);
  assert.equal(audits.every((event) => (
    JSON.stringify(Object.keys(event).sort()) === JSON.stringify(["duration_ms", "outcome", "schema_version", "tool"])
    && event.outcome === "SUCCESS"
  )), true);
  assert.equal(stderr.includes("architecture.yaml"), false);
  assert.equal(stderr.includes(workspaceRoot), false);
  console.log("PASS MCP 2026-07-28 STDIO (discover, five tools, three real deterministic calls, safe audits)");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
