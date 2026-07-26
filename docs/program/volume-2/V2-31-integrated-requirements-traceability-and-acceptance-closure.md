# V2-31 - Integrated Requirements, Traceability, and Acceptance Closure

Document ID: V2-31  
Title: Integrated Requirements, Traceability, and Acceptance Closure  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 5 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-044)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-31.1 Purpose

This section is normative.

This chapter closes integrated requirement traceability and acceptance for Volume 2 (REG-201
OUT-V2-026; REG-203 CAP-V2-048, FR-V2-048, NFR-V2-023). It records the deterministic
traceability projection and dispositions every material gap. No gap disappears merely because
the governance scripts pass schema validation (REG-203 RULE-V2-033).

## V2-31.2 Traceability method

This section is normative.

Traceability is produced by the deterministic projection `npm run governance:trace:v2`
(control script docs/program/volume-2/controls/trace-volume-2.mjs). The projection reads the
source-controlled corpus and emits identifier counts, orphan analysis, chain coverage,
acceptance coverage, authority-boundary analysis, and a validation backlog under
docs/program/volume-2/generated/traceability/. The generated outputs are non-authoritative
projections; the registers and chapters remain authoritative.

## V2-31.3 Structural integrity result

This section is normative.

The projection confirms structural requirement-chain integrity:

- Broken references: none. Every traces_to and acceptance_ref resolves.
- Reverse-order or same-order references: none. Every parent strictly precedes its child in
  the requirement chain OUT, CAP, BR, FR, NFR, UC, RULE, WF, UX, DATA, API, EVT, CTRL, TEST.
- Records without a resolving parent: none.
- Acceptance tests without outcome lineage: none. Every acceptance test traces back to a
  product outcome.

These structural-integrity conditions are dispositioned CLOSED.

## V2-31.4 Gap disposition classes

This section is normative.

Every material gap is assigned exactly one disposition:

- CLOSED
- ACCEPTED_AS_FUTURE_VOLUME_INPUT
- VALIDATION_PENDING
- POLICY_PENDING
- INTENTIONALLY_EXCLUDED
- DEFECT_REQUIRING_AMENDMENT

## V2-31.5 Coverage-granularity dispositions

This section is normative.

The projection reports coverage-granularity observations. These are not integrity defects;
they reflect that the definition decomposes capabilities to differing depths. Each category is
dispositioned:

- Outcomes without a directly traversable acceptance descendant (aggregate and experience
  outcomes). Disposition: CLOSED. Rationale: acceptance for each aggregate outcome is provided
  by the acceptance scenarios of its constituent capabilities, which are individually
  outcome-linked; the naive descendant walk does not traverse the aggregate.
- Capabilities without a directly attached rule or functional requirement (aggregate and
  descriptive capabilities). Disposition: ACCEPTED_AS_FUTURE_VOLUME_INPUT. Rationale: these
  capabilities are realized by sibling capabilities and downstream design; Volume 3 refines
  their decomposition.
- Rules without a directly attached workflow. Disposition: ACCEPTED_AS_FUTURE_VOLUME_INPUT.
  Rationale: these rules are enforced across multiple workflows; explicit per-rule workflow
  binding is downstream design work.
- Workflows without a directly attached experience requirement. Disposition:
  ACCEPTED_AS_FUTURE_VOLUME_INPUT. Rationale: these workflows are governance or operational
  workflows whose experience surfaces are defined at the service level, not per workflow.
- Controls without a directly attached acceptance test. Disposition:
  ACCEPTED_AS_FUTURE_VOLUME_INPUT. Rationale: these controls are validated by scenarios
  attached at the rule or requirement level; explicit per-control test binding is downstream
  design work.
- Terminal descriptive records with no downstream consumer (DATA, EVT, and leaf requirements).
  Disposition: INTENTIONALLY_EXCLUDED. Rationale: these records legitimately terminate the
  chain at their level and are not required to have a consumer.

No coverage-granularity observation is classified as DEFECT_REQUIRING_AMENDMENT. The
per-identifier detail for each category is enumerated in the generated projection outputs and
is a non-authoritative reference to this disposition.

## V2-31.6 Validation-dependent dispositions

This section is normative.

Requirements and measures carrying a validation-pending classification (policy, financial,
operational, accessibility, bilingual, privacy, stakeholder, or production-proof) are
dispositioned VALIDATION_PENDING or POLICY_PENDING according to their classification, and are
carried into the Volume 2 validation backlog (V2-32). Each such item has an accountable owner
and a future blocking gate.

## V2-31.7 Requirement totals

This section is normative.

The integrated requirement corpus consolidated at Package 5 comprises the outcomes in REG-201
and the requirement-chain records in REG-203 across the levels CAP, BR, FR, NFR, UC, RULE, WF,
UX, DATA, API, EVT, CTRL, and TEST. The authoritative counts are those emitted by the
projection identifier-counts output at closure and recorded in the Volume 2 completion record
(V2-E). No requirement authorizes implementation.

## V2-31.8 Authorization posture

This section is normative.

This chapter closes traceability and acceptance only. It authorizes no implementation, no
procurement, no technical architecture, no delivery plan, and no master development plan.
Executive organizational acceptance remains pending at the material-commitment gate.
