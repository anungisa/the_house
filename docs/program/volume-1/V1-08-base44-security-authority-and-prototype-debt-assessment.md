# V1-08 - Base44 Security, Authority, and Prototype-Debt Assessment

Document ID: V1-08  
Title: Base44 Security, Authority, and Prototype-Debt Assessment  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-B, REG-108 APP-V1-011)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G2)  
Supersedes: None  
Review Cycle: Frozen at Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-08.1 Purpose

This section is normative.

This chapter records why the Base44 corpus, despite its product value, must never
become production authority. It separates three distinct classes of finding -
**product value**, **production risk**, and **unknown/constraint** - so that
value is not used to excuse risk and risk is not used to erase value. It qualifies
no capability and authorizes no work.

## V1-08.2 Finding classes

This section is normative.

- **Product value** - reusable intelligence worth carrying forward (adapted or
  rebuilt), recorded as `reusable_value` findings.
- **Production risk** - properties that disqualify the prototype as production
  authority as-is, recorded as `production_readiness_gap`,
  `architectural_accident`, `hardcoded_assumption`, `prototype_debt`,
  `duplicated_capability`, and `authority_conflict` findings.
- **Unknown / constraint** - open evidence questions that must not be assumed
  resolved, recorded as `constraint` and `capability_gap` findings.

## V1-08.3 Product value (reusable)

This section is normative.

- FND-001 - tiered affiliation review (club -> PTSO -> CC, with a
  more-information loop) is a coherent, reusable concept (ADAPT).
- FND-002 - the national hierarchy and `org_id` tenancy concept are reusable
  (ADAPT).
- FND-003 - compliance/consent/safe-sport concepts are relevant and reusable
  (ADAPT).
- FND-004 - a real fee/payment need, explored via a recognized processor
  (EXTERNALIZE).
- FND-020 - decision-governance concepts (decision instances, approval tiers)
  contain reusable governance intelligence (REBUILD the mechanism).

These are the assets the program should mine. They are E2 at best and are not
stakeholder-validated (FND-016).

## V1-08.4 Production risk (disqualifying as-is)

This section is normative. These findings are the core reason Base44 cannot be
production authority.

- **FND-005 (critical)** - 66 of 99 server functions mutate entities with no
  server-side permission check; only 2 of 99 check permission. Authorization is
  effectively absent on the write path (EV-003, EV-007).
- **FND-006 (critical)** - 78 of 99 functions run privileged via `asServiceRole`,
  amplifying every missing check into a privilege-escalation path (EV-014).
- **FND-007 (critical)** - authorization is client-side (RoleGate) and
  default-open: `canAccessPath` treats unknown paths as accessible, so access
  control fails open, contradicting the House fail-closed doctrine (EV-004,
  EV-016).
- **FND-008 (high)** - 82 routes hardcode role lists in `App.jsx` while the
  access matrix is declared the single source of truth, so displayed and enforced
  access drift (CON-001, CON-002).
- **FND-013 (high)** - tenancy is app-layer: 85 of 87 entities carry Mongo-style
  `rls` blocks (not a database boundary) and `org_id` was retrofitted via a 100%
  backfill to Curling Canada. This is not an isolation guarantee (EV-002,
  EV-012).
- **FND-010 (high)** - governed lifecycle is advanced by direct status mutation
  with no transition guard, approval gate, or audit boundary in the code path.
- **FND-014 (critical)** - payment readiness is a boolean flag rather than a
  reconciled processor state (CON-004).
- **FND-011 (medium)** - duplicated experience surfaces for the same need.
- **FND-012 (high)** - a generic workflow builder conflicts with the House
  doctrine forbidding arbitrary workflow/rule builders (RETIRE).
- **FND-009 (high)** - no automated tests and no CI in the export: no behaviour is
  regression-protected or independently verifiable from the code (EV-010).
- **FND-019 (authority conflict)** - the direct-mutation and client-authority
  model conflicts with the House Program Constitution, which requires all governed
  transitions to pass through the Governance Kernel (CON-007).

## V1-08.5 The authority conflict, resolved by policy

This section is normative.

CON-007 records the central conflict: Base44 (implementation truth, SRC-001)
advances governed lifecycle by direct mutation and client-side authorization,
while the House Program Constitution (policy truth, SRC-003) requires every
governed transition to pass through the Governance Kernel and forbids domains from
mutating governed state directly.

This contradiction is resolved by classification authority, not by preferring a
newer artifact: policy truth governs implementation truth. The Base44 mechanism is
dispositioned REBUILD (QD-001, QD-012, QD-014); the product concepts are retained
via ADAPT. The prototype informs requirements; it does not define authority.

## V1-08.6 Unknown / constraint

This section is normative. These are open and are disclosed rather than resolved.

- FND-015 - bilingual (English/French) localization coverage is unverified (E1).
- FND-016 - no evidence that surfaces were validated by clubs, PTSOs, or Curling
  Canada; interface polish is not endorsement (E1).
- FND-017 - 231 governance documents assert intent; documentation volume does not
  demonstrate implemented behaviour (E2, stakeholder statement).
- FND-018 - Club 360 substance is thin; insufficient evidence to qualify (E1).

## V1-08.7 Evidence and cross-references

This section is informative.

- Findings: REG-104 (FND-001..020)
- Evidence: REG-102 (EV-001..016)
- Contradictions: REG-105 (CON-001..007)
- Dispositions: REG-106 (QD-001..016)

This chapter records risk and value. It authorizes no remediation and no
construction; remediation decisions belong to later volumes and gates.
