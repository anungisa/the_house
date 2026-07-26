# V4-37 - Engineering Handoff and Downstream-Volume Constraints

Document ID: V4-37  
Title: Engineering Handoff and Downstream-Volume Constraints  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-050)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-37.1 Purpose and scope

This section is normative.

This chapter defines the controlled handoff from Volume 4 to the later volumes and the constraints each
downstream volume inherits (ARCH-V4-036, CTRL-V4-038). It defines what each volume must respect; it
does **not** author those volumes, sequence them, or authorize their implementation. It is
**architecture definition only**.

## V4-37.2 Volume 5 - Data

This section is normative.

Volume 5 inherits: authoritative information ownership; conceptual identity and relationship
constraints; evidence provenance; jurisdiction and tenant integrity; projections as non-authoritative;
reconciliation; and correction and retention dependencies. It may not reassign governed data authority
or treat a projection as authoritative (constrains from ARCH-V4-019, DATA-V4-015).

## V4-37.3 Volume 6 - Security, privacy, compliance, accessibility, and trust

This section is normative.

Volume 6 inherits: resource-aware authorization; sensitive-evidence handling; service trust; secrets
and cryptography; privacy minimization; security evidence; accessibility and bilingual constraints; and
independent-assurance boundaries. It may not weaken the Package 3 security and privacy boundaries
(ARCH-V4-024, CTRL-V4-026) and may not claim accreditation without evidence.

## V4-37.4 Volume 7 - Experience

This section is normative.

Volume 7 inherits: Button/House authority separation; user-visible state derived from governed state;
required-action semantics; error and recovery behaviour; and bilingual and accessible interaction
constraints. The Button uses controlled application contracts and projections and does not write
governed persistence (ARCH-V4-002, ARCH-V4-028).

## V4-37.5 Volume 8 - APIs, events, and integrations

This section is normative.

Volume 8 inherits: controlled contract ownership; versioning; idempotency; webhook authentication;
reconciliation; external authority; retries and replay; and anti-corruption boundaries (ARCH-V4-023,
API-V4-006, EVT-V4-005). It may not silently cede House authority to an external system.

## V4-37.6 Volume 9 - Quality and master testing

This section is normative.

Volume 9 inherits: the fitness-function catalogue; the test classes; evidence requirements; PostgreSQL
and composition verification; resilience and restore proof; and acceptance traceability (ARCH-V4-031,
CTRL-V4-033). It may not treat lower-fidelity verification as proof of higher-fidelity behaviour.

## V4-37.7 Volumes 10 and 11 - Delivery and operations

This section is normative.

Volumes 10 and 11 inherit: no implementation sequence inferred from architecture; migration and cutover
constraints; deployment-path evidence; operational ownership; readiness gates; and recovery evidence
(ARCH-V4-032, CTRL-V4-038). Architecture order is not delivery order, and no sequence, wave, staffing,
or cost is implied by this volume.

## V4-37.8 Non-authorizations

This section is normative.

This chapter authorizes no implementation and authors no downstream volume. It sequences nothing,
schedules nothing, and staffs nothing. Downstream constraints are defined, not executed. Every element
it introduces carries `authorizes_implementation: false`.
