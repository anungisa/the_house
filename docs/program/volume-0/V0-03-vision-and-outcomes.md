# V0-03 - Vision and National Outcomes

Document ID: V0-03
Status: IN_REVIEW
Version: 0.2.0
Owner: Strategy Authority (TBD)
Approver: Executive Sponsor (TBD)
Associated Gate: G0

This chapter is normative except where a subsection is marked explanatory.

## Vision

Every Canadian curling organization and participant SHOULD be able to interact
with the sport through a trusted, coherent, and accessible digital experience,
while Curling Canada and provincial and territorial partners retain the
governance, evidence, data quality, and operational visibility required to support
the sport nationally.

## Outcome record structure

This subsection is normative.

Each outcome MUST be defined with:

- definition;
- stakeholder value;
- baseline method (how the starting point will be measured);
- target method (how the target will be set);
- likely measure categories;
- accountable owner role;
- evidence source;
- anti-gaming note (unintended-behaviour warning);
- relationship to release gates.

Baselines, targets, owners, and evidence sources are tracked in REG-008. Values
marked TBD are unratified and MUST NOT be presented as established.

## National outcomes

### OUT-001 Trusted organizational identity

- definition: every club and governing body has one authoritative organizational
  identity with known lineage and jurisdiction.
- stakeholder value: reliable national spine for all downstream capabilities.
- baseline method: count of duplicate/conflicting organization records today.
- target method: define acceptable maximum duplicate/conflict rate.
- likely measures: duplicate record rate; percentage with known jurisdiction.
- owner: Domain Policy Owner - Organization Records (TBD)
- evidence source: organization registry data quality reports.
- anti-gaming note: merging records to reduce counts MUST NOT lose lineage.
- gate relationship: enforced at affiliation vertical gate and release gates.

### OUT-002 Clear affiliation standing

- definition: affiliation status, requirements, evidence, decisions, and effective
  dates are visible and traceable.
- stakeholder value: clubs and reviewers can trust current standing.
- baseline method: percentage of clubs with traceable current standing today.
- target method: set minimum percentage with complete requirement disposition.
- likely measures: percentage with traceable standing; conflicting-record count;
  time to answer a standing inquiry; percentage of decisions with full lineage.
- owner: Domain Policy Owner - Affiliation (TBD)
- evidence source: affiliation decision and evidence records.
- anti-gaming note: marking standing "current" without evidence is prohibited.
- gate relationship: primary success measure for the affiliation vertical.

### OUT-003 Reduced administrative burden

- definition: clubs and reviewers spend less time duplicating information, chasing
  documents, and resolving unclear status.
- stakeholder value: lower cost and better experience.
- baseline method: measure current median draft-to-decision time and handling time.
- target method: set target reduction against baseline.
- likely measures: median elapsed draft-to-decision; staff handling time per
  application; manual follow-up count; avoidable-incompleteness return rate;
  eliminated duplicate fields; club satisfaction.
- owner: Program Owner (TBD)
- evidence source: workflow timing and support records.
- anti-gaming note: speed MUST NOT be achieved by weakening required review.
- gate relationship: measured through pilot and release gates.

### OUT-004 Federated national operation

- definition: PTSOs retain appropriate jurisdiction while Curling Canada gains
  national consistency and visibility.
- stakeholder value: national coherence without removing local authority.
- baseline method: document current jurisdictional decision points.
- target method: confirm preserved PTSO authority in governed workflows.
- likely measures: percentage of decisions routed to correct jurisdiction;
  disputed-authority incident count.
- owner: Strategy Authority (TBD)
- evidence source: workflow routing and audit records.
- anti-gaming note: centralizing decisions to simplify metrics violates PR-003.
- gate relationship: verified at affiliation vertical and release gates.

### OUT-005 Participant continuity

- definition: participant identity and membership history persist appropriately
  across seasons, clubs, jurisdictions, and providers.
