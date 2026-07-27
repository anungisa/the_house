# Volume 9 — Requirements, Responses, Attestations, Evidence, and Completeness Test Definition

Document ID: V9-14
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter defines the test obligations for affiliation requirements, responses,
attestations, evidence, and completeness. It defines test requirements and
scenarios only and authorizes no execution.

## Requirement and response versioning

Requirements and their responses are versioned governed inputs. The definition
holds that a response is bound to a specific requirement version, and that a
response submitted against a superseded requirement version is stale and must be
rejected. The versioning obligation carries positive, negative, stale, and conflict
test obligations so that a stale or conflicting response is detected rather than
silently accepted.

## Evidence and restricted disclosure

Evidence attached to a requirement response may be sensitive or restricted.
Restricted-evidence access and disclosure carry explicit test obligations: access
is granted only to an authorized actor within the correct tenant and jurisdiction,
and a governed query must never permit cross-tenant disclosure of restricted
evidence. A denial scenario records that an unauthorized disclosure attempt is
denied and fails closed. No test data requirement names real production data; all
evidence used in a future test is synthetic or otherwise governed.

## Completeness is derived

Completeness is a derived determination recalculated from the governed responses,
attestations, and evidence. It is never stored as an independent mutable claim. A
functional test obligation records that completeness is recalculated
deterministically from governed inputs, and that a stored completeness value that
diverges from recalculation is detected and fails closed. This preserves the
institutional invariant that governed state is not directly mutated outside the
kernel.

## Scenario coverage

The scenario coverage for this domain includes a stale-state scenario for a
superseded requirement version and a denial scenario for restricted-evidence
disclosure. Each scenario names its actor, contexts, disposition, and governed
oracle.

## Forward disposition

Every requirement and scenario names a forward gate, points at no completed gate,
and authorizes no implementation or execution.
