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

The thin adapter now includes a real local execution backend pinned to exact Core and Guardian integration package artifacts. Automated conformance proves deterministic validation, graph and exact base/head diff execution, plus packaged offline installation. Provider-backed explanation/proposal execution, upstream acceptance, deployment controls and human security approval remain intentionally blocked. The boundary CI prevents schemas or adapter code from silently broadening authority.
