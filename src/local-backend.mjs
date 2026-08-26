import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import * as corePackage from "@archsync/core";
import * as guardianPackage from "@archsync/guardian";

import { AdapterError } from "./adapter.mjs";
import { safeRelativePath } from "./contracts.mjs";

const execFileAsync = promisify(execFile);
const commitPattern = /^[a-f0-9]{40}$/u;
const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._/@:+~-]*$/u;

function invalid(cause) {
  return new AdapterError("INVALID_ARGUMENT", cause);
}

function contained(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function abort(signal) {
  signal?.throwIfAborted();
}

export async function executeGit(arguments_, signal) {
  const { stdout } = await execFileAsync("git", arguments_, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
    windowsHide: true,
    signal,
  });
  return stdout;
}

async function workspacePath(root, requested, kind, signal) {
  abort(signal);
  if (!safeRelativePath(requested)) throw invalid();
  const candidate = resolve(root, ...requested.split("/"));
  // Preserve a lexical containment assertion after the stricter relative-path gate.
  /* node:coverage ignore next */
  if (!contained(root, candidate)) throw invalid();
  let current = root;
  for (const segment of requested.split("/")) {
    current = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      throw invalid(error);
    }
    if (metadata.isSymbolicLink()) throw invalid();
  }
  const canonical = await realpath(candidate);
  // Retain the post-lstat containment check for a race that deterministic tests cannot induce.
  /* node:coverage ignore next */
  if (!contained(root, canonical)) throw invalid();
  const metadata = await stat(canonical);
  if ((kind === "file" && !metadata.isFile()) || (kind === "directory" && !metadata.isDirectory())) {
    throw invalid();
  }
  return canonical;
}

async function rejectSymlinks(directory, signal) {
  abort(signal);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw invalid();
    if (entry.isDirectory()) await rejectSymlinks(path, signal);
  }
}

function requireArchitecture(result) {
  if (!result.valid || !result.value) throw invalid();
  return result.value;
}

function jsonGraph(graph) {
  return {
    schema_version: graph.schema_version,
    nodes: [...graph.nodes.values()],
    edges: [...graph.edges],
  };
}

function plainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function commit(repository, revision, git, signal) {
  if (typeof revision !== "string" || !revisionPattern.test(revision)) throw invalid();
  let output;
  try {
    output = await git([
      "-C",
      repository,
      "rev-parse",
      "--verify",
      "--quiet",
      "--end-of-options",
      `${revision}^{commit}`,
    ], signal);
  } catch (error) {
    throw invalid(error);
  }
  const value = output.trim();
  if (!commitPattern.test(value)) throw invalid();
  return value;
}

async function repositoryContext(workspaceRoot, repositoryPath, git, signal) {
  const repository = await workspacePath(workspaceRoot, repositoryPath, "directory", signal);
  await rejectSymlinks(repository, signal);
  let root;
  try {
    root = await realpath((await git([
      "-C",
      repository,
      "rev-parse",
      "--show-toplevel",
    ], signal)).trim());
  } catch (error) {
    throw invalid(error);
  }
  if (!contained(workspaceRoot, root) || !contained(root, repository)) throw invalid();
  return { repository, root, subdirectory: relative(root, repository) };
}

async function rejectGitTreeSymlinks(repository, revision, subdirectory, git, signal) {
  const scope = subdirectory.replaceAll("\\", "/") || ".";
  const tree = await git([
    "-C",
    repository,
    "ls-tree",
    "-r",
    "-z",
    "--full-tree",
    revision,
    "--",
    scope,
  ], signal);
  for (const record of tree.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\t");
    const metadata = record.slice(0, separator);
    if (metadata.startsWith("120000 ")) throw invalid();
  }
}

function diffOutput(result, baseSha, headSha) {
  return plainJson({
    contract_version: "0.1",
    classification: result.classification,
    decision: result.decision,
    findings: result.introduced_findings,
    diff: {
      base_sha: baseSha,
      head_sha: headSha,
      changed_files: result.changed_files,
      affected_components: result.affected_components,
      architecture_delta: result.architecture_delta,
      resolved_findings: result.resolved_findings,
      baseline: result.baseline,
      head: result.head,
      pre_existing_findings: result.pre_existing_findings,
    },
  });
}

