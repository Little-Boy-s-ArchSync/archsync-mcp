#!/usr/bin/env node
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createFixedWindowRateLimiter } from "./adapter.mjs";
import { tools } from "./contracts.mjs";
import { createArchSyncMcpServer } from "./server.mjs";

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/u.test(value)) throw new Error("rate and timeout settings must be positive integers");
  return Number(value);
}

export async function configuration(environment = process.env) {
  const requestedRoot = environment.ARCHSYNC_WORKSPACE_ROOT;
  const modulePath = environment.ARCHSYNC_BACKEND_MODULE;
  const principal = environment.ARCHSYNC_PRINCIPAL;
  if (!requestedRoot || !modulePath || !principal || !isAbsolute(requestedRoot) || !isAbsolute(modulePath)) {
    throw new Error("ARCHSYNC_WORKSPACE_ROOT, ARCHSYNC_BACKEND_MODULE and ARCHSYNC_PRINCIPAL must be absolute/operator-provided");
  }
  const workspaceRoot = await realpath(requestedRoot);
  if (!(await stat(workspaceRoot)).isDirectory()) throw new Error("ARCHSYNC_WORKSPACE_ROOT must be a directory");
  const configuredTools = environment.ARCHSYNC_ALLOWED_TOOLS;
  if (typeof configuredTools !== "string" || configuredTools.length === 0) {
    throw new Error("ARCHSYNC_ALLOWED_TOOLS must be an explicit non-empty allowlist");
  }
  const requestedTools = configuredTools.split(",");
  const allowed = new Set(requestedTools);
  if (allowed.size !== requestedTools.length || requestedTools.some((tool) => !tools.includes(tool))) {
    throw new Error("ARCHSYNC_ALLOWED_TOOLS contains an empty, duplicate or unknown tool");
  }
  const module = await import(pathToFileURL(modulePath).href);
  const factory = module.createBackend ?? module.default;
  if (typeof factory !== "function") throw new Error("backend module must export a factory function");
  const backend = await factory({ workspaceRoot });
  const maxCalls = positiveInteger(environment.ARCHSYNC_RATE_LIMIT, 60);
  const windowMs = positiveInteger(environment.ARCHSYNC_RATE_WINDOW_MS, 60_000);
  const timeoutMs = positiveInteger(environment.ARCHSYNC_TOOL_TIMEOUT_MS, 30_000);
  return {
    backend,
    workspaceRoot,
    principal,
    timeoutMs,
    authorize: ({ tool }) => allowed.has(tool),
    rateLimit: createFixedWindowRateLimiter({ maxCalls, windowMs }),
    audit: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  };
}

export async function start(environment = process.env, serve = serveStdio) {
  const options = await configuration(environment);
  return serve(() => createArchSyncMcpServer(options), {
    legacy: "reject",
    maxSubscriptions: 4,
    onerror: () => process.stderr.write(`${JSON.stringify({ schema_version: 1, outcome: "TRANSPORT_ERROR", error_code: "TRANSPORT_ERROR" })}\n`),
  });
}

export function writeStderr(value) {
  return process.stderr.write(value);
}

export function setProcessExitCode(value) {
  process.exitCode = value;
}

export async function runCli(environment, startFunction = start, write = writeStderr, setExitCode = setProcessExitCode) {
  try {
    return await startFunction(environment);
  } catch {
    write(`${JSON.stringify({ schema_version: 1, outcome: "STARTUP_ERROR", error_code: "STARTUP_ERROR" })}\n`);
    setExitCode(1);
    return null;
  }
}

/* node:coverage ignore next 3 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.env);
}
