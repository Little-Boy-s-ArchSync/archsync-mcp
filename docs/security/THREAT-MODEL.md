# MCP adapter threat model and preparatory security gate

Status: **TECHNICAL FOUNDATION — upstream contracts and human security acceptance are not approved**.

## Assets and trust boundaries

Protected assets are source/model data inside one operator-authorized workspace, Core/Guardian decision integrity, provider credentials, audit integrity and human evolution authority. The launcher/operator, MCP transport, untrusted tool arguments, delegated backend and optional provider are separate trust zones. Stdio is the only implemented transport. Its caller identity and tool allowlist come from the launcher environment; model-controlled arguments cannot select a workspace, backend, principal or authorization policy.

## Threats and controls

| Threat | Enforced control | Residual / next gate |
| --- | --- | --- |
| Unauthorized tool | Mandatory explicit non-empty launcher allowlist; fail-closed injected authorization before delegation | Remote HTTP/OAuth is not implemented |
| Workspace escape | Absolute, traversal, dot, empty-segment and backslash paths rejected; every component is checked; canonical containment enforced; repository trees and detached snapshots reject symlinks recursively | Filesystem race hardening beyond Node path primitives remains deployment-owned |
| Schema abuse | Strict bounded Zod schemas; recursive JSON type; byte/item/depth/node/key limits; current MCP SDK; five fixed names; version mismatch error | Fuzz against accepted Core/Guardian packages after freeze |
| Tool/prompt injection | Source/finding text remains data; adapter never derives PASS/BLOCK/REVIEW or human authority from prose | Real provider safety gate remains P4-127 |
| Self-approved evolution | Proposal output permits only `PROPOSED` and `PENDING_HUMAN`; read-only/non-destructive tool annotations; no baseline-write API | Repository protection and human decision record remain external |
| Credential leakage | Credentials absent from schemas/audit; raw arguments never logged; output credential canaries fail closed; transport/startup logs emit fixed codes; repository-wide credential-shape scan | Provider retention/terms and credential rotation require human security review |
| Denial of service | Fixed-window per-principal/tool rate hook, per-call timeout/abort, schema length/count bounds, SDK input buffer bound | Distributed limits needed before remote transport |
| Git option/path injection | Strict revision syntax; shell-free argument arrays; `--end-of-options` commit verification and checkout; exact base/head analysis in a temporary local clone with hooks and filesystem monitors disabled | Non-ancestor ranges fail closed; remote repositories are never cloned |
| Backend/provider failure | Sanitized stable error codes; three real-package deterministic tools remain independently callable; two provider tools fail closed by default | No real-provider claim until frozen evaluation/security sign-off |
| Contract drift | Tool registry and hash manifest pin Core PR #3 and Guardian integration PR #8 artifacts plus contract versions; output validates before release | Re-pin and migration review after upstream acceptance |
| Audit injection | Structured audit emits fixed keys and never includes arguments, content, paths, principal or credentials | Durable audit sink is deployment-owned |

## Gate status

Automated tests cover invalid input, version mismatch, path/revision abuse, denied access, rate limits, backend/provider failure isolation, timeout, unsafe output, citation/evidence binding, secret canaries, deterministic replay, historical and live symlink rejection, Git `--end-of-options` argument inspection, exact base/head analysis through real Core/Guardian packages and an offline packed-consumer install. This does not constitute the human security approval required by MCP-104/P4-127. Production enablement still requires accepted upstream contracts, deployment-specific authentication/authorization, provider review if explanation/proposal is enabled, and a signed security decision.
