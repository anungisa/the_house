# V1-23 - System, Data-Authority, and Reconciliation Convergence

Document ID: V1-23  
Title: System, Data-Authority, and Reconciliation Convergence  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 5 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-E, REG-108 APP-V1-036)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G5)  
Supersedes: None  
Review Cycle: Frozen at Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-23.1 Purpose

This section is normative.

This chapter converges target **system authority**, **data authority**, and
**reconciliation** across the thirteen governed domains, and disposes the current manual
controls. It answers the question of who owns what in the target, and where authority is
defined versus explicitly unresolved. The matrices are structured into
`generated/convergence/system-authority-matrix.json`,
`generated/convergence/data-authority-matrix.json`, and
`generated/convergence/reconciliation-matrix.json`.

## V1-23.2 Controlling boundaries

This section is normative.

Seven controlling boundaries govern every domain disposition:

1. The House owns governed lifecycle state where assigned by doctrine.
2. The Button presents guided experiences but does not independently own governed state.
3. Payment processors execute transactions but do not define fee policy or accounting
   truth.
4. Accounting systems retain ledger authority.
5. Analytics platforms are projections, not transactional systems of record.
6. Base44 remains product evidence, not production authority.
7. Transitional systems require explicit exit triggers.

## V1-23.3 Target system and data authority

This section is normative.

The thirteen governed domains and their target authority:

- **organizations_and_clubs** — The House organization registry; Curling Canada
  master-data intent. Unresolved: master-data authority contradiction CON-012 open.
- **participants_and_identity** — The House participant registry; Curling Canada identity
  master. Unresolved: concurrent-role model and identity matching (FND-053); M365
  identity-provider dependency unvalidated.
- **membership** — The House / Curling Canada (pending validation). Unresolved:
  membership authority split.
- **affiliation** — The House `entity_state`, Governance Kernel sole transition
  authority. No material unresolved condition for state authority.
- **registration** — transitional incumbent provider → The House (target). Requires an
  explicit exit trigger. Unresolved: migration approach/timing (CON-014 open).
- **compliance** — external systems of record (accreditation, education) preserved; The
  House gates on compliance signals. Unresolved: gating/projection model (Jen).
- **payments** — The House owns fee policy; the payment processor executes. Unresolved:
  processor terms/economics (Helene).
- **accounting** — the accounting system retains ledger authority; The House holds a
  reconciliation boundary only. Unresolved: reconciliation format/cadence (Helene).
- **accreditation** / **learning** — external systems of record retain authority; The
  House consumes status. Unresolved: integration scope.
- **evidence_and_documents** — The House `evidence_object` metadata is authoritative and
  immutable. Unresolved: required-document matrix (Jen).
- **analytics** — projection only, not a system of record.
- **support** — external support tooling; assumptions unvalidated.

## V1-23.4 Reconciliation convergence

This section is normative.

Reconciliation boundaries inherit the ratified Volume 0 authority model. The material
reconciliation obligations are: registration-data extraction from the incumbent provider
during migration; payment-confirmation ingestion against House fee policy; ledger
reconciliation with the accounting system; and compliance/accreditation/learning signal
ingestion from the external systems of record. Current cross-system reconciliation is
performed manually in spreadsheets today; the target replaces this with governed
reconciliation boundaries, but the format and cadence for each remain pending financial
and vendor validation.

## V1-23.5 Disposition of current manual controls

This section is normative.

Each current manual control is dispositioned with rationale rather than silently
dropped:

- **Manual reviewer assignment** → automated via reviewer routing (CAP-043, REBUILD).
- **Email/spreadsheet status tracking** → replaced by governed lifecycle state and
  Button status projection (CAP-039, CAP-048, RETAIN).
- **Manual evidence handling by email** → replaced by governed evidence binding
  (CAP-041, ADAPT), evidence metadata preserved and made immutable.
- **Manual fee/payment reconciliation** → replaced by a governed
  payment-reconciliation boundary (CAP-042/CAP-046), with charge execution and ledger
  authority preserved externally.
- **Historical/goodwill recognition by staff judgement** → represented by the continuity
  pathway (V1-24), pending eligibility validation.

No manual control is automated on the basis of current practice being automatically
desirable; each disposition is justified against implementation truth or policy truth.

## V1-23.6 Unresolved contradictions retained open

This section is normative.

Three material contradictions are **retained open** and are not force-closed or resolved
with the wrong authority type (REG-105; `generated/convergence/contradiction-disposition.json`):

- **CON-012 Master-data authority** — controlling claim type is national policy /
  decision authority. Curling Canada master-data intent is recorded; duplicated
  authoritative data in current practice keeps the item open pending migration and
  validation.
- **CON-013 Evidence binding** — controlling claim type is national policy / decision
  authority. Governed evidence binding is the target; current out-of-band practice keeps
  the item open pending operational validation.
- **CON-014 Registration-system authority during transition** — controlling claim type
  is contractual obligation. The incumbent provider is authoritative during transition
  and The House is the target; resolution requires an executed exit trigger and validated
  migration.

No convergence decision in this chapter authorizes implementation.
