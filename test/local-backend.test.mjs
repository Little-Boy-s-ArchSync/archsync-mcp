import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import * as core from "@archsync/core";
import * as guardian from "@archsync/guardian";

import { createToolExecutor } from "../src/adapter.mjs";
import { createLocalBackend, executeGit } from "../src/local-backend.mjs";
import { inputs } from "./fixtures/contract-values.mjs";

const execFileAsync = promisify(execFile);
const architecture = `version: "0.1.1"
metadata:
  name: MCP integration fixture
components:
  frontend:
    type: frontend
    layer: experience
relationships: []
rules: []
quality_goals: []
`;

async function git(repository, ...arguments_) {
  const { stdout } = await execFileAsync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "ArchSync MCP test",
      GIT_AUTHOR_EMAIL: "mcp-test@example.invalid",
      GIT_COMMITTER_NAME: "ArchSync MCP test",
      GIT_COMMITTER_EMAIL: "mcp-test@example.invalid",
    },
  });
  return stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "archsync-mcp-real-backend-"));
  const repository = join(root, "repository");
  await mkdir(join(repository, "frontend", "src"), { recursive: true });
  await writeFile(join(root, "architecture.yaml"), architecture, "utf8");
  await writeFile(join(repository, "frontend", "src", "app.ts"), "export const render = () => 'ok';\n", "utf8");
  await git(repository, "init", "--initial-branch=main");
  await git(repository, "add", "--all");
  await git(repository, "commit", "-m", "baseline");
  const base = await git(repository, "rev-parse", "HEAD");
  await writeFile(
    join(repository, "frontend", "src", "app.ts"),
    "export async function render() { return fetch('https://payments.example/orders'); }\n",
    "utf8",
  );
  await git(repository, "add", "--all");
  await git(repository, "commit", "-m", "add observed dependency");
  const head = await git(repository, "rev-parse", "HEAD");
  return { root, repository, base, head };
}

function executor(backend, workspaceRoot) {
  return createToolExecutor({
    backend,
    workspaceRoot,
    principal: "real-package-test",
    authorize: async () => true,
    rateLimit: async () => true,
    timeoutMs: 30_000,
  });
}

