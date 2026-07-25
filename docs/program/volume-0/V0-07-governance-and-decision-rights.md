# V0-07 - Governance and Decision Rights

Document ID: V0-07
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority; surname to be recorded in REG-001)
Associated Gate: G0
Ratification: Package 2; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable future gate (REG-006 APP-003)
Related Documents: V0-06 (authority doctrine over systems), V0-08 (engagement model and consultation thresholds)

This chapter is normative except where a subsection is marked explanatory. It
defines the program operating model, authorities, decision classes, gate control,
and the honest separation between authorization and independent validation.

## 7.1 Operating doctrine

This subsection is normative.

The Central Registration Platform is a solo-led, institutionally accountable
delivery program. The Accountable Program Authority MAY perform multiple delivery
and governance roles where organizational capacity requires it. Governance will be
achieved through explicit decisions, traceability, automated controls, evidence,
targeted domain consultation, and proportionate independent assurance - not
through unnecessary committee dependency.

Companion control:

Combined authority MAY authorize progression but MUST NOT be represented as
independent validation. Any claim requiring independent assurance MUST remain
conditional until the appropriate review has occurred.

The governing requirement is:

A role MUST be performed and its decisions MUST be traceable. A separate person is
required only when independence, specialized authority, or executive acceptance is
materially necessary.

## 7.2 Single accountable authority

This subsection is normative.

The following roles are assigned and recorded in REG-001:

```
Accountable Program Authority:            Aubert Nungisa
Program Owner:                            Aubert Nungisa
Product Owner:                            Aubert Nungisa
Technology and Architecture Authority:    Aubert Nungisa
Data and Integration Authority:           Aubert Nungisa
Delivery Authority:                       Aubert Nungisa
Quality and Evidence Authority:           Aubert Nungisa
Documentation and Traceability Authority: Aubert Nungisa
```

Executive acceptance is held by Nolan as Executive Sponsor Candidate and Executive
Acceptance Authority. Nolan's confirmation as Executive Sponsor and any material
funding commitment are time-bounded Gate G0 conditions (V0-12), not blockers to
controlled documentation, design, testing, or implementation of the affiliation
slice.

These assignments eliminate artificial TBDs. A role is only TBD when it is
genuinely unassigned (for example, a named independent assessor for a specific
future assurance activity).

## 7.3 Combined roles are permitted

This subsection is normative.

In a solo-led delivery model, one individual MAY perform multiple program roles.
Role combination does NOT remove the obligations attached to those roles.
Decisions, assumptions, evidence, tests, and conflicts MUST remain explicitly
recorded.

The corpus MUST distinguish four distinct role states. They are not the same:

- role not performed;
- role performed by the Accountable Program Authority;
- role independently reviewed;
- role organizationally approved.

## 7.4 Authorization is not independent validation

This subsection is normative.

The Accountable Program Authority MAY authorize the program's own development work
because that authority is accountable for delivering it. That authorization MUST
NOT be characterized as independent certification.

Every governed readiness or compliance claim MUST carry an evidence label drawn
from the controlled vocabulary below. Labels are recorded with the claim and in
REG-006 / REG-008 where applicable.

Controlled evidence labels:

- `AUTHOR-VERIFIED` - checked by the accountable author.
- `SELF-ATTESTED` - asserted by the accountable author without independent check.
- `AUTOMATED-EVIDENCE` - produced by automated tests, checks, or pipelines.
- `PEER-REVIEWED` - reviewed by another qualified individual.
- `DOMAIN-VALIDATED` - validated by a named domain contributor (for example Jen,
  Hélène) within their expertise.
- `REVIEWED` - reviewed with a named contributor (for example strategy with Rich).
- `EXECUTIVE-ACCEPTED` - accepted by Nolan as executive acceptance authority.
- `INDEPENDENTLY-ASSESSED` - assessed by a qualified independent reviewer.
- `PRODUCTION-PROVEN` - demonstrated by evidence from controlled production use.

A claim requiring independence (privacy, security, accessibility, French-language,
legal, financial-control, disaster-recovery, or material compliance) MUST NOT use
an authorization label as a substitute for `INDEPENDENTLY-ASSESSED`.

## 7.5 Decision classes

This subsection is normative. Classes are the authoritative definition referenced
by V0-05 principles, Annex B, and REG-002.

