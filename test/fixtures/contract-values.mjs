export const finding = {
  contract_version: "0.1",
  id: "finding-1",
  kind: "unexpected-relationship",
  decision: "BLOCK",
  message: "frontend bypasses gateway",
};

export const evidence = [{ id: "e-1", kind: "source", text: "fetch(payment)", file: "src/a.ts", line: 1, rule_id: "ARCH-001" }];

export const inputs = {
  architecture_validate: { contract_version: "0.1", model_path: "architecture.yaml" },
  architecture_graph: { contract_version: "0.1", model_path: "architecture.yaml", repository_path: "packages/app" },
  architecture_check_diff: { contract_version: "0.1", model_path: "architecture.yaml", repository_path: "packages/app", base_revision: "main~1", head_revision: "HEAD" },
  architecture_explain_finding: { contract_version: "0.1", finding, evidence },
  architecture_propose_evolution: { contract_version: "0.1", finding, desired_change: "Route through gateway", target_files: ["src/a.ts"] },
};

export const outputs = {
  architecture_validate: { contract_version: "0.1", valid: true, issues: [] },
  architecture_graph: { contract_version: "0.1", expected: {}, observed: {} },
  architecture_check_diff: { contract_version: "0.1", classification: "violation", decision: "BLOCK", findings: [{}], diff: {} },
  architecture_explain_finding: {
    contract_version: "0.1",
    explanation: {
      contract_version: "0.1",
      summary: "A summary",
      root_cause: "A cause",
      claims: [{ text: "A claim", citations: ["e-1"], source_location: { file: "src/a.ts", line: 1, rule_id: "ARCH-001" } }],
      uncertainty: { level: "low", reason: "Exact evidence" },
      recommended_next_action: "Review",
      model_provenance: { provider: "fake", model: "fake", prompt_version: "p1", request_hash: "hash" },
    },
    citation_validation: { valid: true, unsupported_claims: 0, issues: [] },
  },
  architecture_propose_evolution: {
    contract_version: "0.1",
    proposal: {
      contract_version: "0.1",
      status: "PROPOSED",
      patch: "diff",
      target_files: ["src/a.ts"],
      rationale: "reason",
      expected_architecture_impact: "impact",
      risk: "low",
      verification_commands: ["pnpm test"],
      rollback: "revert",
    },
    approval: { required: true, state: "PENDING_HUMAN" },
  },
};
