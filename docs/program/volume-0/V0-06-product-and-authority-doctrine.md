# V0-06 - Product, Repository, and Authority Doctrine

Document ID: V0-06
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: G0
Ratification: Package 2; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable future gate (REG-006 APP-006)
Related Documents: V0-07 (governance and decision rights), V0-08 (stakeholder and engagement model)
Related Decisions: DEC-V0-018, DEC-V0-019, DEC-V0-023
Related Registers: REG-005 (source and authority), REG-002 (decisions), REG-003 (RAID)

## 6.1 Purpose

This chapter defines the authority doctrine of the program: which product or system
holds authority over which decisions and data, what each system must not claim, how
each system moves through its lifecycle, and how authority conflicts are resolved.

Authority here means the right to be the origin of truth for a defined decision or
data domain. It is distinct from usefulness, effort invested, or maturity of
implementation. A system can be valuable and still hold no governing authority.

This doctrine binds The House, The Button, the Base44 corpus, and every external
platform. Machine-readable authority classifications are recorded in REG-005; this
chapter is the normative narrative those records implement.

## 6.2 Authority vocabulary

Every system is assigned exactly one primary authority type. The permitted types are:

- authoritative source: approved origin of truth for a defined decision or data
  domain. Other systems must defer to it within that domain.
- execution plane: performs an operation on instruction but is not the origin of
  the governed decision or the durable record of truth.
- synchronization partner: exchanges operational data bidirectionally within a
  bounded domain; neither party is unconditionally authoritative over the other.
- projection source: receives a read-only projection of governed truth; it never
  writes back governed state.
- reporting source: consumes projected data for analysis or presentation; it holds
  no authority over the underlying records.
- temporary transition platform: currently holds operational or legacy truth that
  will be migrated and retired; authoritative only until an explicit
  migration-completion trigger (a recorded cutover decision in REG-002) fires, after
  which its authority expires and it is retired.
- replaceable provider: supplies a commodity capability that can be substituted
  without changing governed truth.

## 6.3 The House

Authority. The House is the intended governed platform and system-of-record
foundation. Within the program it holds authority over:

- governed domain state and lifecycle transitions;
- transactional consistency and durability of governed records;
- organization, affiliation, and participant records, and future membership records;
- versioned governance policy execution;
- evidence metadata and append-only audit;
- workflow and approval sequencing;
- integration events emitted from governed state (transactional outbox);
- production controls that gate what may enter production.

Non-authority (must not claim). The House MUST NOT claim that:

- the repository is already production-ready;
- all Base44 capabilities have been adopted or reconciled;
- all external platforms have been replaced;
- prior technical gaps in authorization, composition, evidence-binding, workflow, or
  operations are closed absent recorded evidence.

Lifecycle posture. The House is treated as target-platform current implementation
truth (a production-candidate baseline), not established production truth. Material
authorization, composition, evidence-binding, workflow, and operational gaps
identified in prior assessment must be closed, with evidence, before production-truth
status is claimed. This is consistent with REG-005 SRC-003.

Conflict rule. Where The House implementation conflicts with ratified policy or an
approved target design, policy and approved design govern; The House implementation
is corrected. The House does not become authoritative by virtue of already being coded.

Transition posture. The House progressively assumes system-of-record authority over
each governed domain only as that domain's controls and evidence are complete. Until
then, an incumbent external platform may remain the temporary transition authority
for that domain.

## 6.4 The Button

Authority. The Button is the intended client-facing operating experience. It holds
authority over:

- user interaction and presentation;
- guided journeys and workspaces;
- display of status and required actions;
- forms and submission capture;
- accessible and bilingual (English and French) interaction;
- contextual help and support surfaced to users.

Non-authority (must not own). The Button MUST NOT own:

- authorization decisions;
- governed domain state;
- policy decisions;
- lifecycle transitions;
- transactional truth.

Lifecycle posture. The Button is not yet an implemented authority. It MUST NOT act
as an independent authority layer. It requests actions from The House and renders
the results; it never becomes the origin of governed truth.

Conflict rule. Where The Button presentation implies a state, permission, or
decision that The House does not hold, The House governs and The Button is corrected.
Interaction convenience never overrides governed truth.

Transition posture. The Button matures from prototype interaction toward a governed
experience layer that consumes The House contracts. It gains no governed authority
as it matures.

## 6.5 Base44 corpus

Authority. Base44 is authoritative only as evidence, specifically as:

- product-discovery evidence;
- interaction-design reference;
- workflow-hypothesis source;
- information-architecture reference;
- capability inventory;
- terminology and user-experience evidence.

Non-authority (must not govern). Base44 MUST NOT govern:

