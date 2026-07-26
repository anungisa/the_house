# V6-01 - Protection Doctrine, Trust Principles, and Governance Model

Document ID: V6-01
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G1)

## V6-01.1 Purpose and scope

This section is normative.

This chapter states the protection doctrine and trust principles that govern The
House v2 and the obligations it places on any experience layer, including The
Button. It defines principles and a governance model only; it authorizes no
control implementation.

## V6-01.2 Protection doctrine

This section is normative.

The House is the governed system of record. Its protection posture is grounded in
the following doctrine:

- Protect governed data as the primary asset. Confidentiality, integrity, and
  availability of governed affiliation data, evidence, and audit records are the
  central protection outcomes.
- Fail closed. Where a protection decision cannot be made with confidence, access
  is denied and the condition is made visible, never silently permitted.
- Least privilege by default. Every actor, human or automated, receives only the
  minimum authority necessary for a stated purpose.
- Defence in depth. No single control is trusted to be sufficient; obligations are
  layered across identity, authorization, data protection, and monitoring.
- Accountability by design. Governed and security-relevant actions are attributable
  and recorded in an integrity-protected audit journal.
- Privacy and inclusion are protection outcomes. Minimization, transparency,
  accessibility, and bilingual equivalence are governed obligations, not optional
  enhancements.

## V6-01.3 Trust principles

This section is normative.

Trust is earned through evidence, not asserted. Volume 6 adopts the following trust
principles:

- No implicit trust across a boundary. Every trust boundary is explicit and every
  crossing is subject to obligations.
- Experience layers are least-trusted callers. The Button and other experience
  layers request actions; they never hold governed protection authority and are
  treated as untrusted input at the platform boundary.
- Providers are trusted only with evidence. External providers gain reliance only
  through validated assurance and contractual obligation.
- Claims require proof. No conformance, compliance, or effectiveness is claimed
  without recorded, independently validated evidence.

## V6-01.4 Governance model

This section is normative.

Protection obligations are governed as records with explicit owners, evidence
requirements, and future validation gates. The model separates:

- obligations — what must be true;
- control objectives — the governed intent of a control that would satisfy an
  obligation;
- assurance requirements — the evidence and independent validation needed before an
  obligation may be relied upon; and
- validation backlog — the future tests that will prove the above.

None of these authorize construction. Each is dispositioned only through the
governed gate sequence.

## V6-01.5 Relationship to the Governance Kernel

This section is normative.

The Governance Kernel remains the sole authority for governed lifecycle
transitions. Volume 6 does not alter kernel behaviour. It records the protection
obligations that surround kernel-governed data and the authorization inputs that a
future authorization control must supply to the kernel and to domain modules.

## V6-01.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no control, executable policy, identity or access
configuration, monitoring, incident response, or privacy workflow. It defines
doctrine and a governance model only. No protection exception is granted in
Package 1; any future exception requires recorded authority and expiry.
