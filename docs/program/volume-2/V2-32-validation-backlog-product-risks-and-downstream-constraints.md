# V2-32 - Validation Backlog, Product Risks, and Downstream Constraints

Document ID: V2-32  
Title: Validation Backlog, Product Risks, and Downstream Constraints  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 5 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-045)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-32.1 Purpose

This section is normative.

This chapter records the Volume 2 validation backlog, product risks, and downstream
constraints (REG-201 OUT-V2-026; REG-203 CAP-V2-049, FR-V2-049, UC-V2-051). Every unresolved
validation carries an accountable owner, a classification, and a future blocking gate so that
Volume 3 receives a managed, not a hidden, set of open questions.

## V2-32.2 Backlog-item record structure

This section is normative.

Each backlog item is recorded with the following fields:

- Identifier
- Question or risk
- Classification
- Current evidence
- Current confidence
- Accountable owner
- Consulted stakeholders
- Affected requirement or decision
- Affected product outcome
- Future blocking gate
- Required resolution evidence
- Target resolution volume

## V2-32.3 Backlog classification

This section is normative.

Each backlog item is one of the following kinds:

- Known product requirement
- Known but unvalidated product requirement
- Open policy decision
- Open operating-model decision
- Open financial decision
- Future technical-design question
- Future delivery-planning question

## V2-32.4 Validation backlog

This section is normative.

The following categories constitute the Volume 2 validation backlog. Each item's future
blocking gate is the material-commitment gate unless otherwise stated; the target resolution
volume is Volume 3 unless the item is a policy, financial, or executive decision that must be
resolved by the accountable authority.

- VB-01 pathway eligibility. Question: are the affiliation pathway-eligibility rules confirmed
  by policy? Classification: open policy decision. Accountable owner: Policy and compliance
  authority. Affected requirement: pathway rules (V2-13). Affected outcome: OUT-V2-003. Required
  resolution evidence: ratified pathway-eligibility policy. Target resolution volume: policy
  decision.
- VB-02 historical continuity. Question: how is historical affiliation continuity confirmed?
  Classification: known but unvalidated product requirement. Accountable owner: Domain data
  owner. Affected outcome: OUT-V2-002. Required resolution evidence: continuity data source and
  rule. Target resolution volume: Volume 3.
- VB-03 evidence carry-forward. Question: which evidence may carry forward between seasons?
  Classification: open policy decision. Accountable owner: Policy and compliance authority.
  Affected requirement: evidence rules (V2-14). Affected outcome: OUT-V2-005. Required
  resolution evidence: carry-forward policy. Target resolution volume: policy decision.
- VB-04 representative authority. Question: how is club representative authority verified?
  Classification: known but unvalidated product requirement. Accountable owner: Policy and
  compliance authority. Affected outcome: OUT-V2-005. Required resolution evidence:
  representative-authority rule. Target resolution volume: Volume 3.
- VB-05 reviewer delegation. Question: how is reviewer delegation governed? Classification:
  open operating-model decision. Accountable owner: Service owner. Affected outcome:
  OUT-V2-008. Required resolution evidence: delegation model. Target resolution volume: Volume 3.
- VB-06 jurisdiction exceptions. Question: how are jurisdictional routing exceptions handled?
  Classification: open operating-model decision. Accountable owner: Service owner. Affected
  outcome: OUT-V2-007. Required resolution evidence: exception model. Target resolution volume:
  Volume 3.
- VB-07 fee policy. Question: what is the confirmed fee policy? Classification: open financial
  decision. Accountable owner: Financial authority. Affected outcome: OUT-V2-010. Required
  resolution evidence: ratified fee policy. Target resolution volume: financial decision.
- VB-08 payment and reconciliation contract. Question: what payment and reconciliation contract
  governs activation? Classification: open financial decision. Accountable owner: Financial
  authority. Affected outcome: OUT-V2-010. Required resolution evidence: reconciliation contract.
  Target resolution volume: financial decision.
