# Volume 9 — Quality Doctrine and Evidence Hierarchy

Document ID: V9-01
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter states the quality doctrine of The House v2 and defines the evidence
hierarchy by which future assurance claims will be judged. It defines the boundary
of what a claim may and may not assert.

## Quality doctrine

Quality in The House v2 is an institutional property, not a developer convenience.
It exists to protect the integrity of governed operations for a Canadian National
Sport Organization: correct lifecycle behaviour, tenant isolation, authorization
integrity, auditability, evidence integrity, idempotency, data quality, migration
safety, and the security, privacy, accessibility, bilingual, resilience, and
operational properties named in later chapters.

A quality property is never assumed. It is defined as an obligation, later
exercised under a named test level, and finally weighed against an authoritative
oracle by an acceptance authority. Definition alone proves nothing.

## Evidence hierarchy

Evidence is ranked into fifteen tiers, from the weakest documentary definition to
the strongest executive acceptance. The tiers, in ascending rank, are: documentary
definition, expert review, static analysis, unit and component evidence, contract
evidence, integration evidence, system evidence, end-to-end evidence, manual
verification, assistive-technology verification, migration evidence, operational
exercise, production-path evidence, independent assurance, and executive
acceptance.

Each tier is recorded in register REG-901 with a numeric rank and an explicit
substitution prohibition. The governing rule is simple and non-negotiable: a lower
tier may never be substituted for a required higher tier. An assurance claim is
only as strong as the weakest tier of evidence on which it rests.

## Claim boundaries

A Volume 9 record may assert only that an obligation is defined. It may not assert
that a test exists, that a test has run, that a result has passed, that a behaviour
is conformant, that a migration has succeeded, that a provider is assured, or that
a release is ready. Such claims require evidence of the appropriate tier, produced
under a later, execution-authorized package, and weighed by the acceptance
authority named for that claim.

## Evidence integrity

Every future item of evidence must be attributable, reproducible, and versioned:
it must record the commit and configuration under which it was produced, name the
environment class that produced it, and be reproducible from its recorded inputs.
These evidence obligations are defined in register REG-902; no evidence is asserted
to exist in Package 1.