test("pinned Core and Guardian packages execute deterministic local tools", async () => {
  const item = await fixture();
  const gitArguments = [];
  try {
    const backend = await createLocalBackend({
      workspaceRoot: item.root,
      git: async (arguments_, signal) => {
        gitArguments.push([...arguments_]);
        return executeGit(arguments_, signal);
      },
    });
    const execute = executor(backend, item.root);
    assert.deepEqual(await execute("architecture_validate", {
      ...inputs.architecture_validate,
      model_path: "architecture.yaml",
    }), { contract_version: "0.1", valid: true, issues: [] });

    const graphInput = {
      ...inputs.architecture_graph,
      model_path: "architecture.yaml",
      repository_path: "repository",
    };
    const graph = await execute("architecture_graph", graphInput);
    assert.deepEqual(graph.expected.nodes.map(({ id }) => id), ["frontend"]);
    assert.equal(graph.observed.components.frontend.component.type, "frontend");
    assert.deepEqual(await execute("architecture_graph", graphInput), graph);

    const diffInput = {
      ...inputs.architecture_check_diff,
      model_path: "architecture.yaml",
      repository_path: "repository",
      base_revision: item.base,
      head_revision: "HEAD",
    };
    const diff = await execute("architecture_check_diff", diffInput);
    assert.equal(diff.diff.base_sha, item.base);
    assert.equal(diff.diff.head_sha, item.head);
    assert.equal(diff.diff.changed_files.some(({ path }) => path === "frontend/src/app.ts"), true);
    assert.deepEqual(await execute("architecture_check_diff", diffInput), diff);

    const revisionCalls = gitArguments.filter((arguments_) => arguments_.includes("rev-parse") && arguments_.includes("--verify"));
    assert.equal(revisionCalls.length, 4);
    assert.equal(revisionCalls.every((arguments_) => arguments_.at(-2) === "--end-of-options"), true);
    assert.equal(gitArguments.some((arguments_) => arguments_[0] === "clone" && arguments_.includes("--end-of-options")), true);
    const checkoutCalls = gitArguments.filter((arguments_) => arguments_.includes("checkout"));
    assert.equal(checkoutCalls.length, 2);
    assert.equal(checkoutCalls.every((arguments_) => !arguments_.includes("--end-of-options")), true);
    assert.equal(checkoutCalls.every((arguments_) => /^[a-f0-9]{40}$/u.test(arguments_.at(-1))), true);
    assert.equal(gitArguments.some((arguments_) => arguments_.includes("core.hooksPath")), true);
    assert.equal(gitArguments.some((arguments_) => arguments_.includes("core.fsmonitor") && arguments_.at(-1) === "false"), true);

    for (const tool of ["architecture_explain_finding", "architecture_propose_evolution"]) {
      await assert.rejects(execute(tool, inputs[tool]), (error) => error.code === "PROVIDER_UNAVAILABLE");
    }
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("local backend rejects symlinks, escapes, invalid models and invalid Git ranges", async () => {
  const item = await fixture();
  try {
    const backend = await createLocalBackend({ workspaceRoot: item.root });
    await writeFile(join(item.root, "invalid.yaml"), "not: an architecture\n", "utf8");
    const invalid = await backend.validateArchitecture({ model_path: "invalid.yaml" });
    assert.equal(invalid.contract_version, "0.1");
    assert.equal(invalid.valid, false);
    assert.equal(invalid.issues.some(({ path }) => path === "/version"), true);
    await assert.rejects(backend.buildArchitectureGraph({
      model_path: "invalid.yaml",
      repository_path: "repository",
    }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.validateArchitecture({ model_path: "missing.yaml" }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.validateArchitecture({ model_path: "../architecture.yaml" }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.validateArchitecture({ model_path: "/architecture.yaml" }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.validateArchitecture({ model_path: "..\\architecture.yaml" }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.validateArchitecture({ model_path: "repository" }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.buildArchitectureGraph({
      model_path: "architecture.yaml",
      repository_path: "architecture.yaml",
    }), (error) => error.code === "INVALID_ARGUMENT");

    await symlink(join(item.root, "architecture.yaml"), join(item.root, "linked.yaml"));
    await assert.rejects(backend.validateArchitecture({ model_path: "linked.yaml" }), (error) => error.code === "INVALID_ARGUMENT");
    const sourceLink = join(item.repository, "frontend", "src", "linked.ts");
    await symlink(join(item.repository, "frontend", "src", "app.ts"), sourceLink);
    await assert.rejects(backend.buildArchitectureGraph({
      model_path: "architecture.yaml",
      repository_path: "repository",
    }), (error) => error.code === "INVALID_ARGUMENT");
    await rm(sourceLink);

    await assert.rejects(backend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "repository",
      base_revision: "does-not-exist",
      head_revision: "HEAD",
    }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "repository",
      base_revision: "--help",
      head_revision: "HEAD",
    }), (error) => error.code === "INVALID_ARGUMENT");
    await assert.rejects(backend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "repository",
      base_revision: item.head,
      head_revision: item.base,
    }), (error) => error.code === "INVALID_ARGUMENT");

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(backend.validateArchitecture({
      model_path: "architecture.yaml",
      signal: controller.signal,
    }), (error) => error.name === "AbortError");
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("local backend validates its pinned package and runner boundary", async () => {
  const item = await fixture();
  try {
    await assert.rejects(createLocalBackend({ workspaceRoot: "relative" }), /absolute/u);
    await assert.rejects(createLocalBackend({ workspaceRoot: join(item.root, "architecture.yaml") }), /directory/u);
    for (const name of ["loadArchitecture", "buildGraph"]) {
      await assert.rejects(createLocalBackend({
        workspaceRoot: item.root,
        core: { ...core, [name]: undefined },
      }), new RegExp(name, "u"));
    }
    for (const name of ["analyzeTypeScriptRepository", "checkRepositoryDiff"]) {
      await assert.rejects(createLocalBackend({
        workspaceRoot: item.root,
        guardian: { ...guardian, [name]: undefined },
      }), new RegExp(name, "u"));
    }
    await assert.rejects(createLocalBackend({ workspaceRoot: item.root, git: null }), /runner/u);

    const notRepository = join(item.root, "not-a-repository");
    await mkdir(notRepository);
    const backend = await createLocalBackend({ workspaceRoot: item.root });
    await assert.rejects(backend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "not-a-repository",
      base_revision: "HEAD",
      head_revision: "HEAD",
    }), (error) => error.code === "INVALID_ARGUMENT");

    const invalidCommitBackend = await createLocalBackend({
      workspaceRoot: item.root,
      git: async (arguments_) => arguments_.includes("--show-toplevel") ? `${item.repository}\n` : "not-a-commit\n",
    });
    await assert.rejects(invalidCommitBackend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "repository",
      base_revision: "HEAD",
      head_revision: "HEAD",
    }), (error) => error.code === "INVALID_ARGUMENT");

    const escapedRootBackend = await createLocalBackend({
      workspaceRoot: item.root,
      git: async () => `${tmpdir()}\n`,
    });
    await assert.rejects(escapedRootBackend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "repository",
      base_revision: "HEAD",
      head_revision: "HEAD",
    }), (error) => error.code === "INVALID_ARGUMENT");

    const cloneFailureBackend = await createLocalBackend({
      workspaceRoot: item.root,
      git: async (arguments_, signal) => {
        if (arguments_[0] === "clone") throw new Error("clone unavailable");
        return executeGit(arguments_, signal);
      },
    });
    await assert.rejects(cloneFailureBackend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "repository",
      base_revision: item.base,
      head_revision: item.head,
    }), (error) => error.code === "INVALID_ARGUMENT" && !error.message.includes("clone"));
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("diff analysis contains repository subdirectories and historical symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "archsync-mcp-subdirectory-"));
  const repository = join(root, "packages", "app");
  const source = join(repository, "frontend", "src");
  try {
    await mkdir(source, { recursive: true });
    await writeFile(join(root, "architecture.yaml"), architecture, "utf8");
    await writeFile(join(source, "app.ts"), "export const render = () => 'ok';\n", "utf8");
    await git(root, "init", "--initial-branch=main");
    await git(root, "add", "--all");
    await git(root, "commit", "-m", "baseline");
    const base = await git(root, "rev-parse", "HEAD");
    await writeFile(join(source, "app.ts"), "export const render = () => 'changed';\n", "utf8");
    await git(root, "add", "--all");
    await git(root, "commit", "-m", "head");
    const cleanHead = await git(root, "rev-parse", "HEAD");

    const backend = await createLocalBackend({ workspaceRoot: root });
    const output = await backend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "packages/app",
      base_revision: base,
      head_revision: cleanHead,
    });
    assert.equal(output.diff.head_sha, cleanHead);

    await symlink(join(source, "app.ts"), join(source, "historical.ts"));
    await git(root, "add", "--all");
    await git(root, "commit", "-m", "historical symlink");
    const symlinkHead = await git(root, "rev-parse", "HEAD");
    await rm(join(source, "historical.ts"));
    await git(root, "add", "--all");
    await git(root, "commit", "-m", "remove symlink");
    await assert.rejects(backend.checkArchitectureDiff({
      model_path: "architecture.yaml",
      repository_path: "packages/app",
      base_revision: cleanHead,
      head_revision: symlinkHead,
    }), (error) => error.code === "INVALID_ARGUMENT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
