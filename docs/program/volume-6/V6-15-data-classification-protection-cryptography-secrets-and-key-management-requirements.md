# V6-15 - Data Classification, Protection, Cryptography, Secrets, and Key-Management Requirements

Document ID: V6-15
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-15.1 Purpose and scope

This section is normative.

This chapter defines data-classification, data-protection, cryptography, secrets,
and key-management control objectives. It selects no algorithm, provider, vault,
certificate, or key, and sets no rotation period. It records protection requirements
and their evidence semantics as governed obligations.

## V6-15.2 Classified information

This section is normative.

The model covers public information, internal operational information, personal
information, restricted evidence, financial-status information, privileged
administrative information, security and audit information, secrets, configuration,
migration and quarantine data, and exports and analytics datasets. Each is bound to
the Package 1 classification categories and to its protected assets.

## V6-15.3 Data protection

This section is normative.

Protection in transit, protection at rest, and field- or object-level protection
dependencies are governed by a data-protection control objective (CTRL-V6-023).
Protection strength follows classification. Environment separation and test-data
restrictions are governed obligations; production data is not used as test data.

## V6-15.4 Cryptography

This section is normative.

A cryptographic control objective (CTRL-V6-024) records cryptographic requirements
without selecting algorithms, providers, or parameters. The posture is: the
cryptographic requirement is defined; algorithm or service selection is pending;
key-management implementation is not proven; and operational rotation evidence is
not proven.

## V6-15.5 Secrets and keys

This section is normative.

Secret externalization, key ownership, rotation, revocation, backup protection, and
cryptographic-provider validation are governed by a secrets-and-keys control
objective (CTRL-V6-025). Secrets and keys are protected assets (ASSET-V6-003) and are
never embedded in source or configuration. Credential compromise (THREAT-V6-002) is
addressed by externalization, ownership, and rotation as governed intent.

## V6-15.6 Configuration integrity

This section is normative.

Configuration integrity and environment separation are governed by a configuration
control objective (CTRL-V6-026). Configuration is a protected asset (ASSET-V6-010),
and logging restrictions apply so that secrets and restricted content are not copied
into configuration or logs.

## V6-15.7 Explicit non-authorizations

This section is normative.

This chapter selects no algorithm, provider, vault, certificate, key, or rotation
period, and creates no cryptographic configuration or secret. It records protection
requirements and evidence semantics only. Future validation (TEST-V6-008) must prove
data protection, key management, and rotation before any implementation claim.
