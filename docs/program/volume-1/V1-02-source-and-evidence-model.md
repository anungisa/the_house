# V1-02 - Source and Evidence Model

Document ID: V1-02  
Title: Source and Evidence Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-A, REG-108 APP-V1-003)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G1)  
Supersedes: None  
Review Cycle: Monthly until Volume 1 closes  
Repository Path: docs/program/volume-1/

## V1-02.1 Purpose

This section is normative.

This document defines how sources are classified and how evidence is attributed, so
that every qualification judgement can be traced to a classified source and a rated
observation.

## V1-02.2 Source classifications

This section is normative.

Every source registered in REG-101 is assigned exactly one classification. The
eight classifications are:

1. **policy truth** — authoritative statement of policy, obligation, or rule
   (bylaws, governance policy, regulatory requirement).
2. **operational truth** — how the organization actually operates today
   (established process, real membership handling, real seasonal behaviour).
3. **implementation truth** — what a system actually does as built (source code,
   schema, deployed configuration of The House).
4. **vendor claim** — an assertion made by a supplier or platform about capability
   or behaviour, not independently observed.
5. **observed evidence** — a direct observation of an artifact or behaviour (an
   inspected export, a captured trace, a screen recording).
6. **stakeholder statement** — a person's account of intent, need, or history,
   valuable but unverified on its own.
7. **assumption** — a working belief not yet substantiated; must be labelled as
   such and never treated as truth.
8. **unresolved contradiction** — a recorded, still-open conflict between sources;
   a classification in its own right so that conflict is never hidden.

Classification authority ordering, for contradiction resolution, is: policy truth
and operational truth (highest), then implementation truth and observed evidence,
then vendor claim and stakeholder statement, then assumption. Unresolved
contradiction blocks reliance until resolved.

## V1-02.3 Source register (REG-101)

This section is normative.

A source may not be used in any assessment claim until it is registered in REG-101
with:

- a stable identifier (`SRC-NNN`);
- a name and source type;
- a classification (V1-02.2);
- a named custodian;
- a control status (`controlled: true` for assessment-admitted sources);
- a qualification status and current evidence rating.

An uncontrolled or unassigned source is a control failure and is rejected by the
governance toolchain.

## V1-02.4 Evidence attribution (REG-102)

This section is normative.

Each piece of evidence in REG-102 records:

- a stable identifier (`EV-NNN`);
- the source it derives from (`SRC-NNN`);
- an artifact type (code, data, process, document, interface, configuration, test,
  observation, stakeholder statement);
- the capabilities it speaks to (`CAP-NNN`), where applicable;
- an evidence rating per V1-04.

Evidence is distinct from finding. Evidence is what was observed; a finding is what
the observation means.

## V1-02.5 Controlled assessment sources at Package 1

This section is normative.

At Package 1, three sources are registered and controlled:

- **SRC-001** — the Base44 export, classified observed evidence;
- **SRC-002** — The House v2 repository, classified implementation truth;
- **SRC-003** — the Volume 0 Program Constitution, classified policy truth.

SRC-001 and SRC-002 are registered as controlled assessment sources only. Their
substantive qualification does not begin in Package 1 (DEC-V1-005). SRC-003 is
already assessed as the ratified constitutional baseline.

## V1-02.6 Recency does not confer authority

This section is normative.

The date of a source or an observation is metadata, not evidence quality. A
recently modified artifact is not thereby more trustworthy. Evidence quality is
governed solely by V1-04.
