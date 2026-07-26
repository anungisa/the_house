# V4-30 - Secure Software-Development Lifecycle and Engineering-Control Architecture

Document ID: V4-30  
Title: Secure Software-Development Lifecycle and Engineering-Control Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-043)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-30.1 Purpose and scope

This section is normative.

This chapter defines the architecture-level secure software-development lifecycle and the engineering
controls that later delivery must satisfy (ARCH-V4-030, CTRL-V4-032, ADR-V4-039). It defines required
controls; it does **not** claim that any control is currently implemented, operating, or evidenced
unless that evidence is independently recorded. It selects no scanning product, no signing service,
and no CI platform, and it authorizes no procurement.

## V4-30.2 Control families

This section is normative.

The secure-development architecture defines the following control families as required, each expressed
as preventive, detective, and corrective intent: change provenance; code review; branch protection;
dependency review; static analysis; secret scanning; software-composition analysis; container or
package scanning; artifact signing or attestations; build reproducibility; build isolation; protected
environments; release approvals; infrastructure-definition controls; vulnerability handling; exception
expiry; and evidence retention. Each family protects a named asset across a named engineering stage
(CTRL-V4-032) and connects to the software-supply-chain provenance defined in Package 3 (ARCH-V4-025,
CTRL-V4-028).

## V4-30.3 Control record model

This section is normative.

Each control family is recorded, for downstream governance, with: control objective; protected asset;
engineering stage; preventive control; detective control; corrective control; evidence; exception
authority; validation status; and future gate. Validation status for every control family in this
chapter is **defined, not evidenced**. The exception authority is the architecture governance defined
in V4-35, and evidence expectations are cross-referenced to the test and evidence architecture in
V4-31.

## V4-30.4 Change provenance and protected change

This section is normative.

All change carries provenance: authorship, review, and approval are attributable, and protected
branches and environments constrain who and what may change controlled assets (CTRL-V4-032). Release
approvals are explicit and separate from authorship. Emergency change follows a governed exception
path (V4-35) rather than bypassing controls silently. Infrastructure definitions are treated as
controlled change subject to the same provenance and review expectations (constrains V4-34).

## V4-30.5 Vulnerability handling and exception expiry

This section is normative.

Vulnerability handling is defined as a governed flow with severity-aware response, remediation
ownership, and time-bounded exceptions that **expire** rather than persist silently (CTRL-V4-037,
constrains V4-35). Suppressed or accepted findings require a recorded exception with an owner,
compensating control, and expiry. Evidence of controls, findings, and exceptions is retained for
governance review; retention duration is governed by policy and recorded as an assumption (REG-404).

## V4-30.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation and claims no operating control. It configures no scanner,
signer, pipeline, or branch protection; selects no security tool or vendor; and asserts no
certification, compliance, accreditation, or clean-scan result. Controls are required and defined, not
demonstrated. Every element it introduces carries `authorizes_implementation: false`.
