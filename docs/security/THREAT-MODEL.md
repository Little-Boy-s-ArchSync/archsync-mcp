# MCP adapter threat model and preparatory security gate

Status: **PREPARATORY — Phase 4 contracts and security acceptance are not approved**.

## Assets and trust boundaries

Protected assets are source/model data inside one operator-authorized workspace, Core/Guardian decision integrity, provider credentials, audit integrity and human evolution authority. The launcher/operator, MCP transport, untrusted tool arguments, delegated backend and optional provider are separate trust zones. Stdio is the only implemented transport. Its caller identity and tool allowlist come from the launcher environment; model-controlled arguments cannot select a workspace, backend, principal or authorization policy.

## Threats and controls

| Threat | Enforced control | Residual / next gate |
| --- | --- | --- |
| Unauthorized tool | Mandatory explicit non-empty launcher allowlist; fail-closed injected authorization before delegation | Remote HTTP/OAuth is not implemented |
| Workspace escape | Absolute, traversal, dot, empty-segment and backslash paths rejected; canonical root injected outside arguments | Real backend must also use root-scoped filesystem APIs |
| Schema abuse | Strict bounded Zod schemas; recursive JSON type; byte/item/depth/node/key limits; current MCP SDK; five fixed names; version mismatch error | Fuzz against accepted Core/Guardian packages after freeze |
| Tool/prompt injection | Source/finding text remains data; adapter never derives PASS/BLOCK/REVIEW or human authority from prose | Real provider safety gate remains P4-127 |
| Self-approved evolution | Proposal output permits only `PROPOSED` and `PENDING_HUMAN`; read-only/non-destructive tool annotations; no baseline-write API | Repository protection and human decision record remain external |
| Credential leakage | Credentials absent from schemas/audit; raw arguments never logged; output credential canaries fail closed; transport/startup logs emit fixed codes; repository-wide credential-shape scan | Provider retention/terms and credential rotation require human security review |
| Denial of service | Fixed-window per-principal/tool rate hook, per-call timeout/abort, schema length/count bounds, SDK input buffer bound | Distributed limits needed before remote transport |
| Backend/provider failure | Sanitized stable error codes; deterministic tools remain independently callable | No real-provider claim until frozen evaluation/security sign-off |
| Contract drift | Tool registry pins exact Core and Guardian commits plus contract versions; output validates before release | Re-pin and migration review after upstream acceptance |
| Audit injection | Structured audit emits fixed keys and never includes arguments, content, paths, principal or credentials | Durable audit sink is deployment-owned |

## Gate status

Automated tests cover invalid input, version mismatch, path/revision abuse, denied access, rate limits, backend/provider failure isolation, timeout, unsafe output, citation/evidence binding, secret canaries, deterministic replay of the three deterministic tools and immutable proposal authority. This does not constitute the human security approval required by MCP-104/P4-127. Production enablement requires accepted upstream contracts, a real backend integration test (including symlink-containment and Git `--end-of-options` checks), deployment-specific authentication/authorization, provider review if explanation is enabled, and a signed security decision.
