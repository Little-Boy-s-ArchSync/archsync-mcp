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

The schemas, thin stdio transport, injected authorization/rate hooks, delegated backend interface, safety boundary and tests are implemented. Production activation remains blocked until the pinned Core/Guardian and Phase 4 reasoner/repair contracts are accepted. No real backend artifact is bundled, and this repository cannot record an evolution approval or update an architecture baseline.

## Boundary verification

Run `pnpm verify` to validate the machine-readable ownership/delegation policy, five versioned tool schemas, current MCP server registration, threat controls and full unit/integration suite. The boundary check rejects duplicated conformance decisions, architecture self-approval/baseline writes, or credential-shaped values anywhere in tracked/proposed files. See [`docs/QUICKSTART.md`](docs/QUICKSTART.md) for the operator-supplied backend contract and [`docs/security/THREAT-MODEL.md`](docs/security/THREAT-MODEL.md) for the explicit residual gates.
