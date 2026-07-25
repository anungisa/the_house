# V1-17 - External Systems and Their Authority

Document ID: V1-17  
Title: External Systems and Their Authority  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-D, REG-108 APP-V1-027)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G4)  
Supersedes: None  
Review Cycle: Frozen at Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-17.1 Purpose and grounding

This section is normative.

This chapter inventories the external systems and manual tools that support Curling
Canada operations and records **where authority resides** for each. It is structured
into `generated/ecosystem/system-inventory.json` and
`generated/ecosystem/authority-matrix.json` from the ratified Volume 0 authority
register (REG-101 SRC-016, Volume 0 REG-005) and the product-and-authority doctrine
(SRC-017, Volume 0 V0-06), supplemented by the controlled current-state input
(SRC-019).

The governing principle is ratified Volume 0 doctrine: **no external platform holds
governing authority over The House domain models, server-side authorization, or
production release readiness.** Each system is assigned exactly one primary authority
type with a bounded domain. **No system is automatically retained or retired by this
package; all target dispositions are UNPROVEN hypotheses.**

## V1-17.2 Systems grounded in ratified Volume 0 (POLICY_TRUTH)

This section is normative.

Eight systems carry authority classifications grounded in ratified Volume 0
(REG-101 SRC-016; REG-104 FND-039, POLICY_TRUTH):

- **SYS-001 Curling I/O** - *synchronization partner* (authority level 4). League and
  competition operational data only; holds no club or participant master data. The
  House remains master-data authority; competition standing never overrides governed
  master data.
- **SYS-002 Current registration provider** - *temporary transition platform*
  (level 4). Authoritative for legacy registration/membership data only until a
  recorded cutover; then retired (REG-104 FND-036).
- **SYS-003 Payment processors** - *execution plane* (level 4). Authorize and capture
  on instruction; do not own fee policy and are not the accounting truth.
- **SYS-004 Sideline Learning** - *authoritative source (external)* (level 4).
  Learning/certification completion records; The House holds a projection.
- **SYS-005 Accreditation platforms** - *authoritative source (external)* (level 4).
  Accreditation status; The House holds a projection.
- **SYS-006 Document360** - *replaceable provider* (level 6). Documentation hosting;
  substitutable without changing governed truth.
- **SYS-007 Analytics platforms** - *reporting source* (level 6). Consume projected
  data only; must not become a system of record.
- **SYS-008 Accounting systems** - *authoritative source (external)* (level 4).
  Financial ledger; The House synchronizes and does not overwrite it.

The reconciliation boundaries between SYS-003 (execution) and SYS-008 (ledger truth),
and between SYS-001 (operational data) and The House (master data), are explicit and
governing.

## V1-17.3 Systems and manual controls not addressed by Volume 0 (unvalidated)

This section is normative.

Four current-state systems and manual controls are **not** addressed by ratified
Volume 0 authority doctrine and are therefore ASSUMPTION or STAKEHOLDER_STATEMENT
pending validation (REG-101 SRC-019; system-inventory.json flags them
`unvalidated_not_in_v0`):

- **SYS-009 Support systems (Halo/Zendesk where relevant)** - support case management;
  no governed authority. *ASSUMPTION pending validation.*
- **SYS-010 Identity and Microsoft 365 services** - staff identity, email,
  collaboration, file storage; email/shared-file processes are manual controls, not
  systems of record. *ASSUMPTION pending validation.*
- **SYS-011 Manual spreadsheets and shared files** - ad hoc tracking of affiliation,
  fees, rosters, and reconciliation; untracked shadow authority and a data-quality
  risk. *STAKEHOLDER_STATEMENT pending validation.*
- **SYS-012 Email-mediated processes** - corrections, follow-ups, and approvals over
  email; decisions and evidence outside a governed store. *STAKEHOLDER_STATEMENT
  pending validation.*

SYS-011 and SYS-012 are the manual-control substrate the target must replace; they are
recorded weaknesses (REG-104 FND-034), not systems to preserve.

## V1-17.4 Authority-preservation constraint

This section is normative.

External authority must be **preserved and bounded, not absorbed** (REG-104 FND-039,
POLICY_TRUTH). Curling I/O retains its synchronization role; Sideline Learning,
accreditation platforms, and accounting systems retain their external-system-of-record
authority; payment processors retain their execution role. The target platform
integrates with these boundaries; it does not claim their underlying records. Where a
system holds no governing authority (Document360, analytics, support tooling), the
target must not let it become a de facto system of record.

## V1-17.5 What this chapter establishes for the target

This section is normative.

The target platform must respect each external system's bounded authority, honor the
SYS-003/SYS-008 and SYS-001/master-data reconciliation boundaries, and retire the
manual-control substrate (SYS-011, SYS-012) rather than encode it. No retain/retire
decision is made here; dispositions are deferred to convergence (REG-106 QD-031). This
chapter authorizes no implementation.
