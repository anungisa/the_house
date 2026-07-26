# Volume 4 Architecture-Foundation Closure Report (NON-AUTHORITATIVE)

Generated: 2026-07-26T15:53:35.759Z

> Generated projection of the source-controlled Volume 4 corpus. Not a source of
> truth and not a basis for ratification. Volume 4 Package 1 defines TARGET
> architecture only; it authorizes no implementation, procurement, provisioning,
> delivery sequencing, staffing, or cost.

## Identifier counts

| Category | Count |
| --- | --- |
| Architecture elements | 201 |
| Quality-attribute (NFR) elements | 23 |
| Architecture decisions | 40 |
| Fitness functions | 63 |
| Assumptions / risks / exceptions | 58 |

## Quality-attribute coverage

| Quality attribute | NFR elements |
| --- | --- |
| ACCESSIBILITY | 1 |
| AUDITABILITY | 2 |
| AVAILABILITY | 1 |
| BILINGUAL_EQUIVALENCE | 1 |
| INTEROPERABILITY | 2 |
| MAINTAINABILITY | 2 |
| OPERABILITY | 2 |
| PERFORMANCE | 1 |
| PORTABILITY | 2 |
| PRIVACY | 2 |
| RECOVERABILITY | 1 |
| RESILIENCE | 3 |
| SCALABILITY | 1 |
| SECURITY | 4 |

## Architecture status

| Status | Count |
| --- | --- |
| TARGET_ASSUMED | 16 |
| TARGET_CONSTRAINED | 70 |
| TARGET_DEFINED | 115 |

## Decision verification status

| Verification status | Count |
| --- | --- |
| SPECIFIED | 40 |

## Authorization invariants (all must be 0)

- Architecture elements authorizing implementation: 0
- Decisions authorizing implementation: 0
- Fitness functions claimed implemented: 0

## Open assumptions (owner and resolution gate)

- ASM-V4-001 (Aubert Nungisa (Accountable Program Authority), V4-G2): Identity provider boundary available
- ASM-V4-002 (Aubert Nungisa (Accountable Program Authority), V4-G2): External finance systems retain authoritative ledger
- ASM-V4-003 (Aubert Nungisa (Accountable Program Authority), V4-G2): Evidence storage supports provenance and access control
- ASM-V4-004 (Aubert Nungisa (Accountable Program Authority), V4-G2): Transitional manual boundaries acceptable in early operation
- ASM-V4-005 (Aubert Nungisa (Accountable Program Authority), V4-G3): Final domain-boundary validation pending
- ASM-V4-006 (Aubert Nungisa (Accountable Program Authority), V4-G3): Policy and workflow variants deferred
- ASM-V4-007 (Aubert Nungisa (Accountable Program Authority), V4-G3): Evidence-storage contract not yet fixed
- ASM-V4-008 (Aubert Nungisa (Accountable Program Authority), V4-G3): PostgreSQL concurrency posture assumed
- ASM-V4-009 (Aubert Nungisa (Accountable Program Authority), V4-G3): Identity-provider claim shape assumed
- ASM-V4-010 (Aubert Nungisa (Accountable Program Authority), V4-G3): Payment and accounting acknowledgement semantics assumed
- ASM-V4-011 (Aubert Nungisa (Accountable Program Authority), V4-G3): Projection recovery ownership assumed
- ASM-V4-012 (Aubert Nungisa (Accountable Program Authority), V4-G3): Outbox operational ownership assumed
- ASM-V4-013 (Aubert Nungisa (Accountable Program Authority), V4-G3): Deployment topology deferred
- ASM-V4-014 (Aubert Nungisa (Accountable Program Authority), V4-G3): Numeric quality-attribute targets remain deferred
- ASM-V4-015 (Aubert Nungisa (Accountable Program Authority), V4-G4): Final records and retention schedule pending
- ASM-V4-016 (Aubert Nungisa (Accountable Program Authority), V4-G4): Expected data and evidence volumes unresolved
- ASM-V4-017 (Aubert Nungisa (Accountable Program Authority), V4-G4): Evidence-storage provider capabilities pending
- ASM-V4-018 (Aubert Nungisa (Accountable Program Authority), V4-G4): Malware-scanning contract pending
- ASM-V4-019 (Aubert Nungisa (Accountable Program Authority), V4-G4): Cryptographic and key-management service pending
- ASM-V4-020 (Aubert Nungisa (Accountable Program Authority), V4-G4): Identity-provider claims and scopes pending
- ASM-V4-021 (Aubert Nungisa (Accountable Program Authority), V4-G4): External contract semantics unresolved
- ASM-V4-022 (Aubert Nungisa (Accountable Program Authority), V4-G4): Search technology unresolved
- ASM-V4-023 (Aubert Nungisa (Accountable Program Authority), V4-G4): Analytics latency tolerance unresolved
- ASM-V4-024 (Aubert Nungisa (Accountable Program Authority), V4-G4): PostgreSQL isolation behaviour to be verified
- ASM-V4-025 (Aubert Nungisa (Accountable Program Authority), V4-G4): Environment topology unresolved
- ASM-V4-026 (Aubert Nungisa (Accountable Program Authority), V4-G4): Deployment platform unresolved
- ASM-V4-027 (Aubert Nungisa (Accountable Program Authority), V4-G4): Regional resilience posture unresolved
- ASM-V4-028 (Aubert Nungisa (Accountable Program Authority), V4-G4): Recovery objectives and ownership unresolved
- ASM-V4-029 (Aubert Nungisa (Accountable Program Authority), V4-G5): Repository topology unresolved
- ASM-V4-030 (Aubert Nungisa (Accountable Program Authority), V4-G5): Build and CI capabilities unresolved
- ASM-V4-031 (Aubert Nungisa (Accountable Program Authority), V4-G5): Migration-source data quality unresolved
- ASM-V4-032 (Aubert Nungisa (Accountable Program Authority), V4-G5): Legacy-system access unresolved
- ASM-V4-033 (Aubert Nungisa (Accountable Program Authority), V4-G5): Coexistence duration unresolved
- ASM-V4-034 (Aubert Nungisa (Accountable Program Authority), V4-G5): Rollback feasibility unresolved
- ASM-V4-035 (Aubert Nungisa (Accountable Program Authority), V4-G5): Test-environment fidelity unresolved
- ASM-V4-036 (Aubert Nungisa (Accountable Program Authority), V4-G5): Technology options unresolved
- ASM-V4-037 (Aubert Nungisa (Accountable Program Authority), V4-G5): Dependency licensing unresolved
- ASM-V4-038 (Aubert Nungisa (Accountable Program Authority), V4-G5): Operational ownership unresolved
- ASM-V4-039 (Aubert Nungisa (Accountable Program Authority), V4-G5): Quality-attribute baselines unresolved
- ASM-V4-040 (Aubert Nungisa (Accountable Program Authority), V4-G5): Implementation capacity unresolved
- ASM-V4-041 (Aubert Nungisa (Accountable Program Authority), V4-G5): Independent assurance unresolved

