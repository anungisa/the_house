# V1-04 - Current-State Evidence Quality Standard

Document ID: V1-04  
Title: Current-State Evidence Quality Standard  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-A, REG-108 APP-V1-005)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G1)  
Supersedes: None  
Review Cycle: Monthly until Volume 1 closes  
Repository Path: docs/program/volume-1/

## V1-04.1 Purpose

This section is normative.

This document defines the evidence-quality scale used to rate every source,
evidence item, capability, and finding in Volume 1. It governs when a capability's
current state may be relied upon for a disposition.

## V1-04.2 Evidence-quality scale

This section is normative.

Every rating is one of five values:

- **E0 UNSUBSTANTIATED** — asserted with no supporting observation; belief or claim
  only.
- **E1 INDICATIVE** — a single, indirect, or partial observation suggesting the
  claim, not sufficient to rely on.
- **E2 CORROBORATED** — supported by two or more independent observations or
  sources of differing classification.
- **E3 DEMONSTRATED** — directly observed to be true in a representative context
  (for example, exercised behaviour, inspected implementation).
- **E4 PROVEN** — demonstrated under controlled, repeatable conditions with
  recorded results, sufficient for high-consequence reliance.

## V1-04.3 Recency rule

This section is normative.

A recent timestamp must not automatically increase evidence quality. Recency is
metadata. A change made moments ago carries no more evidentiary weight than an old
one; only observation and verification raise a rating.

## V1-04.4 Authorship and volume rules

This section is normative.

- Self-attestation does not raise a rating above E1 for claims that require
  independence.
- The quantity of an artifact (lines of code, number of screens, size of an export)
  does not raise evidence quality.
- A claim requiring independent assurance may not be rated E3 or E4 on the strength
  of self-attestation alone; it remains capped until independent observation exists.

## V1-04.5 Reliance thresholds

This section is normative.

- A disposition of ADOPT or RETAIN (V1-03) requires the capability's current-state
  evidence to be at least E2, and at least E3 where the capability is
  high-consequence (production-critical, safety, or compliance).
- A finding used to justify REBUILD, RETIRE, or EXTERNALIZE must itself cite
  evidence of at least E2.
- DEFER is permitted at any rating and is the correct disposition when evidence is
  insufficient to decide responsibly.

## V1-04.6 Honest rating discipline

This section is normative.

Ratings are assigned conservatively. Where the available evidence is genuinely
weak, the low rating is recorded rather than inflated. Volume 1 prefers an honest
E1 to an unsupported E4. Overstated evidence quality is a governance defect and is
subject to the ratification-integrity control (fabricated-assurance detection).
