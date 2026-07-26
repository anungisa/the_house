# V4-07 - API, Event, Integration, and Idempotency Architecture

Document ID: V4-07  
Title: API, Event, Integration, and Idempotency Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-008)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-07.1 Purpose

This section is normative.

This chapter defines the target API, event, integration, and idempotency architecture: the classes
of contract the platform exposes and consumes, and the governance posture of each. API and event
concepts are recorded as API and EVT elements in REG-401. Package 1 defines contract **posture**;
it does **not** author executable API definitions or event schemas.

## V4-07.2 Contract classes

This section is normative.

The architecture identifies: commands; queries; public and internal APIs; domain events; integration
events; webhook intake; outbound notifications; payment and accounting reconciliation exchanges; and
imports and exports. Each is an API or EVT element.

## V4-07.3 Contract description model

This section is normative.

Each contract is described by: contract owner; authority; caller; consumer; authentication;
authorization; idempotency key; version; schema governance; error semantics; retry semantics; audit;
privacy classification; and operational ownership. In Package 1 these are target descriptions, not
executable artifacts.

## V4-07.4 Idempotency and delivery semantics

This section is normative.

Every state-changing command and every integration exchange carries an **idempotency key**.
Duplicate delivery, retries, and replay must not produce duplicate governed effects. The
architecture addresses retries, duplicate delivery, replay, ordering, poison messages, and manual
recovery. Idempotent execution combined with transactional state control yields exactly-once
governed **effect**, not universal exactly-once delivery.

## V4-07.5 Outbox and reconciliation

This section is normative.

External side effects (notifications, webhooks, payment and accounting reconciliation) are dispatched
through the transactional outbox after commit. A publisher failure before an external system accepts a
message is a failed or pending outbox row, recovered by the outbox processor; it is not a downstream
dead-letter event. Reconciliation with payment and accounting systems records reconciliation status
in the House while the authoritative financial ledger remains with the assigned finance systems.

## V4-07.6 Versioning and error semantics

This section is normative.

Contracts are versioned and their schema evolution is governed for compatibility. Error semantics are
explicit and stable so callers can distinguish retryable from terminal failures. Contract
compatibility and idempotency are expressed as fitness functions in V4-09.
