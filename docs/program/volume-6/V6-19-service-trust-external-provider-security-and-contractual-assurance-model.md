# V6-19 - Service Trust, External-Provider Security, and Contractual-Assurance Model

Document ID: V6-19
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-19.1 Purpose and scope

This section is normative.

This chapter defines service-trust, external-provider security, and contractual-
assurance control objectives. It selects no vendor, signs no contract, connects no
external service, and asserts no provider conformance.

## V6-19.2 Service trust

This section is normative.

Internal and external service trust is governed by a service-trust control objective
(CTRL-V6-034). Service identities and non-human credentials (ASSET-V6-009) receive
only explicit, scoped permissions; no service receives implicit trust. Identity-
provider linkage and federation are within service-trust scope and subject to
provider-outage failure posture.

## V6-19.3 Provider authority separation

This section is normative.

Provider assurance is separated from system assurance. A provider attestation, a
certification, or a contractual commitment is evidence about the provider; it is not
evidence that The House control model is implemented, tested, or independently
assured. Provider authority is separated from governed decision authority: a
provider cannot make governed decisions.

## V6-19.4 Contractual and operational assurance

This section is normative.

A provider-assurance control objective (CTRL-V6-035) records the contractual and
operational assurance dependencies for each external provider, including data-
handling obligations, incident-notification obligations, sub-processor transparency,
audit or attestation dependency, and exit and data-return dependency. These are
control objectives and dependencies only; no procurement or contract is authorized.

## V6-19.5 Per-provider attributes

This section is normative.

For each provider or external service the model records: service purpose; data
exposure; trust boundary; provider authority; contractual-assurance dependency;
incident-notification dependency; sub-processor dependency; exit dependency; failure
posture; and future validation. These are recorded in REG-602 and REG-601 without
naming or selecting any specific provider.

## V6-19.6 Explicit non-authorizations

This section is normative.

This chapter selects no vendor, signs no contract, connects no external service, and
asserts no provider conformance, certification, or independent assurance. It records
service-trust and provider-assurance control objectives and dependencies only. All
provider selection and contracting are pending and gated.
