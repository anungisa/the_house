# V6-48 - House P0 Protection and Implementation-Evidence Matrix

Document ID: V6-48
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G5)

## V6-48.1 Purpose and scope

This section is normative.

This chapter records the House priority-zero (P0) protection matrix: the set of
protection findings that Volume 6 defines as the minimum protection posture the
House platform must eventually satisfy and evidence. Each finding is a definition
with a required future control and a required future evidence class. This chapter
authorizes no implementation, closes no finding, and must never be read as
remediation. Every finding is defined but not implemented and not proven.

## V6-48.2 P0 finding record

This section is normative.

For every P0 finding, the matrix records the following attributes: the P0 finding;
the protected asset or right; the threat; the required control; the authority
input; any privacy dependency; any accessibility or bilingual dependency; the
operational evidence; the future test class; the required environment; the
implementation evidence; the independent-assurance dependency; the definition
status; the implementation status; and the future blocking gate. Each finding is
recorded in REG-604 (TEST-V6-022 through TEST-V6-035) and projected by the
deterministic final-closure tooling (V6-51) into the House P0 protection-coverage
report. The required posture of every finding is: definition status DEFINED;
implementation status not-implemented or not-proven.

## V6-48.3 P0 findings

This section is normative.

The House P0 protection matrix comprises the following fourteen findings:

1. Resource-aware authorization: every governed access decision must evaluate the
   full governed resource context and fail closed on missing context.
2. Assigned reviewer and jurisdiction: a review decision must require an assigned
   reviewer with reviewer scope and the correct jurisdiction.
3. Evidence binding and restricted-evidence protection: governed evidence must be
   bound to its case and protected under restricted-evidence controls.
4. Production dependency completeness: every production dependency required for a
   governed decision must be present and verified before the decision is trusted.
5. Affiliation lifecycle authorization: every affiliation lifecycle transition must
   be authorized through the governance kernel and never mutate governed state
   directly.
6. Versioned policy and requirement protection: every governed decision must
   resolve to a versioned policy and protect the integrity of that requirement.
7. Return and resubmission history: every return and resubmission must be recorded
   as immutable history.
8. Authoritative activation uniqueness and replay protection: activation must be
   unique and protected against replay.
9. Fail-closed configuration: missing or invalid governed configuration must fail
   closed.
10. Outbox protection and publication evidence: the transactional outbox must be
    protected and its publication evidenced.
11. PostgreSQL behavioural verification: governed data behaviour must be verified
    against the real data platform, not assumed.
12. Production composition verification: the composed production system must be
    verified, not only its parts.
13. Deployment-path verification: the actual deployment path must be verified.
14. Secrets and environment configuration: secrets and environment configuration
    must be consumed only by the actual entry points that require them.

## V6-48.4 Protected assets and rights

This section is normative.

Each P0 finding names the governed asset or right it protects, drawn from the
protection catalogue — governed affiliation records (ASSET-V6-001), personal
identity data (ASSET-V6-002), authentication and secret material (ASSET-V6-003),
evidence artifacts and metadata (ASSET-V6-004), the audit journal (ASSET-V6-005),
privileged administrative capability (ASSET-V6-007), service and workload identity
(ASSET-V6-009), configuration and policy-definition data (ASSET-V6-010), and the
governed rights they serve. No asset or right is added here.

## V6-48.5 Evidence and environment discipline

This section is normative.

Each P0 finding records the operational evidence, required environment,
implementation evidence, and independent-assurance dependency that a future volume
must satisfy. Behavioural, composition, deployment-path, and secrets findings
require a real environment for their proof and cannot be evidenced by definition
alone. No evidence is produced here, and coverage of a finding by this matrix must
never be represented as implementation or remediation of the finding.

## V6-48.6 Future validation

This section is normative.

Each P0 finding carries a future test class and a future blocking gate in a
downstream volume. No finding references a completed gate. The future blocking gate
for testing and operational-proof findings is the future testing gate (V9-G1) or
the executive material-commitment gate (EXEC-MCG), as recorded per finding in
REG-604.

## V6-48.7 Explicit non-authorizations

This section is normative.

This chapter implements no control; remediates no finding; creates no executable
authorization rule, kernel transition, configuration, outbox mechanism, test,
deployment path, or secret-handling mechanism; verifies no behaviour, composition,
or deployment; produces no operational or implementation evidence; makes no
operational-readiness or assurance claim; and authorizes no implementation. It
records definitions only.
