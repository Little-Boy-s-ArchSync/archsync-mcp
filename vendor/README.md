# Pinned backend packages

The local backend uses exact, reviewable package artifacts rather than a registry range:

- `archsync-core-0.1.1-integration-503b5fe.tgz` is built from Core PR #3 commit `503b5fe97aa39a78d5e5de80b794a94508e106cc`.
- `archsync-guardian-0.3.3-integration-e41a868.tgz` is built from Guardian integration PR #8 commit `e41a868382aeb99e5f8700c21442eee04621a51a`; its active dependency is the same Core integration line. This artifact includes the combined operational, Phase 4, Phase 5 and Phase 6 technical foundations, portable provider redaction/budget hardening and the cross-platform repair-verification normalization.

Hashes and the acceptance boundary are machine checked in `provenance.json`. These artifacts are technical integration inputs, not accepted releases or human/security approvals.
