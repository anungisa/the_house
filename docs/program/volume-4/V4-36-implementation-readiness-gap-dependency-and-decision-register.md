# V4-36 - Implementation-Readiness Gap, Dependency, and Decision Register

Document ID: V4-36  
Title: Implementation-Readiness Gap, Dependency, and Decision Register  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-049)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-36.1 Purpose and scope

This section is normative.

This chapter creates the architecture-level implementation-readiness register for downstream volumes
(ARCH-V4-036). It records, for each gap or open question, its classification, affected architecture
element, current evidence, confidence, owner, required decision, resolution evidence, target volume,
future blocking gate, and implementation impact. It is **architecture definition only**: it resolves
no gap by assertion and authorizes no implementation.

## V4-36.2 Gap categories

This section is normative.

The gap categories include: policy validation; data and retention; identity contract;
evidence-storage capability; payment and accounting acknowledgement; PostgreSQL concurrency; outbox
ownership; search and analytics; environment topology; cryptography; secrets and key management;
backup and restore; accessibility; bilingual equivalence; migration source quality; operational
ownership; quality-attribute baselines; technology selection; architecture verification; and
independent assurance. Each category is carried in REG-404 with a named owner and a future resolution
gate.

## V4-36.3 Gap record model

This section is normative.

Each gap is recorded, for downstream governance, with: gap or question; classification; affected
architecture element; current evidence; confidence; owner; required decision; resolution evidence;
target volume; future blocking gate; and implementation impact. No gap is recorded as resolved without
resolution evidence.

## V4-36.4 Readiness classification

This section is normative.

Each item is classified as one of: `ARCHITECTURE_DEFINED`; `ARCHITECTURE_VALIDATION_PENDING`;
`CONTRACT_VALIDATION_PENDING`; `POLICY_PENDING`; `SECURITY_VALIDATION_PENDING`;
`PRIVACY_VALIDATION_PENDING`; `OPERATING_MODEL_PENDING`; `DELIVERY_PLANNING_INPUT`;
`IMPLEMENTATION_EVIDENCE_REQUIRED`; or `INDEPENDENT_ASSURANCE_REQUIRED`. The classification
distinguishes what is architecturally defined from what still requires validation, policy, contract,
security, privacy, operating-model, delivery-planning, implementation, or independent-assurance
resolution.

## V4-36.5 Use by downstream volumes

This section is normative.

The readiness register is an input to later volumes and to any future delivery planning; it does not
constitute a plan, a sequence, or an authorization. Items classified `DELIVERY_PLANNING_INPUT` inform,
but do not create, the master development plan, which remains outside Volume 4 (constrains V4-37,
V4-38). Confidence is recorded honestly, and low-confidence items are not promoted to defined status.

## V4-36.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation and creates no plan or sequence. It resolves no gap by
assertion, claims no validation, and produces no schedule, staffing, or cost. The register is a
governance input, not an authorization. Every element it introduces carries `authorizes_implementation:
false`.