- VB-09 accounting boundary. Question: where is the accounting boundary between systems?
  Classification: open financial decision. Accountable owner: Financial authority. Affected
  outcome: OUT-V2-010. Required resolution evidence: accounting boundary definition. Target
  resolution volume: financial decision.
- VB-10 bilingual equivalence. Question: is bilingual task equivalence validated?
  Classification: known but unvalidated product requirement. Accountable owner:
  Official-languages/content authority. Affected outcome: OUT-V2-020. Required resolution
  evidence: bilingual conformance. Target resolution volume: Volume 3.
- VB-11 accessibility conformance. Question: is accessibility conformance validated?
  Classification: known but unvalidated product requirement. Accountable owner: Accessibility
  authority. Affected outcome: OUT-V2-020. Required resolution evidence: accessibility
  conformance. Target resolution volume: Volume 3.
- VB-12 privacy and restricted evidence. Question: is privacy and restricted-evidence handling
  validated? Classification: known but unvalidated product requirement. Accountable owner:
  Privacy authority. Affected outcome: OUT-V2-020. Required resolution evidence: privacy
  validation. Target resolution volume: Volume 3.
- VB-13 retention. Question: what are the confirmed retention rules? Classification: open policy
  decision. Accountable owner: Privacy authority and Domain data owner. Affected outcome:
  OUT-V2-021. Required resolution evidence: retention policy. Target resolution volume: policy
  decision.
- VB-14 service-level baselines. Question: what are the confirmed service-level baselines?
  Classification: known but unvalidated product requirement. Accountable owner: Service owner.
  Affected outcome: OUT-V2-024. Required resolution evidence: measured baselines. Target
  resolution volume: Volume 3.
- VB-15 notification channels. Question: which notification channels are confirmed?
  Classification: open operating-model decision. Accountable owner: Service owner. Affected
  outcome: OUT-V2-020. Required resolution evidence: channel model. Target resolution volume:
  Volume 3.
- VB-16 support ownership. Question: how is support ownership and escalation confirmed?
  Classification: open operating-model decision. Accountable owner: Support owner. Affected
  outcome: OUT-V2-020. Required resolution evidence: support operating model. Target resolution
  volume: Volume 3.
- VB-17 operational staffing assumptions. Question: what operational staffing does the service
  assume? Classification: open operating-model decision. Accountable owner: Service owner.
  Affected outcome: OUT-V2-024. Required resolution evidence: staffing model with executive
  acceptance. Target resolution volume: Volume 3 with executive acceptance.
- VB-18 external data reconciliation. Question: how is external data reconciliation confirmed?
  Classification: future technical-design question. Accountable owner: Domain data owner.
  Affected outcome: OUT-V2-002. Required resolution evidence: reconciliation design. Target
  resolution volume: Volume 3.
- VB-19 material organizational acceptance. Question: has material organizational acceptance
  been given? Classification: open operating-model decision. Accountable owner: Executive
  authority. Affected outcome: OUT-V2-023. Future blocking gate: material-commitment gate.
  Required resolution evidence: executive acceptance. Target resolution volume: executive
  decision.

## V2-32.5 Product risks

This section is normative.

The principal product risks are: unvalidated policy assumptions (VB-01, VB-03, VB-13);
unconfirmed financial contract and accounting boundary (VB-07, VB-08, VB-09); unvalidated
bilingual, accessibility, and privacy conformance (VB-10, VB-11, VB-12); and pending executive
organizational acceptance (VB-19). Each risk is owned and gated; none is closed by Volume 2.

## V2-32.6 Downstream constraints

This section is normative.

Volume 2 does not authorize technical architecture, delivery sequencing, staffing plans, cost
plans, or a master development plan. Volume 3 consumes this backlog as defined input and may
define the business operating model, but implementation and procurement remain unauthorized
until their governing decisions and the material-commitment gate are satisfied.

## V2-32.7 Authorization posture

This section is normative.

This chapter records open validations and risks only. It authorizes no implementation, no
procurement, and no resolution of any listed decision. Executive organizational acceptance
remains pending at the material-commitment gate.
