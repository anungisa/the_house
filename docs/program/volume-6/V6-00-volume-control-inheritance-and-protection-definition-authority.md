# V6-00 - Volume Control, Inheritance, and Protection-Definition Authority

Document ID: V6-00
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G1)

## V6-00.1 Purpose and scope

This section is normative.

This chapter establishes control of Volume 6, Package 1 — the Security, Privacy,
Compliance, Accessibility, and Trust Foundation of The House v2. Volume 6 defines
the protection, rights, assurance, and inclusive-service obligations that must
govern The House and The Button before any detailed control can be designed or
implemented.

Volume 6 Package 1 is an obligation-definition package. Its authority is limited
to protection and trust semantics: what must be protected, from whom, under what
obligations, and against what future validation. It designs, provisions, and
authorizes no control, executable security or privacy policy, identity or access
configuration, cryptographic material, infrastructure, monitoring, incident
response, accessibility remediation, or privacy workflow. Construction is
authorized only later, through the governed gate sequence, once the validation
obligations recorded in this package are satisfied.

## V6-00.2 Inheritance from Volumes 0 through 5

This section is normative.

Volume 6 inherits, without modification, the frozen Volume 0 foundation and the
released baselines of Volumes 1 through 5. The inherited data baseline is the
released Volume 5 governed-data foundation, published as
`central-registration-volume-5-v1.0.0`.

Volume 5 established the governed meaning, ownership, classification, and lineage
of information. Volume 6 defines the obligations that protect that governed data
and the rights of the people it concerns. Volume 6 does not restate, re-scope, or
alter any inherited Volume 0 through Volume 5 artifact; inherited chapters,
registers, decisions, approvals, gates, and released volume tags are resolved by
inheritance.

The inheritance lineage recorded for provenance is: the Volume 5 Package 1 source
snapshot, authoring, closure and freeze, and original package merge; the Volume 5
release chapter (V5-J) authoring and release merge; and the released baseline tag
`central-registration-volume-5-v1.0.0`. The machine-readable provenance of this
Volume 6 package is completed by the provenance amendment (V6-B) after mainline
merge, mirroring the Volume 4 and Volume 5 release-provenance discipline.

## V6-00.3 Protection-definition authority

This section is normative.

Volume 6 holds protection-definition authority for The House v2: the authority to
define what protection, privacy, compliance, accessibility, and trust obligations
govern the platform, who owns them, and what evidence must exist before they can
be relied upon. Protection-definition authority is distinct from:

- control implementation authority — the authority, granted only downstream, to
  build and operate a control;
- security operations authority — the authority to run monitoring, detection, and
  incident response;
- privacy and legal authority — the authority to determine legal basis, notice,
  and retention; and
- assurance authority — the authority to independently validate that a control is
  effective.

These are separate facts. Volume 6 records obligations; it never asserts that a
control exists, is effective, is compliant, is conformant, or has been
independently assured.

## V6-00.4 Controlled identifiers

This section is normative.

Volume 6 introduces controlled identifier families, each governed by a schema and
a non-authoritative control:

- assets, actors, trust boundaries, threats, abuse cases, and rights (REG-601);
- processing purposes, obligations, compliance obligations, control objectives,
  accessibility obligations, bilingual obligations, incident families, and
  assurance requirements (REG-602);
- decisions (REG-603);
- assumptions, risks, exceptions, and validation backlog items (REG-604); and
- approvals (REG-605), indexed by the corpus index (REG-600).

Every record in every Volume 6 register carries `authorizes_implementation: false`
and an implementation status of not-implemented/not-proven. No record in this
volume authorizes construction.

## V6-00.5 Amendment rules

This section is normative.

Once ratified and frozen, a Package 1 chapter changes only through a recorded
amendment. Substantive change requires a new gate. Narrow additive provenance
amendment is permitted where it preserves the recorded gate disposition and the
package freeze without reopening substantive content, as completed by V6-B.

## V6-00.6 Explicit non-authorizations

This section is normative.

This chapter, and Volume 6 Package 1 as a whole, authorizes none of the following:
runtime code change; executable security or privacy policy; identity or access
roles, permissions, or access policies; network or cryptographic configuration;
secrets, certificates, or keys; infrastructure provisioning; monitoring, incident
response, or privacy workflows; accessibility remediation; retention periods or
destruction schedules; claims of legal, security, privacy, or accessibility
conformance, operational proof, or independent assurance; vendor selection or
procurement; delivery sequencing; staffing or cost plans; or a master development
plan.