export async function createLocalBackend({
  workspaceRoot,
  core = corePackage,
  guardian = guardianPackage,
  git = executeGit,
} = {}) {
  if (typeof workspaceRoot !== "string" || !isAbsolute(workspaceRoot)) throw new Error("workspaceRoot must be absolute");
  const root = await realpath(workspaceRoot);
  if (!(await stat(root)).isDirectory()) throw new Error("workspaceRoot must be a directory");
  for (const [name, value] of Object.entries({
    loadArchitecture: core.loadArchitecture,
    buildGraph: core.buildGraph,
    analyzeTypeScriptRepository: guardian.analyzeTypeScriptRepository,
    checkRepositoryDiff: guardian.checkRepositoryDiff,
  })) {
    if (typeof value !== "function") throw new Error(`pinned backend package is missing ${name}`);
  }
  if (typeof git !== "function") throw new Error("git runner must be a function");

  return {
    async validateArchitecture({ model_path: modelPath, signal }) {
      const model = await workspacePath(root, modelPath, "file", signal);
      const result = await core.loadArchitecture(model);
      return {
        contract_version: "0.1",
        valid: result.valid,
        issues: result.issues.map(({ path, message }) => ({ path, message })),
      };
    },

    async buildArchitectureGraph({ model_path: modelPath, repository_path: repositoryPath, signal }) {
      const model = await workspacePath(root, modelPath, "file", signal);
      const repository = await workspacePath(root, repositoryPath, "directory", signal);
      await rejectSymlinks(repository, signal);
      const expected = requireArchitecture(await core.loadArchitecture(model));
      const observed = await guardian.analyzeTypeScriptRepository(repository, expected);
      abort(signal);
      return plainJson({ contract_version: "0.1", expected: jsonGraph(core.buildGraph(expected)), observed });
    },

    async checkArchitectureDiff({
      model_path: modelPath,
      repository_path: repositoryPath,
      base_revision: baseRevision,
      head_revision: headRevision,
      signal,
    }) {
      const model = await workspacePath(root, modelPath, "file", signal);
      const expected = requireArchitecture(await core.loadArchitecture(model));
      const context = await repositoryContext(root, repositoryPath, git, signal);
      const baseSha = await commit(context.root, baseRevision, git, signal);
      const headSha = await commit(context.root, headRevision, git, signal);
      const mergeBase = (await git(["-C", context.root, "merge-base", baseSha, headSha], signal)).trim();
      if (mergeBase !== baseSha) throw invalid();
      await rejectGitTreeSymlinks(context.root, baseSha, context.subdirectory, git, signal);
      await rejectGitTreeSymlinks(context.root, headSha, context.subdirectory, git, signal);

      const temporary = await mkdtemp(join(tmpdir(), "archsync-mcp-diff-"));
      const clone = join(temporary, "repository");
      const disabledHooks = join(temporary, "disabled-hooks");
      try {
        await mkdir(disabledHooks, { recursive: true });
        await git([
          "clone",
          "--local",
          "--no-hardlinks",
          "--no-checkout",
          "--end-of-options",
          context.root,
          clone,
        ], signal);
        await git(["-C", clone, "config", "--local", "core.hooksPath", disabledHooks], signal);
        await git(["-C", clone, "config", "--local", "core.fsmonitor", "false"], signal);
        await git([
          "-C",
          clone,
          "checkout",
          "--detach",
          "--force",
          "--end-of-options",
          headSha,
        ], signal);
        const repository = context.subdirectory ? join(clone, context.subdirectory) : clone;
        await rejectSymlinks(repository, signal);
        const result = await guardian.checkRepositoryDiff(expected, repository, {
          base_ref: baseSha,
          use_cache: false,
        });
        abort(signal);
        return diffOutput(result, baseSha, headSha);
      } catch (error) {
        throw invalid(error);
      /* node:coverage ignore next */
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },

    async explainFinding() {
      throw new AdapterError("PROVIDER_UNAVAILABLE");
    },

    async proposeEvolution() {
      throw new AdapterError("PROVIDER_UNAVAILABLE");
    },
  };
}

export const createBackend = createLocalBackend;
export default createLocalBackend;
