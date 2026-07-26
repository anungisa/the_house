# V4-15 - Resource-Aware Authorization and Policy-Decision Architecture

Document ID: V4-15  
Title: Resource-Aware Authorization and Policy-Decision Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-020)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-15.1 Purpose and scope

This section is normative.

This chapter expands the Package 1 trust model (V4-05) into a controlled authorization architecture:
the authorization inputs, the policy decision and enforcement boundaries, and the fail-closed rules
that govern access to affiliation resources. It is architecture definition. It does not implement a
policy engine, select a vendor, or author executable authorization interfaces.

## V4-15.2 Authorization inputs

This section is normative.

An authorization decision is computed from the following inputs; role alone is never sufficient:

```
Authenticated identity
Role or functional authority
Organization membership
Target resource
Jurisdiction
Reviewer assignment
Requested action
Lifecycle state
Evidence sensitivity
Delegation
Policy version
Administrative or support context
```

## V4-15.3 Policy decision and enforcement boundaries

This section is normative.

The architecture distinguishes a **policy decision point** (which computes an allow or deny decision
from the inputs above) from **policy enforcement boundaries** (the application-service points at which
that decision is enforced). Policy information inputs - resource, organization, jurisdiction,
assignment, evidence sensitivity - are resolved before the decision is computed. The target resource
is loaded before authorization, so that decisions are made against actual resource facts rather than
against unverified claims.

## V4-15.4 Resolution and enforcement rules

This section is normative.

- **Resource loading before authorization** - the resource is resolved first; authorization is
  computed against it.
- **Organization and jurisdiction resolution** - organization membership and jurisdiction are
  resolved as decision inputs.
- **Reviewer-assignment enforcement** - where an action requires an assigned reviewer, the assignment
  is enforced as a decision input.
- **National escalation** - escalation to national authority is an explicit governed authority, not a
  bypass of resource authorization.

## V4-15.5 Specialized authorities

This section is normative.

The architecture defines distinct governed authorities that do not substitute for one another:

- **finance-specific permissions** - visibility into or update of reconciliation status;
- **support permissions** - support visibility into cases;
- **restricted-evidence access** - governed access to sensitive evidence;
- **administrative-correction authority** - authority to correct recorded information;
- **service-to-service authorization** - authorization of trusted internal callers;
- **delegated access and revocation** - governed delegation and its revocation.

Every authorization decision is logged (decision logging) with its inputs and outcome for audit.

## V4-15.6 Required architecture rules

This section is normative.

The authorization architecture holds the following fail-closed rules:

- role alone is insufficient;
- unresolved resource scope fails closed;
- unknown jurisdiction fails closed;
- a missing reviewer assignment fails closed where assignment is required;
- support visibility does not imply review or decision authority;
- finance visibility does not permit affiliation-decision changes;
- trusted internal callers do not bypass resource authorization.

## V4-15.7 Boundaries

This section is normative.

This chapter defines the authorization architecture and its rules. It does not select or implement a
policy-decision technology, define an executable policy language, or author authorization APIs; those
are downstream of Gate V4-G2 and subject to the identity-provider claims assumption recorded in
REG-404.
