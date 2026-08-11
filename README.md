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
