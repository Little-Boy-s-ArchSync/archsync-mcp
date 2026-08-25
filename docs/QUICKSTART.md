# Preparatory MCP adapter quickstart

This branch targets MCP protocol `2026-07-28`: stateless requests, optional `server/discover`, JSON-RPC messages over stdio, and JSON Schema 2020-12-compatible tool definitions. It intentionally rejects legacy handshakes. The server is runnable against an operator-supplied backend module, but no accepted Core/Guardian distribution is bundled yet.

The backend module must export `createBackend({ workspaceRoot })` and return the five methods documented in `schemas/tools.v0.1.json`. The launcher—not a model argument—sets the authorized workspace, backend module, principal, allowed tools, rate and timeout. `ARCHSYNC_ALLOWED_TOOLS` is mandatory and must contain an explicit non-empty allowlist; omission fails closed:

```text
ARCHSYNC_WORKSPACE_ROOT=/absolute/authorized/repository
ARCHSYNC_BACKEND_MODULE=/absolute/backend-module.mjs
ARCHSYNC_PRINCIPAL=local-caller
ARCHSYNC_ALLOWED_TOOLS=architecture_validate,architecture_graph,architecture_check_diff
ARCHSYNC_RATE_LIMIT=60
ARCHSYNC_RATE_WINDOW_MS=60000
ARCHSYNC_TOOL_TIMEOUT_MS=30000
pnpm start
```

The included fake backend is only for tests and protocol smoke checks. It is not research evidence and must not be used for a real gate. Production activation remains blocked until the pinned Phase 4 contracts are accepted and a real packaged backend is conformance-tested.

Every path supplied by a tool is workspace-relative; traversal, absolute paths and backslashes are rejected. Git revisions reject leading options and shell syntax; the real backend must additionally resolve revisions with `--end-of-options` and verify them as commits before use. Recursive JSON, strings, collections, depth, node count and total request/response bytes are bounded. Explanation output is released only when citation validation is successful and every citation is bound to the supplied evidence. Tool output is schema-validated and rejected if it contains a credential canary. Audit events contain only fixed fields and codes. `architecture_propose_evolution` can return only `PROPOSED` with `PENDING_HUMAN`; it cannot write a baseline or record a human decision.
