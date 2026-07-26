# V2-18 - Rule Coverage and Acceptance-Decision Tables

Document ID: V2-18  
Title: Rule Coverage and Acceptance-Decision Tables  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-025)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-18.1 Purpose

This section is normative.

This chapter converts the Package 3 operating model into controlled decision tables and
acceptance coverage. It is acceptance definition, not executable test implementation. No
table authorizes implementation.

## V2-18.2 Pathway decision table

This section is normative.

Rule: RULE-V2-010. Acceptance: TEST-V2-014.

Inputs: historical recognition; organization continuity; standing; evidence condition;
jurisdiction; material organizational change.

Output: continuity; remediation; new affiliation; manual policy determination.

| Historical recognition | Continuity of identity | Standing | Evidence condition | Material change | Output |
| --- | --- | --- | --- | --- | --- |
| yes | unchanged | satisfactory | carry-forward valid | no | continuity |
| yes | unchanged | satisfactory | missing/expired/contradictory | no | remediation |
| yes | unchanged | unsatisfactory | any | no | remediation |
| yes | changed | any | any | yes | new affiliation |
| no | not applicable | any | any | any | new affiliation |
| ambiguous | ambiguous | any | any | any | manual policy determination |

Thresholds for "satisfactory standing" and "carry-forward valid" are
POLICY_VALIDATION_PENDING (owner Jen).

## V2-18.3 Requirement applicability table

This section is normative.

Rule: RULE-V2-014. Acceptance: TEST-V2-015.

Inputs: season; pathway; jurisdiction; organization classification; policy version.

Output: applicable requirements; evidence rules; fee rules; reviewer authority.

The applicable set is resolved deterministically for a given input tuple and recorded with
its version and effective date (REG-203 NFR-V2-014, CTRL-V2-010). Specific per-jurisdiction
requirement content is POLICY_VALIDATION_PENDING (owner Jen; national consistency owner
Rich).

## V2-18.4 Decision eligibility table

This section is normative.

Rule: RULE-V2-019 (with RULE-V2-025 for reconsideration). Acceptance: TEST-V2-020.

Inputs: completeness; evidence review; exception status; reviewer authority;
fee/reconciliation status.

Output: return; escalate; approve; refuse; await reconciliation; activate.

| Completeness | Evidence review | Exception status | Fee/reconciliation | Output |
| --- | --- | --- | --- | --- |
| incomplete | any | none | any | return |
| complete | deficient | none | any | return |
| complete | satisfactory | open blocking | any | escalate |
| complete | satisfactory | none | not satisfied | await reconciliation |
| complete | satisfactory | none | satisfied/waived | approve then activate |
| complete | disqualifying | none | any | refuse |

Reviewer authority is a precondition for approve, refuse, escalate, and activate; unknown
authority fails closed (REG-203 BR-V2-019). Reconsideration is available only where policy
permits.

## V2-18.5 Acceptance coverage

This section is normative.

Every material operating rule links along the chain RULE -> workflow -> use case ->
control -> acceptance test, recorded authoritatively in REG-203. Representative coverage:

| Rule | Workflow | Use case | Control | Acceptance test |
| --- | --- | --- | --- | --- |
| RULE-V2-010 | WF-V2-006 | UC-V2-027 | CTRL-V2-009 | TEST-V2-014 |
| RULE-V2-014 | WF-V2-006 | UC-V2-029 | CTRL-V2-010 | TEST-V2-015 |
| RULE-V2-015 | WF-V2-007 | UC-V2-028 | CTRL-V2-014 | TEST-V2-016 |
| RULE-V2-016 | WF-V2-007 | UC-V2-028 | CTRL-V2-009 | TEST-V2-017 |
| RULE-V2-017 | WF-V2-007 | UC-V2-030 | CTRL-V2-009 | TEST-V2-018 |
| RULE-V2-018 | WF-V2-008 | UC-V2-030 | CTRL-V2-009 | TEST-V2-019 |
| RULE-V2-019 | WF-V2-008 | UC-V2-031 | CTRL-V2-013 | TEST-V2-020 |
| RULE-V2-020 | WF-V2-008 | UC-V2-032 | CTRL-V2-013 | TEST-V2-021 |
| RULE-V2-021 | WF-V2-009 | UC-V2-033 | CTRL-V2-011 | TEST-V2-022 |
| RULE-V2-022 | WF-V2-009 | UC-V2-033 | CTRL-V2-011 | TEST-V2-023 |
| RULE-V2-023 | WF-V2-009 | UC-V2-034 | CTRL-V2-012 | TEST-V2-024 |
| RULE-V2-024 | WF-V2-010 | UC-V2-035 | CTRL-V2-009 | TEST-V2-025 |

This is acceptance definition. It does not implement tests or authorize construction.

## V2-18.6 Authorization posture

This section is normative.

This chapter defines decision tables and acceptance coverage only. It authorizes no
implementation, no procurement, no test code, and no technical architecture. All
referenced requirements in REG-203 carry `authorizes_implementation: false`.
