# V3-41 - Downstream Business Constraints for Architecture and Engineering

Document ID: V3-41  
Title: Downstream Business Constraints for Architecture and Engineering  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 5 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-058)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-41.1 Purpose

This section is normative.

This chapter defines the downstream business constraints that Volume 4 architecture and
engineering must respect (CAP-V3-041, OUT-V3-041, FR-V3-041). It defines no technical
architecture and authorizes no implementation.

## V3-41.2 Architecture inputs Volume 4 must respect

This section is normative.

Volume 4 must respect:

- House and Button authority separation;
- resource-aware access;
- jurisdictional operating boundaries;
- reviewer assignment;
- evidence confidentiality;
- versioned policy and requirements;
- return and resubmission;
- decision auditability;
- financial-system segregation;
- exactly-once activation;
- operational queues;
- management evidence;
- continuity;
- bilingual and accessibility requirements;
- privacy boundaries;
- external dependency failure handling;
- administrative correction;
- assurance evidence.

## V3-41.3 What Volume 4 must not infer

This section is normative.

Volume 4 must not infer (BR-V3-044, RULE-V3-035, CTRL-V3-049):

- approved staffing;
- approved volumes;
- approved service levels;
- approved budget;
- approved providers;
- production deployment authorization;
- implementation sequencing;
- executive commitment.

## V3-41.4 Constraint-only nature

This section is normative.

Each entry states a business boundary that architecture and engineering must respect, without
defining any technical architecture. A downstream constraint is valid only when it states such a
boundary and records its prohibited inferences.

## V3-41.5 Validation status

This section is normative.

The constraints are author-asserted. The architecture and engineering function (STK-V3-021)
receives these constraints as input in Volume 4; Curling Canada National Operations (STK-V3-001)
validates business accuracy. Pending validation blocks only the affected constraint.
