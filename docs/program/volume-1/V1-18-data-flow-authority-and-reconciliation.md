# V1-18 - Data Flow, Authority, and Reconciliation

Document ID: V1-18  
Title: Data Flow, Authority, and Reconciliation  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-D, REG-108 APP-V1-028)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G4)  
Supersedes: None  
Review Cycle: Frozen at Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-18.1 Purpose and grounding

This section is normative.

This chapter maps how material data moves across the ecosystem, which system holds or
claims authority for each element, and where reconciliation is required. It is
structured into `generated/ecosystem/data-flow-inventory.json`,
`generated/ecosystem/integration-inventory.json`, and
`generated/ecosystem/reconciliation-inventory.json` from the controlled input
(REG-101 SRC-019) and the ratified authority boundaries (SRC-016). Each element
records its current source, operational owner, claimed authority, transfer mechanism,
duplicate copies, reconciliation method, quality concern, and privacy classification.

Elements are OPERATIONAL_TRUTH or ASSUMPTION pending validation (REG-104 FND-038,
FND-040).

## V1-18.2 Material data elements and their authority

This section is normative.

Eight material data elements are inventoried (data-flow-inventory.json):

- **DATA-ORG (organizations/clubs)** - source: incumbent provider + manual; claimed
  target authority: Curling Canada; concern: duplicate/mismatched club identities.
- **DATA-IDENTITY (participants/identities)** - source: incumbent + Curling I/O +
  manual; concern: multi-role individuals collapsed into coarse buckets; **high
  privacy**.
- **DATA-MEMBERSHIP (membership)** - source: incumbent provider (transition) → The
  House (target); **high privacy**.
- **DATA-AFFILIATION (affiliation)** - source: incumbent + email + spreadsheets;
  concern: decisions/evidence outside a governed store.
- **DATA-PAYMENTS (payments/fees)** - source: processor + spreadsheets; concern:
  processor-versus-ledger reconciliation gaps.
- **DATA-COMPLIANCE (compliance/accreditation/education)** - source: Sideline +
  accreditation; concern: lapsed certifications not reflected at decision time.
- **DATA-DOCS (documents/evidence)** - source: email + shared files + Document360;
  concern: evidence not bound to governed decisions.
- **DATA-SUPPORT (support cases)** - source: support tooling; concern: support context
  detached from governed records; *ASSUMPTION pending validation.*

Two elements (identities, membership) are **high-privacy** and engage Canadian privacy
obligations; the target must handle them accordingly (V1-19 CST-PRIVACY).

## V1-18.3 Reconciliation points

This section is normative.

Reconciliation is currently manual across systems (reconciliation-inventory.json;
REG-104 FND-035). The material reconciliation boundaries are:

- **Payment processor ↔ accounting ledger (SYS-003 ↔ SYS-008)** - the governed charge
  decision and fee policy remain in The House; the processor executes; the accounting
  system is the ledger truth. This boundary is grounded in ratified Volume 0 and must
  be explicit and automated in the target.
- **Curling I/O ↔ The House master data (SYS-001 ↔ master data)** - operational
  league/competition data synchronizes without overriding governed club, affiliation,
  and participant master data.
- **External systems of record ↔ projections (SYS-004/005/008)** - The House projects
  status and governs its use; it does not own the underlying record.
- **Manual reconciliation (SYS-011)** - the spreadsheet-based cross-system
  reconciliation performed today is a weakness to retire, not a boundary to preserve.

## V1-18.4 Data-quality and duplication findings

This section is normative.

The dominant data-flow finding is **authoritative duplication** (REG-104 FND-038,
registered as contradiction CON-012): organization, identity, membership, and
affiliation data are duplicated across the incumbent provider, Curling I/O, external
systems of record, and manual files, reconciled by manual matching. The target must
establish a single master-data authority (Curling Canada, per Volume 0 V0-06) and
retire duplicate authoritative copies. A second finding, **role flattening**
(FND-040), requires the target identity model to represent concurrent,
jurisdiction-scoped roles without collapsing them.

## V1-18.5 What this chapter establishes for the target

This section is normative.

The target platform must:

- establish Curling Canada as the single master-data authority for club, affiliation,
  and participant data, retiring duplicate authoritative copies;
- implement explicit, automated reconciliation across the SYS-003/SYS-008 and
  SYS-001/master-data boundaries;
- treat identities and membership as high-privacy data;
- project external systems-of-record status rather than owning it.

These become constraints in V1-20. Master-data authority is deferred to convergence
(REG-106 QD-033). This chapter authorizes no implementation.
