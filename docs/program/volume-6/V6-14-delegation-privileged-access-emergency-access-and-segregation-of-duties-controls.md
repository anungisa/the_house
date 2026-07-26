# V6-14 - Delegation, Privileged Access, Emergency Access, and Segregation-of-Duties Controls

Document ID: V6-14
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-14.1 Purpose and scope

This section is normative.

This chapter defines control requirements for delegated authority, privileged
access, emergency (break-glass) access, and segregation of duties. It grants no
privilege, creates no administrative role, and provisions no access.

## V6-14.2 Delegation

This section is normative.

Delegated representative authority, reviewer delegation, and temporary coverage are
governed by a delegation control objective (CTRL-V6-020). Every delegated capability
must carry an authority source, a permitted scope, an effective period, delegation
evidence, an approval authority, an expiry, a revocation, and a post-use review.
Delegated authority is always time-bound; delegated authority is not permanent
authority.

## V6-14.3 Privileged and emergency access

This section is normative.

Privileged administrative access, finance privileges, support access, restricted-
evidence access, service administration, and emergency or break-glass access are
governed by a privileged-access control objective (CTRL-V6-021). Privileged and
emergency access are least privilege, approved, time-bound, monitored, and reviewed
after use. Emergency access is not permanent authority, and its use requires
post-use review.

## V6-14.4 Segregation of duties

This section is normative.

Segregation of duties is governed by a segregation and recovery control objective
(CTRL-V6-022). The following separations are required: reviewer recommendation is
not governed decision authority; an affiliation decision is not financial
reconciliation; financial reconciliation is not authoritative activation; support
access is not decision authority; and emergency access is not permanent authority.
Privileged-access misuse (THREAT-V6-004) is addressed by these separations as
governed intent.

## V6-14.5 Per-capability attributes

This section is normative.

For every privileged or delegated capability the model records: authority source;
permitted scope; permitted actions; prohibited actions; effective period; delegation
evidence; approval authority; segregation requirement; monitoring requirement;
expiry; revocation; post-use review; and exception posture. These are recorded in
REG-602 and, where they bind a privileged operation, as obligations
(OBL-V6-004, OBL-V6-005).

## V6-14.6 Explicit non-authorizations

This section is normative.

This chapter grants no privilege, creates no administrative or emergency role, and
provisions no access. It records delegation, privileged-access, emergency-access, and
segregation control objectives and their attributes only. Future validation
(TEST-V6-007) must prove expiry, review, and segregation before any implementation
claim.
