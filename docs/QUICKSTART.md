# Preparatory MCP adapter quickstart

This branch targets MCP protocol `2026-07-28`: stateless requests, optional `server/discover`, JSON-RPC messages over stdio, and JSON Schema 2020-12-compatible tool definitions. It intentionally rejects legacy handshakes. A real local backend is included and pinned to exact provisional Core/Guardian integration packages; those packages are not accepted releases.

The backend module must export `createBackend({ workspaceRoot })` and return the five methods documented in `schemas/tools.v0.1.json`. The launcher—not a model argument—sets the authorized workspace, backend module, principal, allowed tools, rate and timeout. `ARCHSYNC_ALLOWED_TOOLS` is mandatory and must contain an explicit non-empty allowlist; omission fails closed:

```text
ARCHSYNC_WORKSPACE_ROOT=/absolute/authorized/repository
ARCHSYNC_BACKEND_MODULE=/absolute/archsync-mcp/src/local-backend.mjs
ARCHSYNC_PRINCIPAL=local-caller
ARCHSYNC_ALLOWED_TOOLS=architecture_validate,architecture_graph,architecture_check_diff
ARCHSYNC_RATE_LIMIT=60
ARCHSYNC_RATE_WINDOW_MS=60000
ARCHSYNC_TOOL_TIMEOUT_MS=30000
pnpm start
```

The included local backend runs `architecture_validate`, `architecture_graph` and `architecture_check_diff` with the real pinned packages. `architecture_explain_finding` and `architecture_propose_evolution` return `PROVIDER_UNAVAILABLE` because no provider or credential is configured. The fake backend remains confined to adapter unit tests and is not research evidence; the live protocol smoke uses the real local backend. `pnpm verify` tests the real backend and an offline packed install; this technical evidence is not upstream acceptance or a human security decision.

Every path supplied by a tool is workspace-relative; traversal, absolute paths and backslashes are rejected. The backend validates every path component, enforces canonical workspace containment and recursively rejects symlinks before Core/Guardian scan. Git revisions reject leading options and shell syntax, are passed without a shell, and are resolved with `--end-of-options` to exact commits. Diff analysis requires the base to be an ancestor of the requested head and checks out the exact head in a temporary local clone outside the authorized workspace. Repository hooks and filesystem-monitor commands are disabled in that clone, which is removed after the call.

Recursive JSON, strings, collections, depth, node count and total request/response bytes are bounded. Explanation output is released only when citation validation is successful and every citation is bound to the supplied evidence. Tool output is schema-validated and rejected if it contains a credential canary. Audit events contain only fixed fields and codes. `architecture_propose_evolution` can return only `PROPOSED` with `PENDING_HUMAN`; it cannot write a baseline or record a human decision.
