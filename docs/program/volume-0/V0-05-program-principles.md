# V0-05 - Program Principles and Non-Negotiables

Document ID: V0-05
Status: IN_REVIEW
Version: 0.2.0
Owner: Program Owner (TBD)
Approver: Executive Steering Authority (TBD)
Associated Gate: G0

This chapter is the constitutional core and is normative in full.

## Principle record format

This subsection is normative.

Each principle record MUST contain:

- Principle ID
- Name
- Normative statement
- Rationale
- Required implications
- Prohibited interpretations
- Evidence required
- Enforcing gates
- Exception authority

Enforcing gate labels (G0 constitutional, vertical gate for the affiliation slice,
release gate for production release) are defined in V0-09 and V0-12. Exception
authorities reference the decision classes in V0-07 and are recorded in REG-007.

## Principles

### PR-001 Outcomes before features

- Normative statement: every capability MUST trace to an approved organizational or
  user outcome (V0-03).
- Rationale: prevents feature work that does not serve a national outcome.
- Required implications: each capability record links to an OUT-### outcome; no
  requirement is accepted without an outcome link.
- Prohibited interpretations: a plausible-sounding feature does NOT justify itself;
  "users might want it" is not an outcome.
- Evidence required: traceability link outcome to capability to requirement.
- Enforcing gates: vertical gate, release gate.
- Exception authority: Program/Product Authority (D1) with recorded decision.

### PR-002 Affiliation first

- Normative statement: the first deployable vertical MUST be club affiliation,
  including activation into the authoritative organization registry (V0-04 4.5).
- Rationale: organization identity is foundational to membership and registration.
- Required implications: no later-wave capability may be released before the
  affiliation vertical is complete in production.
- Prohibited interpretations: partial affiliation (form-only or approval-only) does
  NOT satisfy this principle.
- Evidence required: complete affiliation outcome evidence per V0-04 4.5.
- Enforcing gates: vertical gate, release gate.
- Exception authority: Executive Sponsor (D0) only.

### PR-003 Federated governance

- Normative statement: the platform MUST support Curling Canada, PTSO, club, and
  participant authority without collapsing all decisions into one national admin.
- Rationale: legitimacy depends on preserving jurisdiction.
- Required implications: workflows route decisions to correct jurisdiction; PTSO
  authority is explicit in governed rules.
- Prohibited interpretations: centralizing decisions "for simplicity" is prohibited.
- Evidence required: routing and authority records; audit of jurisdictional review.
- Enforcing gates: vertical gate, release gate.
- Exception authority: Executive Sponsor (D0) with Strategy Authority input.

### PR-004 Clear product authority

- Normative statement: The House, The Button, Base44, and external providers MUST
  have explicitly defined authority boundaries (V0-06).
- Rationale: undefined authority causes conflicting decisions.
- Required implications: every governed data domain has one authoritative source.
- Prohibited interpretations: an experience layer or reference corpus is NOT an
  authority source by default.
- Evidence required: authority classifications in REG-005 and V0-06.
- Enforcing gates: G0, vertical gate.
- Exception authority: Technology and Architecture Authority (D3).

### PR-005 Server-side authority

- Normative statement: privileged actions MUST be authorized and enforced by
  trusted server-side services; client-side role checks are never authoritative.
- Rationale: client checks are bypassable and cannot govern.
- Required implications: authorization enforced server-side for every governed
  action; UI checks are convenience only.
- Prohibited interpretations: hiding a button is NOT authorization.
- Evidence required: server-side authorization tests and audit records.
- Enforcing gates: vertical gate, release gate.
- Exception authority: none. This principle MUST NOT be excepted.

### PR-006 Policy is versioned

- Normative statement: business rules, requirements, decision criteria, and
  workflow definitions MUST be versioned and effective-dated.
- Rationale: governed decisions must be reconstructable against the rules in force.
- Required implications: policy changes carry version and effective date; decisions
  reference the policy version applied.
- Prohibited interpretations: silently editing rules in place is prohibited.
- Evidence required: versioned policy records; decision-to-version linkage.
- Enforcing gates: vertical gate, release gate.
- Exception authority: Compliance/Privacy Authority (D4) for time-bounded cases.

