# V0-01 - Executive Mandate

Document ID: V0-01
Status: IN_REVIEW
Version: 0.2.0
Owner: Program Owner (TBD)
Approver: Executive Sponsor (TBD)
Associated Gate: G0
Related Decisions: DEC-V0-001, DEC-V0-002, DEC-V0-003, DEC-V0-004, DEC-V0-005

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

## 1.3 Executive sponsorship and obligations

The following named roles MUST exist and be recorded in REG-001 before Gate G0
may reach any disposition other than HOLD:

- Executive Sponsor
- Accountable Program Owner
- Executive Steering Authority
- Funding Authority
- Final Production Release Authority

Current status: PROPOSED (names are TBD pending ratification).

### 1.3.1 Executive Sponsor obligations

The Executive Sponsor MUST:

- hold accountability for the mandate, funding, and strategic alignment;
- authorize or withhold national production release;
- serve as the final escalation authority;
- ensure the program remains aligned to Curling Canada strategic objectives;
- confirm that reassessment or termination triggers are honored.

### 1.3.2 Program Owner obligations

The Program Owner MUST:

- hold accountability for end-to-end program coherence;
- maintain the roadmap, dependencies, and gate progression;
- ensure traceability from outcomes to release evidence is maintained;
- report delivery status, risks, and unresolved blockers honestly;
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

This subsection is normative and currently unratified.

The following MUST be documented and owned before Gate G0 leaves HOLD. They are
recorded as assumptions in REG-003 and MUST NOT be treated as facts:

- initial funding envelope and funding authority (ASM: TBD);
- delivery capacity and staffing model (ASM: TBD);
- operating-cost sustainability assumptions (ASM: TBD);
- pilot-phase resourcing (ASM: TBD).

The program MUST NOT claim funded status or committed capacity without an approval
record. Absence of ratified figures is itself a Gate G0 blocker, not a detail to
be resolved silently.

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
in REG-002 and, where approval is asserted, an approval record in REG-006. Until
those records exist, the mandate is PROPOSED and Gate G0 remains HOLD.
