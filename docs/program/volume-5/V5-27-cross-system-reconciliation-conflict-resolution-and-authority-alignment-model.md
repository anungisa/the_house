# V5-27 - Cross-System Reconciliation, Conflict Resolution, and Authority-Alignment Model

Document ID: V5-27
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G3)

## V5-27.1 Purpose

This section is normative.

This chapter governs cross-system reconciliation: how records held in different systems are
compared, how conflicts are resolved, and how authority is aligned without inventing a new
authority. The authoritative catalogue is REG-501 and the authoritative rules are REG-502.
This chapter authorizes no implementation.

## V5-27.2 Reconciliation contexts

This section is normative.

A reconciliation context (REG-501, RCON-V5-001 through RCON-V5-003) names a House record,
an external record, a comparison basis, a mismatch class, and a conflict authority.
Reconciliation compares governed facts against a named authoritative source; it does not
create new facts. The Package 2 distinction between payment-provider acknowledgement and
accounting confirmation is preserved: reconciliation requires both.

## V5-27.3 Conflict resolution

This section is normative.

A conflict is resolved only to the named conflict authority (INTEG-V5-017). A reconciliation
never invents a new authority and never overrides a source's authority. Reconciled records
are consistent with their named authoritative source (QUALITY-V5-013). Resolution retains
evidence and lineage to both compared records and to the resolving authority
(LINEAGE-V5-010).

## V5-27.4 Authority alignment

This section is normative.

Reconciliation preserves authority boundaries: external facts retain their external
authority, financial facts retain their finance authority, and governed House facts retain
House authority. Affiliation approval, reconciliation, activation authorization, and
activation execution remain distinct governed facts and are never conflated by
reconciliation.

## V5-27.5 Downstream constraints and no authorization

This section is normative.

Downstream volumes must implement reconciliation so that it preserves authority boundaries
and resolves conflicts only to the named conflict authority. No record in this chapter
authorizes implementation, integration technology selection, or procurement. The
reconciliation authority-alignment validation obligation remains open in REG-504
(TEST-V5-022).
