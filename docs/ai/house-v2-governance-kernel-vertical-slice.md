# House v2 Governance Kernel Vertical Slice

## Objective

Build the first production-grade Governance Kernel finite state machine vertical slice for the AffiliationApplication lifecycle.

This slice proves:

AffiliationApplication lifecycle transition
→ tenant-scoped authorization
→ registered guard evaluation
→ idempotency
→ immutable transition journal
→ audit event
→ evidence metadata
→ transactional outbox
→ Azure Service Bus publisher skeleton
→ retry/dead-letter investigation structure

## Hard Stop

Stop after this vertical slice.

Do not continue into frontend work, unrelated entities, microservices, AI features, or generic workflow builder work.

## Required Tables

Create schema:

- governance

Create tables:

- governance.policy_version
- governance.state_machine
- governance.state_node
- governance.transition_definition
- governance.guard_definition
- governance.transition_guard
- governance.entity_state
- governance.transition_request
- governance.state_transition
- governance.transition_guard_result
- governance.audit_event
- governance.evidence_object
- governance.outbox_message

## Required AffiliationApplication v1 Lifecycle

draft -> submitted via submit  
submitted -> under_review via review_start  
under_review -> approved via approve  
under_review -> rejected via reject  
approved -> active via activate  
active -> suspended via suspend  
suspended -> active via reinstate  
active -> revoked via revoke  
suspended -> revoked via revoke  
revoked -> closed via close  
rejected -> closed via close  
closed -> archived via archive  

High-risk transitions requiring evidence metadata:

- approve
- reject
- suspend
- reinstate
- revoke
- close
- archive

Low-risk operational transitions:

- submit
- review_start
- activate

## Required Guards

- AFFILIATION_REQUIRED_FIELDS_COMPLETE
- AFFILIATION_REQUIRED_DOCS_PRESENT
- AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS
- AFFILIATION_FEES_PAID
- SEASON_IS_CURRENT
- ACTOR_HAS_REVIEWER_SCOPE

## GovernanceKernel.transition Algorithm

1. Validate input.
2. Perform fast idempotency lookup outside transaction.
3. Begin database transaction.
4. Set tenant context inside the transaction.
5. Double-check idempotency inside transaction.
6. Lock current entity_state row FOR UPDATE.
7. Resolve transition by current_state + trigger + active/effective state machine.
8. Deny if transition is unknown.
9. Check actor permission.
10. Load transition guards.
11. Deny if any guard code is unknown.
12. Evaluate registered guards.
13. Persist guard results for attempted governed transitions.
14. If guards fail, return rejected without mutating entity_state.
15. If approval is required, create transition_request and workflow placeholder. Do not mutate entity_state.
16. If executable, update entity_state.
17. Append state_transition.
18. Append audit_event.
19. Create evidence_object metadata if evidence_required.
20. Enqueue outbox_message with stable dedupe_key, correlation_id, and causation_id.
21. Commit.
22. Return deterministic TransitionResult.

## Outbox Processor Requirements

Use a timer-triggered Azure Function-compatible processor.

The processor must:

- claim pending outbox rows using FOR UPDATE SKIP LOCKED
- use locked_until and locked_by leasing
- publish through a Service Bus publisher abstraction
- set MessageId to dedupe_key if present, otherwise outbox_message.id
- propagate correlation_id and causation_id
- avoid Service Bus sessions in v1
- mark successful rows processed
- retry transient failures with true full jitter
- mark rows failed after max retries
- recover expired processing leases

True full jitter:

cap = min(maxDelayMs, baseDelayMs * 2^attempt)  
delay = random integer between 0 and cap

## DLQ Distinction

Failed outbox publishing is not a Service Bus DLQ event.

If the outbox processor cannot publish to Service Bus after max retries, mark the Postgres outbox row as failed.

Service Bus DLQ handling applies after a message has been accepted by Service Bus and then fails downstream consumption.

## Required Tests

- unknown transition denied
- unknown guard denied
- wrong tenant denied
- wrong permission denied
- failed guard blocks transition
- failed guard result is persisted
- successful transition updates entity_state
- successful transition appends state_transition
- successful transition appends audit_event
- successful high-risk transition creates evidence_object metadata
- successful transition creates outbox_message
- idempotent retry returns previous result
- idempotent retry does not duplicate state_transition
- idempotent retry does not duplicate audit_event
- idempotent retry does not duplicate evidence_object
- idempotent retry does not duplicate outbox_message
- approval-required transition creates transition_request
- approval-required transition does not mutate current entity_state
- pending outbox message can be claimed
- concurrent workers cannot claim the same outbox row
- expired processing lease can be recovered
- publish success marks outbox row processed
- transient publish failure increments retry_count
- transient publish failure sets next_attempt_at
- max retries marks outbox row failed
- Service Bus sessions are not enabled in v1 configuration

## Completion Report

Report:

- files changed
- migrations added
- tables created
- seeded state machine data
- guards implemented
- kernel methods implemented
- outbox processor files added
- tests added
- commands run
- test results
- build results if available
- unresolved gaps
- intentional stubs
- any deviations from this instruction
