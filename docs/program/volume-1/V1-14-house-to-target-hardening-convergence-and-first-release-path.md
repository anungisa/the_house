# V1-14 - The House to Target: Hardening, Convergence, and First-Release Path

Document ID: V1-14  
Title: The House to Target: Hardening, Convergence, and First-Release Path  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-C, REG-108 APP-V1-020)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G3)  
Supersedes: None  
Review Cycle: Frozen at Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-14.1 Purpose

This section is normative.

This chapter answers the central Package 3 question - which parts of The House
should be retained and hardened, which require adaptation or rebuilding, and what
exact gaps prevent the first complete affiliation release - and states a release-
wave hypothesis for Package 4 to test. It authorizes nothing; every disposition
carries `authorizes_implementation: false` (REG-106).

## V1-14.2 Retain and harden (adopt as-is, prove under load)

This section is normative.

The following are demonstrated production value and are retained; hardening means
proving them at ladder rung 7 (integration test) and rung 8 (deployed wiring), not
rebuilding them:

- **Governance Kernel** - transition algorithm, four-layer idempotency,
  exactly-once approved execution (CAP-019 ADOPT / QD-019; FND-032).
- **Forced-RLS tenant isolation** (CAP-021 RETAIN / QD-021).
- **Named guard registry** with perfect seed-to-handler parity (CAP-022 / QD-022).
- **Transactional outbox** mechanism - leasing, full jitter, no sessions (CAP-020
  RETAIN / QD-020; harden by defaulting a real publisher, FND-030).
- **Idempotency enforcement** (CAP-028 / QD-028).
- **Reference registries** - organization, participant, facility (CAP-027 /
  QD-027).
- **Fail-closed configuration and secret providers** (CAP-029 / QD-029) and the
  **deployment/qualification validators** (CAP-030 / QD-030) - retained on source
  evidence, proven only when an environment is deployed (FND-029).

## V1-14.3 Adapt (retain the mechanism, close a specific gap)

This section is normative.

- **Edge and governed authorization** - add resource-/jurisdiction-scoped
  authority so authority binds to the specific applicant, not just a role
  (CAP-025 ADAPT / QD-025; FND-023, FND-033).
- **Affiliation application lifecycle** - add the missing create/bootstrap path,
  the return-for-information / resubmission loop, and versioned requirements
  (CAP-026 ADAPT / QD-026; FND-026, FND-027, FND-031).
- **Evidence subsystem** - wire the HTTP upload transport to the pending governed
  decision (CAP-023 ADAPT / QD-023; FND-025).

## V1-14.4 Rebuild (mechanism absent)

This section is normative.

- **Reviewer routing / assignment / jurisdiction dispatch** - nothing selects
  which reviewer may act on a given application; this must be built, not adapted
  (FND-024, recommended REBUILD; dispositioned within CAP-024/CAP-026).

## V1-14.5 Exact gaps preventing the first complete affiliation release

This section is normative.

The first complete affiliation release is blocked by these confirmed gaps, each
grounded in source and none authorized for remediation here:

1. **No create/bootstrap path** for an affiliation application; the flow cannot
   complete through the HTTP surface (FND-026, high).
2. **Authorization is not resource-aware**; any reviewer-role actor can decide any
   application in a tenant (FND-023, high).
3. **No reviewer routing / jurisdiction assignment** (FND-024, high).
4. **Evidence upload is not wired** to the governed decision (FND-025, high).
5. **No return-for-information / resubmission** path (FND-027, medium).
6. **No versioned requirements**; fees not re-checked at activation (FND-031,
   medium).
7. **Governed database behaviour is unproven** - the DB-gated integration suites
   were not executed (FND-028).
8. **No deployed environment and Noop-default outbox delivery** (FND-029, FND-030).

Gaps 1-4 are the minimum functional set for an end-to-end affiliation decision;
gaps 7-8 are the minimum evidence/operational set for calling any release
production-ready.

## V1-14.6 Convergence with the Base44 qualification

This section is normative.

Package 3 keeps the House and Base44 capability sets **separate** (House CAP-019..
CAP-030; Base44 CAP-001..CAP-018); convergence is reserved for Package 5. Two
convergence signals are recorded now: (a) the Base44 `Application` lifecycle carries
a `more_info_needed` status (EV-022) that the House lifecycle lacks (FND-027) - the
target lifecycle should adopt the richer loop; and (b) Base44 advances state by
direct mutation with client-side authorization (CON-007), which the House kernel
correctly replaces - the House mechanism is the target, the Base44 concept is the
input.

## V1-14.7 Release-wave hypothesis (for Package 4 to test, not to execute)

This section is normative.

Hypothesis, unproven and unauthorized: the first release wave is a **complete,
governed affiliation-application journey** built on the retained kernel, gated by
closing the eight gaps of V1-14.5 in the order functional-set (1-6) then
evidence/operational-set (7-8), with the DB-gated suites executed against
production-equivalent PostgreSQL as the release-readiness proof. Package 4 is the
place to test this hypothesis and to author a master development plan; Package 3
neither authorizes implementation nor commits to this sequence.