## Open risks (owner and resolution gate)

- RISK-V4-001 (Aubert Nungisa (Accountable Program Authority), V4-G2): Bounded-context erosion
- RISK-V4-002 (Aubert Nungisa (Accountable Program Authority), V4-G2): Exactly-once effect misinterpretation
- RISK-V4-003 (Aubert Nungisa (Accountable Program Authority), V4-G2): Unvalidated quality-attribute targets
- RISK-V4-004 (Aubert Nungisa (Accountable Program Authority), V4-G3): Application-layer boundary erosion
- RISK-V4-005 (Aubert Nungisa (Accountable Program Authority), V4-G3): Authorization scope-resolution gaps
- RISK-V4-006 (Aubert Nungisa (Accountable Program Authority), V4-G3): Silent no-op integration in production
- RISK-V4-007 (Aubert Nungisa (Accountable Program Authority), V4-G3): Completeness drift from derived to stored
- RISK-V4-008 (Aubert Nungisa (Accountable Program Authority), V4-G4): External acknowledgement silently replaces House authority
- RISK-V4-009 (Aubert Nungisa (Accountable Program Authority), V4-G4): Projection treated as authoritative
- RISK-V4-010 (Aubert Nungisa (Accountable Program Authority), V4-G4): Production reliance on a test double or no-op
- RISK-V4-011 (Aubert Nungisa (Accountable Program Authority), V4-G4): Unverified recovery claim
- RISK-V4-012 (Aubert Nungisa (Accountable Program Authority), V4-G5): Temporary no-op dependency becomes a production default
- RISK-V4-013 (Aubert Nungisa (Accountable Program Authority), V4-G5): Expired exception silently persists
- RISK-V4-014 (Aubert Nungisa (Accountable Program Authority), V4-G5): Lower-fidelity verification mistaken for proof
- RISK-V4-015 (Aubert Nungisa (Accountable Program Authority), V4-G5): Migration converts uncertain data into authoritative truth
- RISK-V4-016 (Aubert Nungisa (Accountable Program Authority), V4-G5): Vendor lock-in erodes portability
