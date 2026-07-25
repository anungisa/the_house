# V0-01 - Executive Mandate

Document ID: V0-01
Status: IN_REVIEW
Version: 0.3.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority; surname to be recorded in REG-001)
Associated Gate: G0
Related Decisions: DEC-V0-001, DEC-V0-002, DEC-V0-003, DEC-V0-004, DEC-V0-005, DEC-V0-016

This chapter is normative except where a subsection is marked explanatory.

## Purpose

Establish the formal authority under which the Central Registration Platform
program operates. This chapter binds every subsequent requirement, design,
implementation, test, exception, and release to a ratified mandate so a future
team cannot casually reinterpret why the program exists or what it may do.

## 1.1 Program mandate

Normative statement:

Curling Canada MUST design and implement a governed national digital platform
that provides clubs, provincial and territorial sport organizations (PTSOs),
participants, and Curling Canada with a coherent, trustworthy, bilingual,
accessible, and operationally sustainable way to manage affiliation, membership,
registration, compliance, and related services.

The mandate is a service and governance mandate. It MUST NOT be interpreted as
authority to preserve, rebuild, or extend any specific existing system merely
because that system exists.

## 1.2 Institutional case for Curling Canada ownership

This subsection is normative.

Curling Canada MUST own the platform mandate because:

- Curling Canada is the national governing body accountable for the integrity of
  affiliation, membership, and registration data for the sport in Canada.
- national consistency, evidence, and continuity cannot be guaranteed by
  independently operated or vendor-specific systems acting alone.
- federated operation with PTSOs requires a neutral national authority that can
  hold the authoritative organizational spine without removing PTSO jurisdiction.
- long-term sustainability, privacy accountability, and official-language
  obligations require an accountable Canadian institutional owner.

Ownership of the mandate does NOT centralize every operational decision. Federated
authority is preserved under PR-003 (see V0-05) and V0-07.

## 1.3 Executive sponsorship and accountable authority

The program operates under a solo-led, institutionally accountable delivery model
(V0-07). The following roles are assigned and recorded in REG-001:

- Accountable Program Authority, Program Owner, Product Owner, Technology and
  Architecture Authority, Delivery Authority, and Documentation and Traceability
  Authority: Aubert Nungisa.
- Executive Sponsor Candidate and Executive Acceptance Authority: Nolan.

Under the combined-roles clause (V0-07 7.3), one individual MAY perform multiple
program roles. Role combination does NOT remove the obligations attached to those
roles; decisions, assumptions, evidence, tests, and conflicts MUST remain
explicitly recorded, and combined authority MUST NOT be represented as independent
validation.

Nolan's confirmation as Executive Sponsor and any material funding commitment are
time-bounded Gate G0 conditions (V0-12). They MUST be honored before material
external expenditure or production exposure but MUST NOT block controlled
documentation, design, testing, or implementation of the affiliation slice.

### 1.3.1 Executive acceptance obligations

The Executive Acceptance Authority (Nolan) MUST:

- accept or withhold organizational commitment, material budget, pilot
  authorization, national rollout, significant policy change, and formal Curling
  Canada ownership;
- serve as the final escalation authority (D0);
- confirm strategic alignment to Curling Canada objectives;
- confirm that reassessment or termination triggers are honored.

### 1.3.2 Accountable Program Authority obligations

The Accountable Program Authority (Aubert Nungisa) MUST:

- hold accountability for end-to-end program coherence;
- maintain the roadmap, dependencies, and gate progression;
- ensure traceability from outcomes to release evidence is maintained;
- report delivery status, risks, and unresolved blockers honestly;
- label every readiness claim with a controlled evidence label (V0-07 7.4);
- prevent uncontrolled scope expansion beyond ratified boundaries.

## 1.4 National operating responsibility

This subsection is normative.

The program MUST deliver a platform that Curling Canada and its PTSO partners can
operate nationally, including:

- authoritative organizational identity for clubs and governing bodies;
- traceable affiliation standing across jurisdictions;
- governed workflows that respect federated authority;
- operational visibility sufficient for national coordination;
- support, recovery, and continuity appropriate to a national system of record.

## 1.5 Authority over product and data governance

