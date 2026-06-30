# Signed Provenance / Cosign Baseline

> Status: baseline (CI-visible, statically validated). This pass makes image
> **signing**, **SBOM attestation**, and **provenance** expectations explicit and
> machine-checkable **without** requiring a live registry, a Cosign installation,
> Azure, OIDC tokens, a transparency log, or any external signing service in the
> default test/build pipeline.

## Purpose

The House v2 release pipeline already builds container images and produces an
SBOM plus a vulnerability scan (see
[image-sbom-vulnerability-baseline.md](image-sbom-vulnerability-baseline.md)).
This baseline adds the next supply-chain layer: a **signed, attested provenance**
contract so that what we deploy can be cryptographically traced back to what CI
built.

It is intentionally a **baseline**, not a full SLSA attestation program. It wires
the *expectations* and *guardrails* into CI and static validation; the live
signing/verification commands are guarded, opt-in placeholders to be completed
once a real registry and protected environment are configured.

## Image targets

Signing and attestation cover the two images built from the committed
`Dockerfile`:

- `the-house-api` — the API container (`--target api`).
- `the-house-worker` — the outbox/worker container (`--target worker`).

## Signing strategy

- **Cosign keyless (Sigstore).** Signatures use a short-lived certificate issued
  by Fulcio against the workflow's OIDC identity, recorded in the Rekor
  transparency log. **No long-lived private key is generated, stored, or
  committed** to this repository.
- **Guarded + opt-in.** Live signing runs only via the
  `.github/workflows/provenance-template.yml` workflow, which is
  `workflow_dispatch`-only and skipped unless the operator types the exact
  `SIGN` confirmation phrase. Pull-request builds are **never** signed.
- **Local dry-run tooling.** `npm run image:sign` validates inputs and prints the
  exact Cosign command by default (dry run). It only executes Cosign when invoked
  with `--confirm` **and** Cosign is installed; otherwise it prints guidance and
  exits cleanly. It is never part of `npm test`.

### Digest-based signing rule

Signatures and attestations **must bind to an immutable image digest**
(`<registry>/the-house-api@sha256:<digest>`), never to a mutable tag such as
`:latest`. A tag can be repointed to a different image after signing, which would
break the chain of trust. The runner scripts (`scripts/sign-image.ts`,
`scripts/attest-sbom.ts`) **refuse tag-only references** and require an
`IMAGE_DIGEST` of the form `@sha256:<64-hex>`. The provenance workflow accepts an
`image_digest` input and passes it verbatim to Cosign.

## SBOM attestation strategy

The SPDX SBOM generated during the build is attached to the signed image as a
Cosign **attestation** (`cosign attest --type spdxjson --predicate
sbom-<target>.spdx.json <digest>`), again keyless and digest-bound. This binds
"here is the bill of materials" to the exact artifact being deployed, verifiable
later with `cosign verify-attestation`. `npm run sbom:attest` provides the same
dry-run-by-default local tooling and refuses a missing SBOM artifact or a
tag-only reference.

## Pull-request behaviour

`.github/workflows/container-build.yml` (which runs on `pull_request`):

- builds the API and worker images,
- generates an SBOM and runs a reporting-only vulnerability scan,
- **does not push, sign, or attest** anything, and **requires no secrets**.

A PR build is unsigned and unpushed by design: there is no published digest to
bind a signature to, and no registry credentials are in scope for untrusted PRs.

## workflow_dispatch (signing) behaviour

`.github/workflows/provenance-template.yml`:

- is `workflow_dispatch`-only (no `push` / `pull_request` triggers),
- is hard-guarded by `if: ${{ inputs.confirm == 'SIGN' }}`,
- requests `id-token: write` for keyless OIDC signing (no static signing key),
- signs the supplied `image_digest` and attests the supplied `sbom_artifact`,
  both bound to the digest.

It is a template: enable it only after a protected `production` environment with
required reviewers and a real registry are configured.

## Production deploy verification placeholder

`.github/workflows/production-deploy-template.yml` carries two guarded
verification gates that run **before** any container revision rolls out:

- **Verify image signature** — confirm the candidate digest has a valid Cosign
  signature (`cosign verify` against the expected Fulcio identity / OIDC issuer).
- **Verify SBOM attestation** — confirm the SPDX SBOM attestation is present and
  bound to the candidate digest (`cosign verify-attestation --type spdxjson`).

These gates are placeholders today (they echo the contract) but are positioned
in the pipeline so a future implementation cannot be skipped. They must never be
weakened with `|| true` or `continue-on-error: true`; the provenance validator
fails the build if such bypasses appear.

## Failure modes

- **Tag-only reference** → signing/attestation tooling refuses to run (the
  signature must bind to an immutable digest).
- **Missing SBOM artifact** → `sbom:attest` refuses to run; generate the SBOM
  first with `npm run sbom:generate`.
- **Cosign not installed** → confirmed runs print actionable guidance and exit
  non-zero; dry runs still succeed (they print the command without executing).
- **Verification gate bypassed** (`|| true`, `--insecure-ignore-tlog`,
  `--allow-insecure-registry`, `continue-on-error` on a verify step) → the
  static `provenance:check` validator fails.
- **Committed private key / Cosign key file** (`*.key`, `*.pem`, `cosign.key`, or
  an inline `-----BEGIN ... PRIVATE KEY-----` block) → `provenance:check` fails.

## Why the default tests don't require Cosign

`npm test`, `npm run build`, and `npm run provenance:check` are **hermetic**:
they read files and reason about presence/content only. They never call Cosign,
Sigstore, a registry, Rekor, Docker, Azure, or the network, and require no
secrets or OIDC tokens. This keeps CI fast, offline-capable, and free of external
dependencies while still proving the signing/provenance contract stays coherent.

## Why this is not a full SLSA claim

This baseline establishes signing and SBOM-attestation *expectations and
guardrails*. It deliberately does **not** claim a specific SLSA build level: it
does not yet enforce a hermetic/isolated builder, a non-falsifiable provenance
predicate produced by the build platform, a verified materials list, or a
registry admission policy. Those are follow-on work.

## Out of scope (intentionally)

- Live registry signing / pushing as part of default CI.
- Cosign admission-policy enforcement (e.g. Kyverno / policy-controller / OPA).
- A SLSA provenance certificate or attested build-level claim.
- Key-pair generation or key management (this baseline is keyless-only).
- Rekor / transparency-log retention or monitoring policy.
- Binary authorization at the Container Apps / cluster boundary.
- Continuous signature / attestation monitoring and alerting.

## Validate locally

```bash
npm run provenance:check        # static provenance/signing baseline validator
npm run ci:check                # full hermetic gate (includes provenance:check)

# Opt-in, dry-run by default (never part of npm test):
IMAGE_DIGEST=<registry>/the-house-api@sha256:<64-hex> npm run image:sign
IMAGE_DIGEST=<registry>/the-house-api@sha256:<64-hex> \
  SBOM_PATH=sbom-api.spdx.json npm run sbom:attest
```
