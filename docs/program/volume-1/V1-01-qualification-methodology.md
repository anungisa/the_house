# V1-01 - Qualification Methodology

Document ID: V1-01  
Title: Qualification Methodology  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-A, REG-108 APP-V1-002)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G1)  
Supersedes: None  
Review Cycle: Monthly until Volume 1 closes  
Repository Path: docs/program/volume-1/

## V1-01.1 Purpose

This section is normative.

This document defines how current-state qualification is performed in Volume 1. It
governs how sources are examined, how evidence is captured and rated, how
capabilities are inventoried, and how findings, contradictions, and dispositions
are produced.

## V1-01.2 Operating rule

This section is normative.

The purpose of qualification is not to preserve prior effort. It is to preserve
validated value while rejecting unsafe assumptions, architectural accidents,
duplicated capability, and prototype behaviour.

Qualification is evidence-led, not authorship-led and not recency-led. Neither the
existence of an artifact nor the recency of a change establishes its fitness.

## V1-01.3 The four realities

This section is normative.

Qualification reconciles four realities. Each is a distinct source class and is
never collapsed into another:

1. **Curling Canada operating reality** — how the organization actually operates:
   its obligations, seasons, membership, governance, and constraints. Classified as
   operational truth or policy truth depending on the artifact.
2. **Base44 product and experience intelligence** — the exported Base44 application
   as a source of product intent, workflows, and experience design. Classified as
   observed evidence or vendor claim; it is not production authority.
3. **The House implementation** — the production-candidate backend platform.
   Classified as implementation truth.
4. **External platforms, data sources, policies, and dependencies** — systems and
   documents the program depends on but does not own.

## V1-01.4 Qualification unit: the capability

This section is normative.

The unit of qualification is the **capability**: a business or platform capability
observed in one or more realities (REG-103). A capability is qualified, not a file
and not a screen. Capabilities are traced to their sources and to the findings and
evidence that support any judgement about them.

## V1-01.5 Method

This section is normative.

For each source admitted to assessment, qualification proceeds as follows:

1. **Register the source** (REG-101) with custodian, classification, and control
   status before any assessment claim is made.
2. **Capture evidence** (REG-102): each evidentiary observation is recorded with an
   artifact type and a source reference. Evidence is not assertion; it is an
   observation that can be re-examined.
3. **Rate the evidence** (REG-104 evidence-quality scale E0–E4) per V1-04.
4. **Inventory capabilities** (REG-103) the source contributes, with their current
   evidence rating and production-risk assessment.
5. **Record findings** (REG-104): gaps, duplicated capability, prototype debt,
   hardcoded assumptions, architectural accidents, production-readiness gaps,
   authority conflicts, reusable value, and constraints.
6. **Record contradictions** (REG-105) whenever sources of differing classification
   disagree. A contradiction is a first-class finding, not a nuisance to be
   smoothed over.
7. **Propose dispositions** (REG-106) per V1-03, without authorizing implementation.

## V1-01.6 Contradiction handling

This section is normative.

When sources conflict:

- the contradiction is recorded in REG-105 with at least two positions, each
  attributed to a classified source;
- no position is silently preferred;
- resolution favours the higher-authority classification (policy truth and
  operational truth over vendor claim and assumption), but only with recorded
  evidence;
- an unresolved contradiction remains open and is itself reportable. Volume 1 may
  close a package with open, disclosed contradictions; it may not close one with
  hidden contradictions.

## V1-01.7 Non-authorization

This section is normative.

No qualification activity in Volume 1 authorizes construction, migration,
procurement, or production change. Findings inform a later, explicitly gated
decision (V1-00.4). This is enforced by the REG-106 qualification-authorization
control.

## V1-01.8 Gate V1-G1 — Qualification System Ready

This section is normative.

Gate V1-G1 confirms that the qualification system is ready before substantive
qualification begins. Its conditions are:

1. Volume 0 controls inherited and not weakened;
2. qualification method ratified (this document);
3. source classifications defined (V1-02);
4. disposition vocabulary defined (V1-03);
5. evidence-quality scale defined (V1-04);
6. contradiction handling defined (V1-01.6);
7. registers schema-validated by the governance toolchain;
8. no implementation work authorized by Volume 1 findings alone.

Gate V1-G1 is an internal-progression gate authorized by the Accountable Program
Authority. Executive organizational acceptance (D0, Nolan) remains a distinct,
pending condition before any material commitment. The gate disposition is recorded
in REG-107 (DEC-V1-006) and REG-108 (APP-V1-006).
