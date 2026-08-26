export function createBackend() {
  return {
    async validateArchitecture() {
      return { contract_version: "0.1", valid: true, issues: [] };
    },
    async buildArchitectureGraph() {
      return { contract_version: "0.1", expected: { nodes: ["api"] }, observed: { nodes: ["api"] } };
    },
    async checkArchitectureDiff() {
      return { contract_version: "0.1", classification: "no-impact", decision: "PASS", findings: [], diff: {} };
    },
    async explainFinding({ finding, evidence }) {
      return {
        contract_version: "0.1",
        explanation: {
          contract_version: "0.1",
          summary: finding.message,
          root_cause: "boundary bypass",
          claims: [{ text: "Evidence-bound claim", citations: [evidence[0].id] }],
          uncertainty: { level: "low", reason: "Exact fixture evidence" },
          recommended_next_action: "Review the deterministic finding",
          model_provenance: { provider: "fake", model: "fake", prompt_version: "p1", request_hash: "hash" },
        },
        citation_validation: { valid: true, unsupported_claims: 0, issues: [] },
      };
    },
    async proposeEvolution({ target_files }) {
      return {
        contract_version: "0.1",
        proposal: {
          contract_version: "0.1",
          status: "PROPOSED",
          patch: "diff --git a/src/a.ts b/src/a.ts",
          target_files,
          rationale: "Requested change",
          expected_architecture_impact: "A reviewable edge may be added",
          risk: "medium",
          verification_commands: ["pnpm test"],
          rollback: "Revert the candidate commit",
        },
        approval: { required: true, state: "PENDING_HUMAN" },
      };
    },
  };
}

export default createBackend;
