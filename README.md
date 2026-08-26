# ArchSync MCP

The future Model Context Protocol adapter for exposing verified ArchSync capabilities to coding agents and developer tools.

## Repository boundary

This repository is an interface layer. It must call Guardian/Core APIs and must not duplicate conformance rules, graph logic or Architecture Model ownership.

## Planned tools

- `architecture_validate`
- `architecture_graph`
- `architecture_check_diff`
- `architecture_explain_finding`
- `architecture_propose_evolution`

Implementation starts only after the deterministic Guardian Core has a stable finding contract.

## Boundary verification

Run `pnpm verify` to validate the machine-readable ownership/delegation policy and reject duplicated conformance decisions, architecture auto-approval/baseline writes, or committed credential patterns. Every pull request runs this as an independent least-privilege status check. This prepares CI-102 without claiming MCP-101 or implementation readiness before Phase 4 contracts exist.
