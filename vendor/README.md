# Pinned backend packages

The local backend uses exact, reviewable package artifacts rather than a registry range:

- `archsync-core-0.1.1-integration-503b5fe.tgz` is built from Core PR #3 commit `503b5fe97aa39a78d5e5de80b794a94508e106cc`.
- `archsync-guardian-0.3.3-integration-5ac01f1.tgz` is the final mandatory-filesystem-isolation package built from Guardian integration PR #8 commit `5ac01f1fa5b008103f274612b9aa9f602b111fae`; its active dependency is the same Core integration line. Both its outer tarball hash and internal canonical package-content digest are checked.

Hashes and the acceptance boundary are machine checked in `provenance.json`. These artifacts are technical integration inputs, not accepted releases or human/security approvals.
