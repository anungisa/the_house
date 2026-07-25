# V1-11 - The House Domain, Data, API, and Integration Architecture

Document ID: V1-11  
Title: The House Domain, Data, API, and Integration Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-C, REG-108 APP-V1-017)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G3)  
Supersedes: None  
Review Cycle: Frozen at Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-11.1 Purpose

This section is normative.

This chapter qualifies The House domain decomposition, persisted data model, HTTP
surface, and integration (outbox) architecture against the constitutional posture:
a governance-first modular monolith with explicit bounded contexts, PostgreSQL
state, tenant isolation, and a transactional outbox. It distinguishes what the
architecture demonstrably implements from what it declares.

## V1-11.2 Domain decomposition

This section is normative.

The House is a modular monolith with bounded contexts under `src/domains` and the
governance core under `src/governance` (SRC-011, SRC-012; EV-030). Three domains
request governed transitions through the kernel (affiliation, organization
registry, participant registry); the facility registry is reference data. All four
own outbox enqueue paths. No domain mutates governed state directly - the kernel is
the sole transition authority (qualified in V1-12).

## V1-11.3 Persisted data model and tenant isolation

This section is normative.

The data model is defined by 11 ordered migrations (SRC-010; EV-024): 5 schemas,
26 tables, 55 policies, 7 functions. **Twenty of 26 tables have row-level security
ENABLED and FORCED**, and application code sets `app.tenant_id` inside the
transaction before governed access. This is a database-enforced isolation posture
(CAP-021, RETAIN, QD-021), materially stronger than the Base44 app-layer `rls`
convention assessed in V1-05.

Two honest qualifications apply:

- The six global-policy catalog tables are intentionally tenant-nullable and not
  forced-RLS (V1-10.5).
- **Cross-schema parent references are not enforced by database foreign keys.**
  Organization parent links, facility-to-organization links, and affiliation
  linkages rely on RLS-scoped `tenant_id` plus application/guard logic, not FK
  constraints. This is a deliberate single-isolation-mechanism design, registered
  as contradiction CON-011 and resolved by design authority - recorded for
  transparency, not corrected. The participant registry does declare a composite
  reference on `tenant_id + participant_id`; the org/facility links do not.

## V1-11.4 HTTP surface and composition root

This section is normative.

The HTTP surface exposes 28 `/v1/` route paths across 7 adapter groups (SRC-012;
EV-030). The single production composition root `createPgAffiliationHttpServer`
(`src/http/composition.ts`) wires 12 dependencies - executor, resolver, evidence,
scanner, workflow decision/execution/read, organization read, participant write,
facility read/write, and readiness - against PostgreSQL-backed, RLS-enforced
stores. The production dependency graph is present and centralized (P0 revalidation
item #4 satisfied; CAP-027, RETAIN).

Declared stubs remain and are recorded, not hidden: the default outbox publisher
is Noop, the default evidence store is in-memory, and edge identity resolution is
not token/JWT validation.

## V1-11.5 The affiliation write surface is incomplete

This section is normative.

The affiliation domain store is **READ-only**: it exposes fact readers for guards
(required fields, documents, compliance flags, fees, season) but no create or
update methods (SRC-012; EV-031). The only affiliation write endpoint is
`POST /v1/affiliation/applications/:id/transitions/:action`, which assumes a draft
application already exists. There is no HTTP endpoint to create or bootstrap an
application. Consequently the end-to-end affiliation flow **cannot be completed
through the HTTP surface alone** - an application must currently be inserted
out-of-band. This is a release-blocking capability gap (FND-026; CAP-026, ADAPT,
QD-026), not a defect in the governed transition mechanism itself.

## V1-11.6 Integration and transactional outbox

This section is normative.

The integration architecture is a transactional outbox (SRC-011; EV-028). Outbox
rows are enqueued inside the transition transaction; a leased worker claims rows via
`FOR UPDATE SKIP LOCKED` with `locked_until` / `locked_by`, publishes after commit,
and retries transient failures with true full jitter
(`cap = min(maxDelayMs, baseDelayMs * 2^attempt); delay = random int in [0, cap]`).
Azure Service Bus sessions are not enabled in v1.

The mechanism is correct and retained (CAP-020, RETAIN, QD-020), with one honest
qualification: **the default publisher is Noop.** A real Azure Service Bus
publisher exists but is config-gated, and no broker delivery was observed. Real
at-least-once delivery is therefore a production-readiness gap (FND-030), not a
demonstrated capability. The doctrinal distinction is preserved: a publisher
failure before Service Bus accepts a message is a failed/pending Postgres outbox
row, not a Service Bus dead-letter event.

## V1-11.7 Architecture summary

This section is normative.

The domain, data, API, and integration architecture is a genuine
governance-first modular monolith with database-enforced tenancy and a correct
outbox - substantial production value (RETAIN across CAP-020, CAP-021, CAP-027).
The two material architectural gaps are the incomplete affiliation write surface
(FND-026) and the Noop-default outbox delivery (FND-030); the cross-schema FK
omission is an intentional, registered trade-off (CON-011). None of these is
authorized for remediation in Package 3.
