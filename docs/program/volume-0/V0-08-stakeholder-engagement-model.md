# V0-08 - Stakeholder and Engagement Model

Document ID: V0-08
Status: IN_REVIEW
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: G0
Related Decisions: DEC-V0-020, DEC-V0-021
Related Registers: REG-001 (stakeholders), REG-002 (decisions), REG-003 (RAID)

## 8.1 Purpose

This chapter names the real people engaged in the program, defines the mode in which
each is engaged, states when consultation is materially required, and states when
independent expertise is mandatory.

It exists to make engagement proportionate and honest. Consultation is a means of
improving decisions and surfacing risk. It is not a mechanism by which domain
contributors become permanent gatekeepers over unrelated delivery, and it is not a
substitute for the independent validation that certain claims require.

Detailed stakeholder records are maintained in REG-001; this chapter is the
normative narrative those records implement.

## 8.2 Named contributors

- Aubert Nungisa - Accountable Program Authority and primary delivery lead. Holds
  the combined program roles defined in V0-07 and is accountable for delivery,
  architecture, and program decisions (classes D1-D6).
- Nolan - Executive Acceptance Authority and Executive Sponsor Candidate. Holds
  organizational commitment authority (class D0): pilot exposure, organizational
  commitment, and material expenditure.
- Rich - strategic challenge and alignment. Consulted on strategic scope and program
  direction (class D7).
- Helene - business, financial, and sustainability challenge. Consulted on financial,
  payment, and sustainability matters (class D4 domain input).
- Jen - compliance, policy, privacy, and operating-rule challenge. Consulted on
  affiliation requirements, evidence rules, privacy, and compliance (class D4 domain
  input).
- Club and PTSO representatives - operational and jurisdictional reality. Consulted
  on club workflow usability and jurisdictional process (class D8).
- Qualified independent reviewers - specialist assurance. Engaged where a claim
  requires independence (class D9).

## 8.3 Engagement modes

Each contributor is engaged in one or more of the following modes:

- informed: kept aware; no action required.
- consulted: asked for input on a defined matter before the affected decision is made.
- domain reviewer: reviews artifacts within a domain of expertise and records
  findings and conditions.
- operational validator: confirms that a capability works in real operational use.
- executive acceptance authority: accepts organizational commitment on behalf of the
  organization (Nolan, class D0).
- pilot participant: uses the platform in a bounded pilot and provides feedback.
- independent assessor: provides assurance that requires independence from the author
  (class D9).

Combined-role note. Because the program operates under the solo-led, institutionally
accountable model (V0-07), the Accountable Program Authority may hold several
engagement modes at once. Where the author is both producer and reviewer of an
artifact, the evidence label is SELF-ATTESTED / AUTHOR-VERIFIED and is not
represented as independent validation.

## 8.4 Material consultation triggers

Consultation is materially required, before the affected decision or claim is
finalized, in the following cases:

| Trigger | Required consultation |
| --- | --- |
| Strategic scope or program direction | Rich |
| Financial, payment, or sustainability impact | Helene |
| Affiliation requirements, evidence rules, privacy, or compliance | Jen |
| Pilot exposure, organizational commitment, or material expenditure | Nolan (executive acceptance) |
| Club workflow usability | Club representatives |
| Jurisdictional process | PTSO representatives |
| Accessibility claim | Qualified accessibility reviewer and representative users |
| French-language parity claim | Qualified French-language reviewer and representative users |
| Security assurance claim | Independent technical assessment |

## 8.5 Non-blocking consultation rule (normative)

A pending consultation does not block unrelated documentation, architecture,
implementation, or testing. It blocks only the affected decision or claim when that
consultation is materially required.

This rule prevents consultation from becoming an indefinite delivery gate while
preserving its authority over the specific decisions it governs. A materially
required consultation that is still pending is recorded as a condition on the
affected decision (REG-002) or as an open item in RAID (REG-003), not as a halt on
the whole program.

## 8.6 Pilot and user validation

Certain claims are validated only through real use, not through author review:

- Usability and workflow-fit claims are validated by club and PTSO pilot participants
  acting as operational validators.
- Accessibility claims are validated by a qualified accessibility reviewer and by
  representative users with the relevant needs.
- French-language parity claims are validated by a qualified French-language reviewer
  and by representative French-language users.

Pilot participation is bounded and requires executive acceptance (Nolan, D0) before
any organizational commitment or exposure of real stakeholders.

## 8.7 When independent expertise is mandatory

Author verification is insufficient, and independent expertise is mandatory, where a
claim asserts a property that cannot honestly be self-attested:

- security assurance and penetration-style validation;
- privacy and data-protection compliance conclusions with legal or regulatory weight;
- accessibility conformance claims;
- French-language parity conformance claims;
- any production-readiness assertion that depends on independence from the author.

Until such independent assurance is obtained, the corresponding claim remains a
recorded time-bounded condition. It is not represented as satisfied by author
verification.

## 8.8 Constitutional control

Domain contributors are engaged consultatively and as validators of specific claims.
They are not permanent delivery gatekeepers over unrelated work. Executive decisions
are limited to material organizational commitments (D0). Independent assurance is
reserved for claims that require independence. Engagement roles and their thresholds
are recorded in REG-001 and REG-002; changes require a governance decision recorded
in REG-002.

Ratification: Package 2. Evidence label SELF-ATTESTED / AUTHOR-VERIFIED; independent
validation not claimed; executive acceptance pending at applicable future gate.
