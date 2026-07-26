# V4-04 - Affiliation Reference Architecture

Document ID: V4-04  
Title: Affiliation Reference Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-005)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-04.1 Purpose

This section is normative.

This chapter defines the end-to-end reference architecture for the affiliation lifecycle: how each
affiliation scenario flows through the Button, the House application services, the domain modules,
authorization, transactions, evidence, state transitions, the outbox, external interactions,
projections, and audit. Each scenario is recorded as an SVC element in REG-401.

## V4-04.2 Scenario description model

This section is normative.

Each affiliation scenario identifies: the actor; the Button interaction; the House application
service; the domain module; the authorization decision; the transaction boundary; the evidence
effect; the state transition; the outbox event; the external interaction; the projection update;
the audit evidence; and the failure and recovery path.

## V4-04.3 Affiliation scenarios

This section is normative.

The reference architecture covers, at minimum: continuity confirmation; renewal with remediation;
new affiliation; evidence submission; review; return and resubmission; decision; approval awaiting
reconciliation; activation; activation recovery; and expiry and closure. Each scenario traces to the
inherited Volume 3 affiliation operating model and Volume 2 product definition and is recorded as an
SVC element.

## V4-04.4 Governed lifecycle flow

This section is normative.

Every affiliation state change flows: Button request -> House application service -> authorization
decision (default deny) -> domain module command within a single transaction boundary -> evidence
binding and derived completeness -> validated state transition -> audit append -> outbox enqueue ->
commit. External interactions and projection updates occur only after commit, driven by the outbox.
No governed state changes outside this flow.

## V4-04.5 Exactly-once activation

This section is normative.

Activation must produce **one authoritative effect** through transactional state control and
idempotent execution. This is exactly-once **effect**, achieved by transactional state transition
plus an idempotency key on the activation command; it is **not** a claim of universal distributed
exactly-once message delivery. Retries and duplicate requests must not produce a second activation.
Activation recovery re-drives the outbox and idempotent command without duplicating the authoritative
effect. This property is expressed as a fitness function in V4-09.

## V4-04.6 Failure and recovery

This section is normative.

Each scenario defines a failure and recovery path: authorization failure fails closed; evidence or
completeness failure blocks the transition without mutating state; external-interaction failure
before commit is a failed or pending outbox row, recovered by the outbox processor; and manual
recovery is available to authorized support within governed authority, recorded in audit. No failure
path silently mutates governed state or bypasses audit.
