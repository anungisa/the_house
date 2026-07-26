# V6-18 - Security Logging, Audit, Telemetry, Monitoring, and Detection Control Model

Document ID: V6-18
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-18.1 Purpose and scope

This section is normative.

This chapter defines security-logging, audit, telemetry, monitoring, and detection
control objectives. It configures no log pipeline, deploys no monitoring rule, and
asserts no detection capability.

## V6-18.2 Security logging and audit

This section is normative.

Security-relevant and governed events must be recorded in an integrity-protected,
append-only audit journal (ASSET-V6-005) through a privacy-safe logging control
objective (CTRL-V6-032). Logging must be privacy-safe: personal and restricted
content is not copied into logs beyond the bound purpose established in V6-17.
Tampering with audit or log integrity (THREAT-V6-003) is addressed by integrity
protection as governed intent.

## V6-18.3 Events of interest

This section is normative.

The model records the events that must be observable for security purposes,
including authentication outcomes, authorization denials, privileged and emergency
access, restricted-evidence access and disclosure, delegation and revocation,
configuration change, and secret or key operations. Recording these events is a
control objective; no alerting rule or threshold is defined here.

## V6-18.4 Monitoring and detection

This section is normative.

Telemetry, monitoring, and detection are governed by a monitoring-and-detection
control objective (CTRL-V6-033). Detection coverage, correlation, and response
readiness are control objectives whose implementation and validation are pending and
gated. Cross-tenant or cross-jurisdiction access attempts (THREAT-V6-001) are within
detection scope as governed intent.

## V6-18.5 Per-signal attributes

This section is normative.

For each security signal the model records: signal source; event class; integrity
requirement; privacy constraint; retention dependency; detection objective; response
dependency; and future validation. These are recorded in REG-602. No signal record
implies an operational detection or response capability.

## V6-18.6 Explicit non-authorizations

This section is normative.

This chapter configures no logging pipeline, monitoring rule, alert, or detection
threshold, and asserts no detection or response capability. It records logging,
audit, monitoring, and detection control objectives only. Future validation is
pending and gated.
