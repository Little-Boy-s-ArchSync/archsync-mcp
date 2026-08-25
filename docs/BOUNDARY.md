# MCP boundary

## Owns

- MCP tool definitions and transport.
- Input/output schemas for agent integrations.
- Authentication and rate-limit concerns at the adapter boundary.

## Does not own

- Architecture validation.
- Drift detection or policy decisions.
- Repair verification.
- Architecture baseline updates.

## Enforced invariants

The adapter must not duplicate Core conformance rules, must not auto-approve an evolution, and must not update an architecture baseline. It must reject reads or writes outside the caller-authorized workspace and redact secrets from every diagnostic/audit event. `boundary-policy.json` is the machine-readable ownership map; `pnpm verify` prevents implementation from crossing these invariants.

Implementation remains intentionally blocked until the versioned Phase 4 Explanation and Repair Candidate contracts are accepted. The boundary CI is active now so later schema or adapter changes cannot silently broaden authority.