- stakeholder value: durable participant relationships.
- baseline method: assess current continuity guarantees.
- target method: define required continuity across season and club changes.
- likely measures: continuity retention rate; orphaned-history incidents.
- owner: Domain Policy Owner - Participant Identity (TBD)
- evidence source: participant identity and membership records.
- anti-gaming note: continuity MUST NOT be achieved by over-merging identities.
- gate relationship: deferred beyond affiliation vertical; tracked as later wave.

### OUT-006 Integrated service delivery

- definition: external systems participate through governed APIs, events, and
  reconciliation rather than fragile manual transfers.
- stakeholder value: reliable interoperability.
- baseline method: inventory current manual transfer points.
- target method: define governed-integration coverage targets.
- likely measures: manual transfer count eliminated; reconciliation exception rate.
- owner: Technology and Architecture Authority (TBD)
- evidence source: integration and reconciliation logs.
- anti-gaming note: hidden manual steps MUST NOT be relabeled as integration.
- gate relationship: later wave; not a first-release success criterion.

### OUT-007 Bilingual and accessible experience

- definition: English and French experiences are functionally equivalent and meet
  WCAG 2.2 AA expectations.
- stakeholder value: equitable, compliant national service.
- baseline method: audit current parity and WCAG conformance.
- target method: require functional parity and WCAG 2.2 AA for release scope.
- likely measures: parity defect count; WCAG conformance results.
- owner: Accessibility and Official Language Authority (TBD)
- evidence source: accessibility audits and bilingual review records.
- anti-gaming note: translated labels without equivalent workflow do not satisfy
  parity (see PR-010).
- gate relationship: release requirement; enforced at release gates.

### OUT-008 Auditable governance

- definition: important actions can be reconstructed through actors, authority,
  rules, evidence, decisions, timestamps, and system events.
- stakeholder value: trust, compliance, and defensibility.
- baseline method: assess current audit lineage completeness.
- target method: require complete lineage for governed decisions.
- likely measures: percentage of governed decisions with full lineage.
- owner: Compliance, Privacy, and Policy Authority (TBD)
- evidence source: audit and evidence records.
- anti-gaming note: audit records MUST NOT be editable to appear complete.
- gate relationship: enforced at affiliation vertical and release gates.

### OUT-009 Operational sustainability

- definition: the system is supportable, observable, recoverable, secure, and
  affordable over its lifecycle.
- stakeholder value: durable, affordable national operation.
- baseline method: define operability and cost baselines.
- target method: set recovery, observability, and cost targets.
- likely measures: recovery objectives met; incident MTTR; run cost per period.
- owner: Technology and Operations Authority (TBD)
- evidence source: operational monitoring and cost reporting.
- anti-gaming note: deferring operability to appear "done" violates PR-017.
- gate relationship: release requirement.

### OUT-010 Bounded future adaptability (multi-sport readiness)

- definition: curling-specific requirements MUST be satisfied without introducing
  unnecessary architectural assumptions that would make future adaptation to other
  Canadian sports impossible.
- stakeholder value: preserves future optionality without inflating current scope.
- baseline method: not a first-release measured outcome.
- target method: design-review constraint verified during architecture reviews.
- likely measures: architecture-review findings of curling-specific coupling that
  blocks future adaptation.
- owner: Technology and Architecture Authority (TBD)
- evidence source: architecture decision records.
- anti-gaming note: multi-sport generality MUST NOT be built speculatively before
  the curling affiliation flow is proven (see PR-020).
- gate relationship: architecture-review constraint, not a first-release success
  criterion.

## Reframing note (normative)

Multi-sport reuse is a bounded future-readiness constraint, not a first-release
business outcome. The first obligation is to deliver for Canadian curling.

## Measurement control

Each outcome MUST receive a baseline, target, owner, measurement method, and
evidence source in REG-008 before it may be treated as decision-grade. Absence of
these values is a Gate G0 consideration, not a silent gap.
