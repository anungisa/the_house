# V1-12 - The House Governance Kernel, Authorization, Workflow, and Evidence Qualification

Document ID: V1-12  
Title: The House Governance Kernel, Authorization, Workflow, and Evidence Qualification  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-C, REG-108 APP-V1-018)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G3)  
Supersedes: None  
Review Cycle: Frozen at Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-12.1 Purpose and the assurance ladder

This section is normative.

This chapter qualifies the constitutional core of The House: the Governance
Kernel, the authorization model, the approval workflow, and the evidence and audit
subsystems. To avoid rewarding architecture vocabulary, every claim is placed on an
explicit **assurance ladder**, from weakest to strongest:

1. a **model exists** (a table, type, or state seeded);
2. a **service method exists** (code that would perform the behaviour);
3. a **guard exists** (a named handler is registered);
4. the **guard is called** (wired into a transition);
5. the control is **resource-aware** (scoped to the specific entity/actor, not
   just a role);
6. **persistence enforces** the control (a DB constraint or RLS makes violation
   impossible, not merely unlikely);
7. an **integration test proves** the control against a real database;
8. **production wiring** exercises the control in the deployed composition.

A control high on the ladder is production-relevant; a control that stops at rung 1
or 2 is design intent. The evidence hierarchy governs: executable test > runtime
code > DB constraint > migration > service contract > architecture document.

## V1-12.2 Governance Kernel - transition algorithm (rungs 2-6, integration
proof pending)

This section is normative.

The kernel implements the full ordered `transition()` algorithm in source
(SRC-011; EV-025, `src/governance/kernel/GovernanceKernel.ts`): input validation;
idempotency pre-check outside the transaction; `BEGIN`; set `app.tenant_id` in the
transaction; idempotency double-check; lock `entity_state FOR UPDATE`; resolve the
transition with **fail-closed** on unknown; permission check; load guards with
**fail-closed** on unknown guard; evaluate guards and persist results; if guards
fail, return rejected with **no state mutation**; if approval is required, create a
`transition_request` and workflow placeholder with **no state mutation**; else
update `entity_state`, append `state_transition`, append `audit_event`, create
`evidence_object` when required, and enqueue an `outbox_message` - all in one
transaction - then `COMMIT` and return a deterministic result.

Idempotency is enforced across four layers (kernel pre-check, in-transaction
double-check, database uniqueness, and a stable outbox dedupe key), so retries do
not duplicate transitions, audit events, evidence, or messages (CAP-028, RETAIN,
QD-028). Exactly-once execution of an approved transition is enforced by
`executeApprovedTransitionRequest` (idempotent replay, request/entity locks,
state-drift fail-closed).

**Ladder position:** the algorithm reaches rung 6 in source (persistence-enforced
locking and uniqueness are written into the store and migrations) but **rung 7 is
not satisfied**: the integration suites that would prove this behaviour against a
real PostgreSQL instance are DB-gated and were not executed (FND-028). The kernel is
the platform's core reusable value (FND-032; CAP-019, ADOPT, QD-019) and is
retained and hardened - but its runtime correctness against a database is
**unproven** under this assessment.

## V1-12.3 Authorization - role-based, not resource-aware (stops at rung 4)

This section is normative.

Governed affiliation authorization is **role-based, not resource-aware**
(SRC-011; EV-026, verified by direct read of
`src/governance/permissions/PermissionChecker.ts` and
`src/domains/affiliation/DomainBackedAffiliationGuardRepository.ts`). The
`DefaultPermissionChecker` input carries no entity id and grants elevated
transitions to any actor holding a reviewer-class role; the production
`DomainBackedAffiliationGuardRepository.actorHasReviewerScope` returns
`roles.some(r => REVIEWER_ROLES.has(r))` with no binding to the specific applicant,
jurisdiction, or region.

**Ladder position:** the reviewer-scope guard exists and is called (rungs 3-4) but
**does not reach rung 5**. Any reviewer-role actor can decide any application within
a tenant. This is a confirmed release-blocking gap (FND-023, production risk high;
CAP-025 ADAPT, QD-025) and an authority conflict against the design-intent
narrative (FND-033; CON-008). Relatedly, there is **no assigned-reviewer or
jurisdiction/region routing** - nothing selects which reviewer may act on a given
application (FND-024, ABSENT; recommended REBUILD).

The edge authorization catalog (`src/authz`) is a sound fail-closed first gate -
16 edge actions, a `platform_admin` wildcard, unknown actions denied - but it is
coarse-grained and distinct from the missing resource-aware governed check.

## V1-12.4 Workflow and approval (rungs 2-6, routing absent)

This section is normative.

The approval workflow is correct in shape (SRC-011; EV-027): approval-required
transitions create a `transition_request` and workflow placeholder **without
mutating state**, and the `ApprovedWorkflowExecutionService` applies the approved
transition exactly once. The six seeded guard codes map exactly to six implemented
handlers - **no unimplemented or orphan guards** (perfect seed-to-handler parity,
CAP-022, RETAIN).

Two lifecycle gaps are material to an affiliation release:

- **No return-for-information / resubmission path** (FND-027, ABSENT). The seeded
  lifecycle can only approve or reject a review; there is no
  `under_review -> (draft | more_information)` transition and no resubmission loop.
  Notably, the legacy Base44 `Application` entity **does** carry a
  `more_info_needed` status (EV-022), so the House lifecycle is narrower here than
  the product it supersedes.
- **No versioned affiliation requirements** (FND-031, PARTIAL). Season currency is
  a single `is_current` boolean and required-field/document rules are fixed guard
  logic; no versioned requirement set ties an application to the ruleset in force
  for its season. Additionally, `AFFILIATION_FEES_PAID` is checked at approve time
  and is **not** re-checked at activation - a hardcoded assumption.

## V1-12.5 Evidence and audit (rung 6 in-kernel, transport unwired)

This section is normative.

The evidence subsystem is complete in source (SRC-011; EV-029): in-memory and
Azure Blob storage providers, a signature malware scanner with a scan gate, a
quarantine service, and an RLS-enforced store. Kernel-created evidence metadata and
audit events are written **inside the transition transaction**, and evidence
objects carry the `state_transition` id - a genuine in-transaction binding
(rung 6).

The gap is at the transport, not the model: **the HTTP evidence-upload path is
independent of the governed decision.** There is no end-to-end
create-application -> upload-evidence -> submit-with-evidence flow that guarantees a
decision is accompanied by its evidence (FND-025, PARTIAL - modeled but unwired;
CAP-023 ADAPT, QD-023).

## V1-12.6 Kernel qualification summary

This section is normative.

The Governance Kernel is the strongest asset in the corpus and the reason The
House is the production candidate: the transition algorithm, four-layer
idempotency, forced-RLS tenancy, correct outbox, named guard registry, and
in-transaction audit/evidence writes implement the constitutional requirements in
source (FND-032; ADOPT/RETAIN across CAP-019, CAP-021, CAP-022, CAP-024, CAP-028).
The material qualifications are: authorization stops at rung 4 and is not
resource-aware (FND-023), reviewer routing is absent (FND-024), evidence transport
is unwired (FND-025), the lifecycle lacks return-for-information and versioned
requirements (FND-027, FND-031), and **no control reaches rung 7** because the
database integration suites were not executed (FND-028). None is authorized for
remediation in Package 3.
