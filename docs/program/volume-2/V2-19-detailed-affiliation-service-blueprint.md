# V2-19 - Detailed Affiliation Service Blueprint

Document ID: V2-19  
Title: Detailed Affiliation Service Blueprint  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-029)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-19.1 Purpose

This section is normative.

This chapter expands the high-level affiliation blueprint (V2-10) into pathway-specific
service blueprints. It defines how the governed behaviour established in Package 3 is
encountered, operated, and recovered across The House and The Button. It is product and
service definition only. It does not prescribe frontend frameworks, screen layouts,
component specifications, service implementations, database structures, APIs, event
schemas, delivery sequencing, or the master development plan. It authorizes no
implementation (REG-203 CAP-V2-038, FR-V2-036).

## V2-19.2 Blueprint stage descriptor

This section is normative.

Each blueprint stage is described with the following controlled fields:

- User objective;
- Frontstage experience;
- Backstage activity;
- Accountable authority;
- Governed state;
- Information exchanged;
- Evidence required;
- External dependency;
- Communication;
- Support intervention;
- Failure mode;
- Recovery path;
- Acceptance reference.

Every stage must additionally distinguish the responsibility layers in V2-19.3.

## V2-19.3 Responsibility layers

This section is normative.

Every stage distinguishes:

- what the user sees;
- what The Button does;
- what The House governs;
- what staff perform;
- what external systems execute;
- what remains manual pending later authorization.

The Button presents governed status and requests governed transitions but never owns or
mutates governed lifecycle state (REG-203 BR-V2-024, BR-V2-027).

## V2-19.4 Pathway blueprints

This section is normative.

Detailed blueprints are defined for the following pathways, each decomposed into stages
using the V2-19.2 descriptor:

- continuity confirmation;
- renewal with remediation;
- new affiliation;
- return and resubmission;
- approved but awaiting reconciliation;
- activation failure and recovery;
- refusal, withdrawal, expiry, and administrative correction.

Representative stage descriptor (continuity confirmation, "confirm and submit" stage):

| Field | Content |
| --- | --- |
| User objective | Confirm continuity for the season and submit |
| Frontstage experience | Guided confirmation with current status and required actions (Button) |
| Backstage activity | Pathway determination and completeness derivation (House) |
| Accountable authority | Curling Canada / PTSO per jurisdiction |
| Governed state | draft -> submitted (Governance Kernel) |
| Information exchanged | Organization confirmation, seasonal confirmation, carried-forward evidence |
| Evidence required | Valid carried-forward evidence per policy (V2-14) |
| External dependency | Reference data only; no system-of-record transfer |
| Communication | Submission confirmation (V2-23) |
| Support intervention | Assistance and handoff only (V2-17, V2-20) |
| Failure mode | Incomplete confirmation or expired evidence |
| Recovery path | Save and resume; replace evidence; resubmit (V2-22) |
| Acceptance reference | TEST-V2-026 |

The remaining pathways and stages follow the same descriptor and are traced in REG-203
FR-V2-036 with acceptance in the V2-25 scenario families.

## V2-19.5 Failure and recovery coverage

This section is normative.

Each pathway blueprint identifies material failure modes and their governed recovery
paths, including incomplete submission, expired evidence, activation failure, and
notification failure. Recovery never bypasses governed authority and never produces
duplicate activation (REG-203 RULE-V2-023, CTRL-V2-020).

## V2-19.6 Unresolved validations

This section is normative.

Pathway-specific operational timing and staffing-dependent stages remain classified as
OPERATIONAL_VALIDATION_PENDING (owner Rich and selected PTSO and club representatives).
Pending validation blocks only the affected stage.

## V2-19.7 Authorization posture

This section is normative.

This chapter defines pathway-specific service blueprints only. It authorizes no
implementation, no technical architecture, no screen layouts, and no delivery plan. All
referenced requirements in REG-203 carry `authorizes_implementation: false`.