| Class | Name | Held by | Authorizable now by accountable authority |
| --- | --- | --- | --- |
| D0 | Executive and organizational acceptance | Nolan | No - executive gate |
| D1 | Program and product authority | Aubert | Yes |
| D2 | Delivery and sequencing authority | Aubert | Yes |
| D3 | Technology and architecture authority | Aubert | Yes |
| D4 | Compliance, privacy, and policy authority | Aubert (author); Jen (domain) | Design yes; production validation deferred |
| D5 | Data and integration authority | Aubert | Yes |
| D6 | Quality and evidence authority | Aubert | Yes |
| D7 | Strategy review | Rich | Consultative, when review-ready |
| D8 | Operational acceptance | PTSO / club / operations cohort | Before pilot/production exposure |
| D9 | Independent assurance | Qualified specialist reviewers | Before corresponding production exposure |

D0, D8, and D9 require a separate person because independence, operational
authority, or executive acceptance is materially necessary. D1-D6 are performed by
the Accountable Program Authority under the combined-roles clause (7.3) and MUST
remain traceable.

## 7.6 Gate control - evidence, not headcount

This subsection is normative.

A gate MUST NOT ask "did enough different people approve this?" A gate MUST ask:
are the necessary decisions defined, has the relevant expertise been applied, are
the risks understood, and does the evidence justify progression?

A solo-led gate MAY pass when:

- required artifacts are complete;
- assumptions are explicit;
- automated evidence exists where applicable;
- no unresolved critical contradiction remains;
- external validation is scheduled for the correct later gate;
- nothing is represented as independently approved when it is not.

### 7.6.1 Internal progression gates (accountable authority controls directly)

Documentation completeness, requirements readiness, architecture readiness,
implementation readiness, test readiness, integration readiness, repository
quality, traceability, and technical proof. These gates allow work to continue
without waiting for external parties.

### 7.6.2 Domain consultation gates (targeted input when material exists)

Strategy (Rich), business and financial model (Hélène), compliance and policy
(Jen), operational process (staff, PTSOs, clubs). A consultation gate carries one
of these states and MUST NOT block earlier design work unnecessarily:

- `NOT_YET_REQUIRED`
- `READY_FOR_REVIEW`
- `REVIEWED`
- `REVIEWED_WITH_CONDITIONS`

### 7.6.3 Executive gates (Nolan)

Required for: organizational commitment; material budget; production pilot
authorization; national rollout; significant policy change; formal Curling Canada
ownership; acceptance of operating risk. Nolan MUST NOT be required for every
document package, every ADR, each database migration, routine engineering
sequencing, automated test design, or internal prototype evolution.

### 7.6.4 Independent-assurance gates (qualified reviewers)

Reserved for claims that genuinely require independence: privacy impact;
penetration or security assessment; accessibility certification or expert review;
legal interpretation; production financial-control assurance; disaster-recovery
proof; material compliance certification. These occur before the corresponding
exposure, not before design or build is permitted.

## 7.7 Constitutional authority matrix

This subsection is normative.

| Authority | Assigned person | Can authorize now |
| --- | --- | --- |
| Program direction | Aubert | Yes |
| Product scope and sequencing | Aubert | Yes |
| Architecture and engineering | Aubert | Yes |
| Data and integration design | Aubert | Yes |
| Development gates | Aubert | Yes |
| Quality and evidence gates | Aubert | Yes |
| Strategic review | Rich | When review-ready |
| Business and financial review | Hélène | When review-ready |
| Compliance and policy review | Jen | When review-ready |
| Executive organizational acceptance | Nolan | Before material commitment / pilot |
| Production security assurance | Specialist review | Before production |
| Accessibility validation | Specialist / user validation | Before production |
| French-language validation | Qualified reviewer / user cohort | Before production |

## 7.8 Escalation and conflict

This subsection is normative.

Where a combined-role decision conflicts with domain expertise (Rich, Hélène, Jen)
or with an independent assessment, the more independent input governs for its
domain and the conflict MUST be recorded in REG-002 with disposition. Unresolved
material conflict escalates to the executive gate (D0).

## Constitutional control

No authority assignment or decision-class assertion in this chapter is valid
without a corresponding record in REG-001, REG-002, and REG-006. Executive
acceptance (D0) and independent assurance (D9) claims MUST NOT be asserted until
the corresponding record exists.

This chapter is consistent with V0-06 (which assigns authority over systems and
external platforms) and V0-08 (which defines named engagement, consultation
triggers, the non-blocking consultation rule, and when independent expertise is
mandatory). Decision classes D0-D9 defined here are the authoritative reference for
both chapters.
