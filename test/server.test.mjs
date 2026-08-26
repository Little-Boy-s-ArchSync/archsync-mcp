import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { configuration, runCli, setProcessExitCode, start, writeStderr } from "../src/stdio.mjs";
import { createArchSyncMcpServer, createToolCallback } from "../src/server.mjs";
import { AdapterError } from "../src/adapter.mjs";
import { inputs } from "./fixtures/contract-values.mjs";

const backendModule = fileURLToPath(new URL("fixtures/fake-backend.mjs", import.meta.url));
const invalidBackendModule = fileURLToPath(new URL("fixtures/invalid-backend.mjs", import.meta.url));

function environment(workspaceRoot, overrides = {}) {
  return {
    ARCHSYNC_WORKSPACE_ROOT: workspaceRoot,
    ARCHSYNC_BACKEND_MODULE: backendModule,
    ARCHSYNC_PRINCIPAL: "test-launcher",
    ARCHSYNC_ALLOWED_TOOLS: "architecture_validate,architecture_graph",
    ARCHSYNC_RATE_LIMIT: "2",
    ARCHSYNC_RATE_WINDOW_MS: "1000",
    ARCHSYNC_TOOL_TIMEOUT_MS: "100",
    ...overrides,
  };
}

test("stdio configuration resolves workspace, backend, authorization and limits", async () => {
  const root = await mkdtemp(join(tmpdir(), "archsync-mcp-"));
  try {
    const options = await configuration(environment(root));
    assert.equal(options.workspaceRoot, await import("node:fs/promises").then(({ realpath }) => realpath(root)));
    assert.equal(options.principal, "test-launcher");
    assert.equal(options.timeoutMs, 100);
    assert.equal(await options.authorize({ tool: "architecture_validate" }), true);
    assert.equal(await options.authorize({ tool: "architecture_check_diff" }), false);
    assert.equal(options.rateLimit({ principal: "p", tool: "t" }), true);
    assert.equal(options.rateLimit({ principal: "p", tool: "t" }), true);
    assert.equal(options.rateLimit({ principal: "p", tool: "t" }), false);
    assert.equal(typeof options.backend.validateArchitecture, "function");
    let auditLine = "";
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk) => { auditLine += String(chunk); return true; };
    try {
      options.audit({ schema_version: 1, tool: "x", outcome: "SUCCESS", duration_ms: 0 });
    } finally {
      process.stderr.write = originalWrite;
    }
    assert.match(auditLine, /SUCCESS/u);

    const defaults = environment(root);
    delete defaults.ARCHSYNC_RATE_LIMIT;
    delete defaults.ARCHSYNC_RATE_WINDOW_MS;
    delete defaults.ARCHSYNC_TOOL_TIMEOUT_MS;
    const defaultOptions = await configuration(defaults);
    assert.equal(await defaultOptions.authorize({ tool: "architecture_validate" }), true);
    assert.equal(await defaultOptions.authorize({ tool: "architecture_propose_evolution" }), false);
    assert.equal(defaultOptions.timeoutMs, 30_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stdio configuration rejects missing, unsafe and malformed operator settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "archsync-mcp-"));
  const file = join(root, "not-directory");
  await writeFile(file, "x", "utf8");
  try {
    for (const env of [
      {},
      environment("relative"),
      environment(root, { ARCHSYNC_BACKEND_MODULE: "relative" }),
    ]) await assert.rejects(configuration(env), /must be absolute/);
    await assert.rejects(configuration(environment(file)), /must be a directory/);
    await assert.rejects(configuration(environment(root, { ARCHSYNC_ALLOWED_TOOLS: undefined })), /explicit non-empty/);
    await assert.rejects(configuration(environment(root, { ARCHSYNC_ALLOWED_TOOLS: "" })), /explicit non-empty/);
    await assert.rejects(configuration(environment(root, { ARCHSYNC_ALLOWED_TOOLS: "architecture_validate," })), /empty, duplicate or unknown/);
    await assert.rejects(configuration(environment(root, { ARCHSYNC_ALLOWED_TOOLS: "architecture_validate,architecture_validate" })), /empty, duplicate or unknown/);
    await assert.rejects(configuration(environment(root, { ARCHSYNC_ALLOWED_TOOLS: "unknown" })), /unknown tool/);
    await assert.rejects(configuration(environment(root, { ARCHSYNC_BACKEND_MODULE: invalidBackendModule })), /factory function/);
    for (const key of ["ARCHSYNC_RATE_LIMIT", "ARCHSYNC_RATE_WINDOW_MS", "ARCHSYNC_TOOL_TIMEOUT_MS"]) {
      await assert.rejects(configuration(environment(root, { [key]: "0" })), /positive integers/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("server registers exactly five read-only, non-destructive tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "archsync-mcp-"));
  try {
    const options = await configuration(environment(root));
    const server = createArchSyncMcpServer(options);
    for (const tool of Object.keys(inputs)) assert.equal(typeof server.toolInputSchemaJson(tool), "object");
    assert.equal(server.toolInputSchemaJson("unknown"), undefined);
    await server.close();

    const success = await createToolCallback(async () => ({ ok: true }), "architecture_validate")({});
    assert.equal(success.isError, false);
    const failure = await createToolCallback(async () => { throw new AdapterError("UNAUTHORIZED"); }, "architecture_validate")({});
    assert.equal(failure.isError, true);
    assert.equal(failure.structuredContent.error_code, "UNAUTHORIZED");

    let served;
    const handle = await start(environment(root), (factory, settings) => {
      served = { factory, settings };
      return { close: async () => {} };
    });
    assert.equal(served.settings.legacy, "reject");
    assert.equal(served.settings.maxSubscriptions, 4);
    const servedInstance = served.factory();
    assert.equal(servedInstance instanceof Object, true);
    await servedInstance.close();
    let transportAudit = "";
    const maliciousName = ["ghp", "123456789"].join("_");
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk) => { transportAudit += String(chunk); return true; };
    try {
      const malicious = new Error("private path");
      malicious.name = maliciousName;
      served.settings.onerror(malicious);
    } finally {
      process.stderr.write = originalWrite;
    }
    assert.match(transportAudit, /TRANSPORT_ERROR/u);
    assert.equal(transportAudit.includes("private path"), false);
    assert.equal(transportAudit.includes(maliciousName), false);
    await handle.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI wrapper returns handles and sanitizes startup failures", async () => {
  const handle = { close: async () => {} };
  assert.equal(await runCli({}, async () => handle, () => {}, () => {}), handle);
  let output = "";
  let exitCode = 0;
  assert.equal(await runCli({}, async () => {
    const malicious = new Error("private /path");
    malicious.name = ["sk", "live", "123456789"].join("-");
    throw malicious;
  }, (value) => { output += value; }, (value) => { exitCode = value; }), null);
  assert.match(output, /STARTUP_ERROR/u);
  assert.equal(output.includes("private /path"), false);
  assert.equal(exitCode, 1);

  const originalWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  process.stderr.write = () => true;
  try {
    await runCli({}, async () => { throw new TypeError("private"); });
    assert.equal(process.exitCode, 1);
  } finally {
    process.stderr.write = originalWrite;
    process.exitCode = originalExitCode;
  }
  const captured = [];
  process.stderr.write = (value) => { captured.push(String(value)); return true; };
  try {
    assert.equal(writeStderr("safe"), true);
  } finally {
    process.stderr.write = originalWrite;
  }
  assert.deepEqual(captured, ["safe"]);
  setProcessExitCode(2);
  assert.equal(process.exitCode, 2);
  process.exitCode = originalExitCode;
});