This subsection is normative.

Under this mandate, Curling Canada MUST hold authority over:

- platform policy and governed business rules (versioned per PR-006);
- the authoritative organization and affiliation data domains;
- privacy, retention, and evidence requirements for governed personal data;
- decision rights and escalation as defined in V0-07;
- release authorization for governed production capabilities.

External providers and experience layers MUST NOT assume governed data or policy
authority except through explicitly delegated, documented, and revocable
arrangements recorded in REG-005 and REG-002.

## 1.6 Strategic alignment

The program MUST maintain explicit, traceable linkage to:

- Curling Canada strategic objectives;
- national club-service priorities;
- data-informed national operations;
- participant and club experience outcomes;
- operational modernization objectives;
- risk management expectations;
- sustainable, affordable technology ownership.

Each linkage is a candidate measure and MUST be reflected in outcomes (V0-03) and
the measures register (REG-008) rather than asserted without evidence.

## 1.7 Program authorization boundaries

Authorized under Volume 0:

- research and discovery;
- controlled prototyping (non-production);
- requirements and design definition;
- implementation within ratified scope;
- pilot planning and controlled pilot execution;
- migration planning and controlled, reversible migration;
- integration design and controlled integration;
- deployment through explicit gates.

Requires separate, explicit approval (recorded in REG-002 and REG-006):

- scope expansion beyond ratified boundaries;
- irreversible data migrations;
- national launch activation;
- major architectural departure from the modular monolith posture;
- material privacy, security, or compliance exceptions.

## 1.8 Financial and capacity assumptions

This subsection is normative and currently conditional.

The following are recorded as assumptions in REG-003 and MUST NOT be treated as
facts. They are time-bounded Gate G0 conditions (V0-12): they MUST be resolved
before material external expenditure or production commitment, but their absence
does NOT block controlled documentation, design, testing, or implementation of
the affiliation slice.

- initial funding envelope and funding authority (ASM: TBD, owner Nolan);
- delivery capacity and staffing model (ASM: solo-led baseline; scale TBD);
- operating-cost sustainability assumptions (ASM: TBD);
- pilot-phase resourcing (ASM: TBD).

The program MUST NOT claim funded status or committed capacity without an approval
record. Material external expenditure and production commitment remain gated on
executive acceptance (D0).

## 1.9 Reassessment and termination triggers

This subsection is normative.

The Executive Sponsor MUST reassess the program, and MAY pause, restructure, or
terminate it, when any of the following occur:

- the club-affiliation vertical fails to demonstrate a complete, evidenced,
  end-to-end production outcome after an agreed pilot window;
- funding or capacity assumptions are invalidated without an approved alternative;
- material privacy, security, or compliance obligations cannot be met;
- federated authority with PTSOs cannot be sustained;
- the governed delivery model is repeatedly bypassed (violations of PR-018 or the
  no-vibe-coding clause in V0-05).

Reassessment outcomes MUST be recorded as decisions in REG-002.

## 1.10 Acceptance of the governed delivery model

This subsection is normative.

By ratifying this chapter, executive authority accepts that:

- capabilities enter production only through the governed delivery model (V0-09);
- documentation, traceability, tests, and approvals are release requirements, not
  optional artifacts;
- AI-assisted development is permitted only within approved scope and controls;
- readiness and capability claims MUST NOT exceed available evidence (PR-007).

## 1.11 Relationship to current registration and competition platforms

This subsection is normative.

Existing registration, competition, learning, and accreditation platforms MUST be
treated as current-state context and potential integration or transition systems,
not as predetermined targets for replacement or preservation. Their disposition
(integrate, synchronize, transition, retire, or defer) MUST be decided through
governed decisions (V0-04, V0-06) with evidence, not assumed.

## Constitutional control

No mandate claim in this chapter is valid without a corresponding decision record
in REG-002 and, where organizational or independent acceptance is asserted, an
approval record in REG-006. Authority now vests in the Accountable Program
Authority (Aubert Nungisa) under the solo-led model (V0-07); executive acceptance
(Nolan, D0), material funding, and independent assurance remain time-bounded Gate
G0 conditions (V0-12) rather than blockers to controlled delivery.
