import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "archsync-mcp-package-"));
const packageDirectory = join(temporary, "package");
const consumer = join(temporary, "consumer");
const workspace = join(consumer, "workspace");
const repository = join(workspace, "repository", "frontend", "src");

function run(executable, arguments_, cwd, environment = process.env) {
  const result = spawnSync(executable, arguments_, {
    cwd,
    encoding: "utf8",
    env: environment,
    shell: false,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `${executable} ${arguments_.join(" ")}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  );
  return result.stdout;
}

function runPackageManager(name, arguments_, cwd, environment = process.env) {
  if (process.platform !== "win32") return run(name, arguments_, cwd, environment);
  const cli = name === "pnpm"
    ? process.env.npm_execpath
    : join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  assert.ok(cli, `${name} CLI path is unavailable`);
  return run(process.execPath, [cli, ...arguments_], cwd, environment);
}

try {
  await mkdir(packageDirectory, { recursive: true });
  await mkdir(repository, { recursive: true });
  runPackageManager("pnpm", ["pack", "--pack-destination", packageDirectory], root);
  const archiveName = (await readdir(packageDirectory)).find((name) => name.endsWith(".tgz"));
  assert.ok(archiveName, "pnpm pack must create an MCP tarball");
  const archive = join(packageDirectory, archiveName);

  await writeFile(join(consumer, "package.json"), JSON.stringify({
    name: "archsync-mcp-package-consumer",
    private: true,
    type: "module",
  }), "utf8");
  await writeFile(join(workspace, "architecture.yaml"), `version: "0.1.1"
metadata:
  name: Packed MCP fixture
components:
  frontend:
    type: frontend
    layer: experience
relationships: []
rules: []
quality_goals: []
`, "utf8");
  await writeFile(join(repository, "app.ts"), "export const render = () => 'packed';\n", "utf8");
  await writeFile(join(consumer, "verify.mjs"), `
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createBackend } from "@archsync/mcp/local-backend";

const backend = await createBackend({ workspaceRoot: fileURLToPath(new URL("workspace/", import.meta.url)) });
assert.deepEqual(await backend.validateArchitecture({ model_path: "architecture.yaml" }), {
  contract_version: "0.1",
  valid: true,
  issues: [],
});
const graph = await backend.buildArchitectureGraph({
  model_path: "architecture.yaml",
  repository_path: "repository",
});
assert.deepEqual(graph.expected.nodes.map(({ id }) => id), ["frontend"]);
assert.equal(graph.observed.metadata.scanned_files, 1);
await assert.rejects(backend.explainFinding(), (error) => error.code === "PROVIDER_UNAVAILABLE");
console.log("PACKED_LOCAL_BACKEND_OK");
`, "utf8");

  const installEnvironment = {
    ...process.env,
    npm_config_cache: join(temporary, "npm-cache"),
  };
  runPackageManager("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", archive], consumer, installEnvironment);
  const output = run(process.execPath, ["verify.mjs"], consumer, installEnvironment);
  assert.match(output, /PACKED_LOCAL_BACKEND_OK/u);

  const installed = JSON.parse(await readFile(join(consumer, "node_modules", "@archsync", "mcp", "package.json"), "utf8"));
  assert.equal(installed.version, "0.1.0-preparatory");
  assert.deepEqual(installed.bundledDependencies.sort(), [
    "@archsync/core",
    "@archsync/guardian",
    "@modelcontextprotocol/server",
    "zod",
  ]);
  console.log("PASS MCP PACKED INSTALL (offline consumer; real local Core/Guardian backend)");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