- production security;
- final domain models;
- server-side authorization;
- authoritative workflow;
- data integrity;
- release readiness.

Lifecycle posture. Base44 is reference-case evidence (REG-005 SRC-004). Its content
informs design hypotheses that are then validated, redesigned, or rejected under
program controls. Adoption of a Base44 capability is a decision, not an inheritance.

Conflict rule. Where Base44 content conflicts with ratified policy, approved target
design, or The House governed model, the program controls govern and Base44 is
treated as an input to be reconciled, not an authority.

Transition posture. Base44 remains a discovery reference throughout Volume 0. It is
never promoted to a governing source; individual capabilities graduate only by
explicit decision into approved target design and then into The House.

## 6.6 External platforms

Each external platform is assigned exactly one primary authority type. Detailed and
machine-readable records are held in REG-005 (SRC-005 and following). No external
platform holds governing authority over The House domain models, server-side
authorization, or production release readiness.

| Platform | Primary authority type | Bounded domain |
| --- | --- | --- |
| Curling I/O | synchronization partner | league and competition operational data (not club or participant master data) |
| Current registration provider | temporary transition platform | incumbent registration and membership records, until migrated and retired |
| Payment processors | execution plane | payment authorization and capture on instruction |
| Sideline Learning | authoritative source (external) | learning and certification completion records |
| Accreditation platforms | authoritative source (external) | accreditation status and standing |
| Document360 | replaceable provider | documentation and knowledge-base hosting |
| Analytics platforms | reporting source | reporting and business intelligence over projected data |
| Accounting systems | authoritative source (external) | financial ledger and accounting system of record |

Non-authority (all external platforms). No external platform may:

- override ratified policy or approved target design;
- author The House governed domain models;
- perform server-side authorization for The House;
- declare a governed lifecycle transition final;
- assert production release readiness for the program.

Lifecycle and transition posture.

- Curling I/O exchanges league and competition operational data within its bounded
  domain. It holds no club or participant master-data authority: The House is the
  master-data authority for club, affiliation, and participant records, and Curling
  I/O competition or league standing never overrides that governed master data.
- The current registration provider holds incumbent truth only until migration
  completes; it is then retired. It is authoritative for legacy data during
  transition, not for the future target state. Its transition authority expires on an
  explicit migration-completion trigger: a recorded cutover decision in REG-002 that
  marks the domain migrated. Absent that trigger, its authority neither silently
  persists nor silently lapses.
- Payment processors execute payment instructions; the governed decision to charge,
  the fee policy, the evidence, and the resulting governed record remain in The
  House. Payment processors do not own Curling Canada fee policy and are not the
  accounting truth.
- Sideline Learning and accreditation platforms remain external systems of record for
  their respective domains; The House holds a projection and governs how that status
  is used, not the underlying record.
- Document360 hosts documentation and can be substituted without changing governed
  truth.
- Analytics platforms consume projected data only, write no governed state, and MUST
  NOT become a system of record; a reporting projection never converts into
  authoritative truth.
- Accounting systems remain the financial system of record; The House synchronizes to
  them and does not overwrite the accounting ledger. The reconciliation boundary is
  explicit: payment processors execute and evidence transactions, The House holds the
  governed charge decision and the fee policy, and the accounting system holds the
  financial ledger; the three are reconciled and none silently overrides another.

Conflict rule. Where an external platform's data conflicts with governed truth inside
its assigned authority type, the assigned type decides: an external authoritative
source governs its own domain; an execution plane, synchronization partner,
projection source, reporting source, or replaceable provider does not override The
House governed state.

## 6.7 Authority precedence (normative)

When authority sources conflict, the following order governs, highest first:

1. Ratified Curling Canada policy and executive decisions (REG-005 SRC-001).
2. Approved program and domain decisions (REG-005 SRC-002).
3. Approved target designs governing implementation direction.
4. External authoritative sources within their assigned domain (REG-005 SRC-005+).
5. The House current implementation truth: production-candidate, not final
   production authority (REG-005 SRC-003).
6. Base44 discovery and reference-case evidence only (REG-005 SRC-004).

Neither The House repository nor the Base44 corpus overrides ratified policy or
approved target design. Being implemented does not confer authority.

## 6.8 Constitutional control

No system enters production authority because it has been built, purchased, or
integrated. A system holds authority only where this doctrine and REG-005 assign it,
and only within the assigned domain. Unassigned authority is denied by default
(fail closed). Changes to this doctrine require a governance decision recorded in
REG-002 and, for ratified text, a constitutional amendment under V0-00 control.

Ratification: Package 2. Evidence label SELF-ATTESTED / AUTHOR-VERIFIED; independent
validation not claimed; executive acceptance pending at applicable future gate.
