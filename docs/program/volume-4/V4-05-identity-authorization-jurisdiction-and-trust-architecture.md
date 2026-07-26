# V4-05 - Identity, Authorization, Jurisdiction, and Trust Architecture

Document ID: V4-05  
Title: Identity, Authorization, Jurisdiction, and Trust Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-006)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-05.1 Purpose

This section is normative.

This chapter defines the target identity, authorization, jurisdiction, and trust architecture: how
subjects are authenticated, how authorization decisions are made, and how jurisdictional and
assignment scope constrain governed actions. Authorization elements are recorded as CTRL elements in
REG-401.

## V4-05.2 Authentication boundary

This section is normative.

Authentication is performed at an external identity-provider boundary. The House consumes an
authenticated identity subject but does not own credential storage or primary authentication. The
authentication boundary is a DEP element; the House fails closed when an authenticated subject cannot
be established.

## V4-05.3 Authorization inputs

This section is normative.

Every authorization decision is computed from the following inputs: identity; role; organization;
resource; jurisdiction; assignment; action; lifecycle state; evidence sensitivity; delegation; and
policy version. Authorization defaults to **deny**. A decision that cannot establish resource scope,
jurisdiction, assignment, or the governing configuration fails closed.

## V4-05.4 Roles, scope, and delegation

This section is normative.

The architecture represents: organization membership; representative authority; role-plus-resource
authorization; jurisdictional scope; assigned-reviewer scope; national escalation; finance authority;
support permissions; administrative correction authority; restricted-evidence access;
service-to-service identity; delegated access; and revocation. Delegated and service-to-service
identities carry their own authorization context and are auditable. Revocation is immediate and
governed.

## V4-05.5 Jurisdiction and assignment

This section is normative.

Governed actions are constrained by jurisdiction (which authority governs the affiliation) and by
assignment (which reviewer or function is assigned to the case). A reviewer may act only within
assigned jurisdiction and assignment scope. National escalation is an explicit, governed authority
path, not an implicit override. Tenant and jurisdiction isolation is expressed as a fitness function
in V4-09.

## V4-05.6 Fail-closed trust posture

This section is normative.

The trust architecture fails closed: when identity, role, organization, resource scope, jurisdiction,
assignment, evidence sensitivity, delegation, or policy version cannot be established, the action is
denied and the denial is auditable. Restricted evidence is accessible only to identities whose
authorization context grants the required sensitivity level.
