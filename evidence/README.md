# MCP technical evidence

`local-backend-evidence.json` is a deterministic, machine-verified manifest for the local Core/Guardian backend boundary. It records exact package hashes, protocol/contracts, automated controls and the gates that intentionally remain human- or provider-owned.

Regenerate it with `pnpm evidence:update` after an intentional source, dependency, schema, security-control or test change. `pnpm verify:evidence` rejects stale evidence.
