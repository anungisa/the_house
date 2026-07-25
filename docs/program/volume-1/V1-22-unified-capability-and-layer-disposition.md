# V1-22 - Unified Capability and Layer Disposition

Document ID: V1-22  
Title: Unified Capability and Layer Disposition  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 5 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-E, REG-108 APP-V1-035)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G5)  
Supersedes: None  
Review Cycle: Frozen at Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-22.1 Purpose

This section is normative.

This chapter converges the three evidence streams into a single set of **unified target
capabilities** and dispositions each one **independently at four layers**. It answers
the core of the central question: what the target platform should retain, adapt,
rebuild, externalize, defer, consolidate, or retire — capability by capability, layer by
layer.

The unified capabilities are CAP-037..CAP-048 (REG-103). Their layer dispositions are
recorded as QD-037..QD-065 (REG-106) and structured into
`generated/convergence/capability-layer-matrix.json` (12 capabilities × 4 layers = 48
layer cells) and `generated/convergence/base44-house-ecosystem-crosswalk.json`.

## V1-22.2 The four disposition layers

This section is normative.

Every capability is dispositioned separately at each of four layers, because a single
capability frequently belongs to different sources at different layers:

- **experience** — the client-facing interaction (target home: The Button).
- **domain** — the governed business logic (target home: The House platform core).
- **data_authority** — who owns the authoritative record.
- **integration** — how the capability connects to other systems.

Dispositions use the ratified vocabulary: ADOPT, ADAPT, CONSOLIDATE, RETAIN, REBUILD,
DEFER, EXTERNALIZE, RETIRE.

## V1-22.3 Unified target capabilities

This section is normative.

The twelve unified capabilities, with their strongest contribution and headline
disposition posture:

1. **CAP-037 Club recognition and establishment** — experience ADAPT (Base44), domain
   REBUILD (The House; no create/bootstrap path exists), data_authority RETAIN (The
   House registry; Curling Canada master-data authority), integration ADAPT (incumbent
   import during transition). First release: included.
2. **CAP-038 Jurisdiction resolution** — experience ADAPT, domain REBUILD, data_authority
   RETAIN, integration REBUILD. No equivalent model exists today. First release:
   included.
3. **CAP-039 Seasonal affiliation lifecycle** — experience ADAPT (Base44 tiered concept,
   the strongest reusable product asset); domain/data/integration RETAIN (Governance
   Kernel owns transitions fail-closed). First release: included.
4. **CAP-040 Versioned affiliation requirements** — experience/domain ADAPT,
   data_authority RETAIN (policy_version anchor), integration DEFER. First release:
   included.
5. **CAP-041 Evidence capture and binding** — experience/domain/integration ADAPT (wire
   the existing evidence subsystem into the affiliation flow), data_authority RETAIN
   (evidence_object metadata immutable). First release: included.
6. **CAP-042 Fee determination** — experience/domain ADAPT (fee POLICY is governed House
   state), data_authority RETAIN, integration EXTERNALIZE (charge execution). First
   release: included (determination + reconciliation boundary).
7. **CAP-043 Reviewer routing and assignment** — experience ADAPT, domain/integration
   REBUILD (no routing exists; role-only authorization today), data_authority RETAIN.
   First release: included.
8. **CAP-044 Return-for-information and resubmission** — experience/domain ADAPT (add FSM
   transitions), data_authority/integration RETAIN. First release: included.
9. **CAP-045 Governed decision and exactly-once activation** — experience ADAPT;
   domain/data/integration RETAIN (kernel idempotency + outbox exactly-once). First
   release: included.
10. **CAP-046 Payment execution** — experience ADAPT, domain/data/integration
    EXTERNALIZE (payment processor). First release: reconciliation boundary only.
11. **CAP-047 Accounting and ledger truth** — experience DEFER, domain/data/integration
    EXTERNALIZE (accounting system retains ledger authority). First release:
    reconciliation boundary only.
12. **CAP-048 Authoritative status projection** — experience/integration ADAPT (The
    Button presents), domain/data_authority RETAIN (The House owns lifecycle state).
    First release: included.

## V1-22.4 Reading the disposition posture

This section is normative.

Three patterns govern the disposition set and demonstrate that the precedence rules of
V1-21 were applied rather than a preference for the newest or most polished source:

- **The House is retained where it holds implementation truth** — the Governance Kernel,
  idempotency, outbox, evidence metadata, and authoritative lifecycle state (CAP-039,
  CAP-045, CAP-048). These are E3-corroborated reusable value (FND-044, FND-050,
  FND-052).
- **The domain is rebuilt where nothing production-ready exists** — organization
  create/bootstrap, jurisdiction, and reviewer routing (CAP-037, CAP-038, CAP-043).
  These are capability gaps (FND-042, FND-043, FND-048), not adaptations of a prototype.
- **External systems are externalized, not absorbed** — payment execution and ledger
  truth stay with the processor and accounting system (CAP-046, CAP-047); The House owns
  fee POLICY and a reconciliation boundary only (FND-047, FND-051).

Base44 contributes at the **experience** layer (ADAPT) far more often than at the domain
or data-authority layers, consistent with its status as product evidence rather than
production authority.

## V1-22.5 No implementation authorized

This section is normative.

Every capability disposition (QD-037..QD-065) sets `authorizes_implementation: false`
and `authorizing_gate: null`. These are target-definition decisions of the Accountable
Program Authority. No finding and no convergence decision in this chapter authorizes
construction, procurement, or a master development plan. Unresolved validations are
recorded per capability and carried into V1-25.
