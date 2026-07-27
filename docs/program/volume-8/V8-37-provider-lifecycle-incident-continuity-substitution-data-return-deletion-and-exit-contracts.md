# V8-37 - Provider Lifecycle, Incident, Continuity, Substitution, Data Return, Deletion, and Exit Contracts

Document ID: V8-37
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G4)

## V8-37.1 Purpose

This section is normative.

This chapter defines the provider lifecycle obligations of the governed exchange plane: onboarding posture, incident notification, continuity, substitution, data return, deletion evidence, and exit. It states the obligations a provider relationship must carry across its life. It selects no provider, authorizes no contract, and configures no infrastructure.

## V8-37.2 Provider lifecycle obligations

This section is normative.

Provider lifecycle obligations are defined for onboarding and trust establishment, incident notification, degraded-service and continuity handling, substitution and failover posture, data return on termination, deletion evidence, residual-copy treatment, provider exit, and post-exit reconciliation. Each obligation is a governed requirement on the relationship, not an operational runbook.

## V8-37.3 Termination is not data return, deletion, or exit

This section is normative.

The model preserves the following distinctions:

```
Provider termination
≠ data return
≠ deletion
≠ exit completion

Deletion asserted
≠ deletion evidenced
≠ residual copies addressed

Provider certification
≠ Curling Canada confirmation

Continuity
≠ substitution
```

Terminating a provider relationship does not by itself return the data, delete it, or complete an exit. Each is a distinct obligation with its own evidence. A provider assertion that data was deleted is a certification by the provider; provider certification is not Curling Canada confirmation, and the exit is not complete until the deletion is evidenced and residual copies are addressed.

## V8-37.4 Incident notification and continuity are governed dependencies

This section is normative.

Every provider context declares an incident-notification dependency, a continuity dependency, and an exit dependency. Incident notification requires the provider to report incidents affecting governed data within the governed relationship; continuity governs how a degraded or unavailable provider is handled without silent loss of governed meaning; substitution governs how a replacement provider is introduced. Continuity is distinct from substitution: continuity keeps a relationship operating through disruption, while substitution replaces the provider entirely.

## V8-37.5 Data return, deletion evidence, and exit are separately evidenced

This section is normative.

Data return, deletion evidence, and exit completion are separately evidenced obligations. A data-return obligation names the return posture and portability posture; a deletion obligation names the deletion-evidence posture and the residual-copy posture; an exit obligation names the exit posture, the termination distinction, the exit acceptance, and the post-exit reconciliation owner. An exit that lacks return evidence, deletion evidence, or reconciliation is incomplete and is not accepted as closed.

## V8-37.6 No claim of provider engagement

This section is normative.

Nothing in this chapter asserts that any provider is engaged, contracted, onboarded, substituted, or exited. The provider lifecycle contracts are documentary. Every controlled record is in a not-implemented-or-not-proven posture.

## V8-37.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It selects no provider, contract, or infrastructure; it defines no executable integration, failover mechanism, or deletion procedure; and it changes no governed state. Every controlled Package 4 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
