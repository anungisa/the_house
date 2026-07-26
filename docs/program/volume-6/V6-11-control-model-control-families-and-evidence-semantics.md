# V6-11 - Control Model, Control Families, and Evidence Semantics

Document ID: V6-11
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-11.1 Purpose and scope

This section is normative.

This chapter defines the controlled security, privacy, and trust-control model for
Volume 6 Package 2. It establishes the control families, the per-control-objective
attributes, and the evidence semantics that every subsequent control objective must
carry. It defines controls as governed obligations only. It creates no executable
security, authorization, privacy, or logging policy; no identity, access, or
cryptographic configuration; no secret, certificate, or key; and no infrastructure.

## V6-11.2 Inheritance and scope boundary

This section is normative.

Package 2 inherits the Package 1 protection foundation (V6-00 through V6-10, V6-A)
and its provenance (V6-B), the released Volume 5 governed-data baseline
(`central-registration-volume-5-v1.0.0`), and the frozen Volume 0 through 4
baselines. Package 2 turns the Package 1 doctrine, assets, boundaries, risks,
rights, and obligation families into a detailed, evidence-bearing control model. It
does not reopen any frozen Package 1 chapter.

## V6-11.3 Control families

This section is normative.

The control model is organised into the following controlled families: identity;
authentication; authorization; delegation; privileged access; session and
credential; resource isolation; restricted evidence; data protection; cryptography;
secrets and keys; privacy purpose; minimization; notice and rights; disclosure and
export; logging and audit; monitoring and detection; service trust; provider
assurance; configuration; and exception and recovery. Every control objective in
REG-602 names exactly one control family.

## V6-11.4 Control-objective attributes

This section is normative.

Every control objective must carry: a control identifier; the protected asset or
right; the threat or abuse addressed; an authority owner; a control owner; a
control-operator status; preventive, detective, and corrective intent; the evidence
required; an implementation-evidence class; an operational-proof dependency; an
independent-assurance dependency; an exception authority; a future blocking gate;
and an implementation status. These attributes are recorded in REG-602.

## V6-11.5 Evidence semantics

This section is normative.

The implementation-evidence class of every control objective is drawn from the
controlled vocabulary: control defined; design evidence required; implementation
evidence required; test evidence required; operational proof required; and
independent assurance required. A written control objective is evidence only that
the control has been defined. It is not evidence that the control has been designed,
implemented, tested, operated, or independently assured. No control objective in
this package may assert an implemented, compliant, conformant, or independently
assured state.

## V6-11.6 Separation of assurance stages

This section is normative.

The model keeps four stages explicitly distinct: control definition; implementation
evidence; operational proof; and independent assurance. Progression from one stage
to the next is gated. No Package 2 record collapses these stages or claims a later
stage on the strength of an earlier one.

## V6-11.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation, executable policy, identity or access
configuration, cryptographic configuration, secret, key, certificate,
infrastructure, monitoring rule, procurement, delivery sequence, or master
development plan. It claims no security, privacy, accessibility, or provider
conformance, operational proof, or independent assurance. Every Package 2 record
sets `authorizes_implementation: false` and `implementation_status:
NOT_IMPLEMENTED_OR_NOT_PROVEN`.
