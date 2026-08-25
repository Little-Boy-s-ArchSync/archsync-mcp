# ArchSync MCP

The preparatory Model Context Protocol adapter for exposing verified ArchSync capabilities to coding agents and developer tools. It targets current MCP revision `2026-07-28` through the official TypeScript server SDK 2.0.0.

## Repository boundary

This repository is an interface layer. It must call Guardian/Core APIs and must not duplicate conformance rules, graph logic or Architecture Model ownership.

## Preparatory tools

- `architecture_validate`
- `architecture_graph`
- `architecture_check_diff`
- `architecture_explain_finding`
- `architecture_propose_evolution`

The schemas, thin stdio transport, injected authorization/rate hooks, delegated backend interface and safety boundary are implemented. The included local backend executes the three deterministic tools through exact Core PR #3 and Guardian integration PR #8 package artifacts. It canonically contains workspace paths, rejects symlinks recursively, resolves Git revisions as commits with safe argument arrays and `--end-of-options`, and evaluates an exact base/head pair in an isolated local clone.

The explanation and evolution-proposal tools remain provider-gated and fail closed by default. Production activation still requires upstream acceptance, deployment authentication/authorization, provider review where applicable and human security approval. This repository cannot record an evolution approval or update an architecture baseline.

## Boundary verification

Run `pnpm verify` to validate the machine-readable ownership/delegation policy, five versioned tool schemas, current MCP server registration, exact dependency hashes, real-package conformance, threat controls, deterministic evidence and an offline packed-consumer install. The boundary check rejects duplicated conformance decisions, architecture self-approval/baseline writes, symlinked repository content or credential-shaped values anywhere in tracked/proposed files. See [`docs/QUICKSTART.md`](docs/QUICKSTART.md) for local operation and [`docs/security/THREAT-MODEL.md`](docs/security/THREAT-MODEL.md) for the explicit residual gates.