### PR-007 Evidence before claims

- Normative statement: the program MUST NOT claim a capability, compliance posture,
  readiness state, or business outcome without evidence.
- Rationale: unfounded claims create governance and audit risk.
- Required implications: every readiness/compliance claim links to evidence.
- Prohibited interpretations: "it should work" is not evidence; a demo is not proof
  of a governed outcome.
- Evidence required: linked evidence artifacts for each claim.
- Enforcing gates: G0, vertical gate, release gate.
- Exception authority: none. This principle MUST NOT be excepted.

### PR-008 Testing concurrency

- Normative statement: testing MUST be designed alongside requirements and
  implemented alongside production code; testing is not a post-build phase.
- Rationale: late testing hides defects and weakens traceability.
- Required implications for "advance with requirements":
  - acceptance-test design MUST exist before implementation of a feature begins;
  - automated verification MUST run during implementation, not only at the end;
  - each requirement links to at least one test (TEST-###).
- Prohibited interpretations: writing most tests after implementation, or claiming
  concurrency while deferring real verification, is prohibited.
- Evidence required: acceptance-test designs dated before implementation; CI runs
  during implementation; requirement-to-test traceability.
- Enforcing gates: vertical gate (test design present), release gate (verification).
- Exception authority: Program Owner (D1) time-bounded only, recorded in REG-007.

### PR-009 Security and privacy by design

- Normative statement: security, privacy, data minimization, purpose limitation,
  and access control MUST be designed before personal-data functionality is built.
- Rationale: retrofitting privacy is costly and unsafe.
- Required implications: privacy and security design precede personal-data code.
- Prohibited interpretations: "add security later" is prohibited.
- Evidence required: privacy/security design artifacts predating implementation.
- Enforcing gates: vertical gate, release gate.
- Exception authority: Compliance/Privacy Authority (D4), time-bounded only.

### PR-010 Bilingual parity

- Normative statement: English and French MUST receive equivalent functionality,
  meaning, workflow, and support, not merely translated labels.
- Rationale: official-language obligations and equitable service.
- Required implications: parity verified for workflow and meaning, not just text.
- Prohibited interpretations: translated labels over an English-only workflow do
  NOT satisfy parity.
- Evidence required: bilingual functional parity review records.
- Enforcing gates: release gate.
- Exception authority: Executive Sponsor (D0), time-bounded only.

### PR-011 Accessibility by design

- Normative statement: user journeys MUST be designed and verified against
  WCAG 2.2 AA.
- Rationale: equitable access is a legal and ethical obligation.
- Required implications: accessibility considered in design and verified in test.
- Prohibited interpretations: a late accessibility "audit" alone does not satisfy
  design-time obligation.
- Evidence required: WCAG 2.2 AA verification results.
- Enforcing gates: release gate.
- Exception authority: Executive Sponsor (D0), time-bounded only.

### PR-012 Progressive and reversible delivery

- Normative statement: the platform MUST be released through controlled,
  observable, and reversible stages.
- Rationale: reduces blast radius and enables recovery.
- Required implications: each release stage has rollback/recovery and monitoring.
- Prohibited interpretations: irreversible one-shot cutovers are prohibited by
  default.
- Evidence required: staged rollout and rollback plans; monitoring in place.
- Enforcing gates: release gate.
- Exception authority: Executive Sponsor (D0) plus operational acceptance (D8).

### PR-013 No national big bang by default

- Normative statement: national rollout MUST proceed through pilots and phased
  cohorts unless a later evidence-based decision authorizes another approach.
- Rationale: national simultaneous launch concentrates risk.
- Required implications: pilot then phased cohorts (V0-04 4.1.4 to 4.1.5).
- Prohibited interpretations: convenience is not a basis for a big-bang launch.
- Evidence required: pilot results before broader cohorts.
- Enforcing gates: release gate.
- Exception authority: Executive Sponsor (D0) with evidence.

### PR-014 Preserve institutional continuity

- Normative statement: historical data, existing affiliations, delegated
  relationships, and operational goodwill MUST be preserved or explicitly
  dispositioned.
- Rationale: loss of continuity harms trust and operations.
- Required implications: continuity items are migrated or explicitly dispositioned
  with a decision.
- Prohibited interpretations: silent data loss is prohibited.
- Evidence required: disposition decisions for continuity items.
- Enforcing gates: vertical gate, release gate.
- Exception authority: Program Owner (D1) with Compliance input.

### PR-015 No silent assumptions

- Normative statement: material assumptions MUST be recorded, owned, time-bounded,
  and resolved or accepted.
- Rationale: undocumented assumptions cause downstream rework.
- Required implications: assumptions live in REG-003 with owner and validation date.
- Prohibited interpretations: treating an assumption as a fact is prohibited.
- Evidence required: RAID assumption records.
- Enforcing gates: G0, vertical gate.
- Exception authority: Program Owner (D1).

### PR-016 External systems remain replaceable

- Normative statement: integrations SHOULD use governed contracts and adapters that
  avoid unnecessary provider lock-in.
- Rationale: preserves institutional control and switching ability.
- Required implications: integrations use governed contracts/adapters where feasible.
- Prohibited interpretations: deep coupling for convenience is discouraged and MUST
  be justified.
- Evidence required: integration contract/adapter design.
- Enforcing gates: release gate.
- Exception authority: Technology and Architecture Authority (D3).

### PR-017 Operability as completion

- Normative statement: a capability is not complete without monitoring, support,
  incident handling, recovery, documentation, and ownership.
- Rationale: unoperable features are liabilities.
- Required implications: operability artifacts required before "done".
- Prohibited interpretations: passing tests alone does not mean complete.
- Evidence required: monitoring, runbook, ownership, recovery evidence.
- Enforcing gates: release gate.
- Exception authority: Technology and Operations Authority (D3).

### PR-018 Executable governance

- Normative statement: required documents, traceability links, tests, and approvals
  MUST be validated through delivery gates wherever technically possible.
- Rationale: governance that is not enforced drifts.
- Required implications: gate checks validate required artifacts (machine checks
  where feasible; see V0-10 and Package 3).
- Prohibited interpretations: "documentation exists somewhere" is not validation.
- Evidence required: gate validation results.
- Enforcing gates: G0, vertical gate, release gate.
- Exception authority: Program Owner (D1), time-bounded only.

### PR-019 Human accountability explicit

- Normative statement: automated recommendations or AI-supported functions MUST NOT
  obscure the accountable human or policy authority for governed decisions.
- Rationale: accountability cannot be delegated to automation.
- Required implications: governed decisions name an accountable human/authority.
- Prohibited interpretations: "the system decided" is not an accountable answer.
- Evidence required: decision records naming accountable authority.
- Enforcing gates: vertical gate, release gate.
- Exception authority: none. This principle MUST NOT be excepted.

### PR-020 One complete vertical before broad horizontal expansion

- Normative statement: the program MUST prove a complete production journey before
  expanding across numerous partially implemented domains.
- Rationale: broad shallow work produces no reliable production outcome.
- Required implications: affiliation vertical complete before later waves start
  broad implementation.
- Prohibited interpretations: starting many domains in parallel is prohibited.
- Evidence required: complete affiliation vertical evidence before wave expansion.
- Enforcing gates: vertical gate, release gate.
- Exception authority: Executive Sponsor (D0) with evidence.

## No-vibe-coding constitutional clause

This clause is normative and MUST NOT be excepted except by the Executive Sponsor
(D0) with a time-bounded, recorded exception in REG-007.

Production capabilities MUST NOT be created solely from conversational prompts,
visual imitation, unapproved assumptions, or emergent implementation decisions.

AI-assisted development MAY accelerate approved work but MUST NOT replace
requirements, design review, test evidence, traceability, and accountable approval.

- Evidence required: for any production capability, linked requirement, design
  review, tests, traceability, and accountable approval MUST exist.
- Enforcing gates: vertical gate, release gate.
