# Volume 9 — Security, Privacy, Accessibility, Bilingual, Records, Resilience, and Operational Assurance Foundation

Document ID: V9-07
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter defines the cross-cutting assurance foundation of The House v2:
security, privacy, accessibility, bilingual equivalence, financial and records
integrity, resilience, recovery, and operational assurance. It defines obligations
only.

## Security and privacy

Security obligations exercise authorization integrity, tenant isolation, and the
fail-closed behaviour of the Governance Kernel and guard registry against
deliberate abuse. Privacy obligations exercise data minimization, consent, and the
prohibition on unauthorized use of real personal information. Both are defined at
the security-test and privacy-test levels and require security-or-privacy
independence for their evidence.

## Accessibility and bilingual equivalence

Accessibility obligations exercise conformance both statically and through manual
verification, including assistive-technology verification that cannot be inferred
from automated checks alone. Bilingual obligations exercise semantic equivalence
between the English and French expressions of governed content. These require
accessibility-or-bilingual independence, and assistive-technology evidence is a
distinct tier that a static check may never substitute.

## Financial and records integrity

Financial and records obligations exercise the integrity, retention, and
auditability of financial and records data. Evidence for these obligations must be
attributable and reproducible, and real financial or restricted-evidence data is
prohibited under Package 1.

## Resilience and recovery

Resilience obligations exercise the platform's behaviour under fault and load.
Recovery obligations exercise backup, restore, and recovery exercises against a
defined recovery objective. Resilience and recovery evidence is produced under the
recovery-exercise environment class and cannot be inferred from functional testing.

## Operational assurance

Operational obligations exercise the deployment path, observability, and
operational exercises that show the platform can be run and observed in production
conditions. Operational-exercise evidence is a distinct tier reserved for later,
execution-authorized volumes.

## No execution asserted

None of the obligations in this chapter asserts that a security, privacy,
accessibility, bilingual, financial, records, resilience, recovery, or operational
test has been authored, provisioned, executed, or passed.
