# V0-H - Annex H: Executive Constitutional Brief

Document ID: V0-H-EXECUTIVE-BRIEF
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: G0

Audience: Nolan, Executive Sponsor Candidate and Executive Acceptance Authority.
Purpose: a plain-language brief that can be read in one sitting. It summarizes what
the program is, why it matters, how it will be built without uncontrolled or
defective development, and what decisions remain for you. It deliberately avoids
repository mechanics and internal register detail; the authoritative record lives
in the Volume 0 chapters and registers.

---

## 1. What are we building?

We are building the Central Registration Platform: a single, governed system of
record for Curling Canada's core operations. It has two faces. **The House** is the
governed platform and system of record - the durable, authoritative place where
organizational data, decisions, and lifecycle state live. **The Button** is the
simple, public-facing experience layer people actually touch. The House is where
truth is kept and governed; The Button is where that truth is made easy to use.

We are starting deliberately narrow, with one complete, real workflow rather than
a broad, shallow platform.

## 2. Why must Curling Canada do it?

Today, essential registration, membership, affiliation, and related information is
spread across vendors and tools that do not agree with one another, cannot be
governed as one, and cannot be trusted as a single source of truth. That creates
operational risk, manual reconciliation, compliance exposure, and an inability to
answer basic questions with confidence. A national sport organization needs an
authoritative, governed backbone it owns and controls. This program builds that
backbone so the organization is no longer dependent on fragmented, ungoverned
systems.

## 3. Why is club affiliation first?

Club affiliation is the first production workflow because it is foundational:
almost everything else depends on knowing which clubs are affiliated, under what
terms, and in what state. It is a complete, real, high-value process with a clear
lifecycle (application through approval, activation, and renewal). Delivering it
first proves the whole governed model end to end - authority, policy, data,
experience, controls, and evidence - on a workflow that matters, without trying to
boil the ocean.

## 4. What are The House and The Button?

- **The House** is the governed backend and system of record. It owns identity,
  tenancy, permissions, lifecycle state, audit, evidence, and the rules that
  govern how anything is allowed to change. Nothing enters an official state
  except through its controls.
- **The Button** is the experience layer - the accessible, bilingual, public and
  stakeholder-facing surface. It can request actions and present information, but
  it does not own the governed rules. That separation is intentional: the
  experience can evolve quickly without ever putting the system of record at risk.

## 5. What did Base44 contribute?

Base44 was an earlier build that helped us learn what the experience should feel
like and surfaced real requirements. In this program it is treated as **evidence
and input, not as authoritative truth**. We mine it for lessons, workflows, and
data understanding, but The House - not Base44 - is the governed system of record.
This keeps us from inheriting ungoverned assumptions while still benefiting from
the work already done.

## 6. How will the program avoid uncontrolled or defective development?

This is the core commitment. The program is governed by a written constitution
(Volume 0) that is now ratified and frozen, and - importantly - **enforced by
software**, not just by good intentions:

- Nothing enters an official state except through a single governance mechanism
  with explicit, versioned rules. Unknown or unauthorized changes fail closed.
- Every governed change is tenant-aware, recorded in an append-only audit trail,
  and produces evidence.
- The governance rules are machine-validated: an automated check confirms the
  constitution is internally consistent, that nothing falsely claims approval,
  that references resolve, and that frozen decisions cannot be quietly altered.
  This check must pass with zero errors.

In plain terms: the platform is built so that "someone just changed something they
shouldn't have" is structurally prevented, not merely discouraged.

## 7. How will quality and testing advance with the build?

Quality is built in from the start, not inspected in at the end. Testing advances
concurrently with construction: every governed capability is designed with its
tests, and controlled implementation proceeds behind evidence gates. The doctrine
explicitly prohibits weakening assurance controls to move faster. Independent
assurance (security, privacy, accessibility, French-language, disaster recovery)
is scheduled before the corresponding production exposure - never claimed early,
never skipped.

## 8. What decisions remain for you (Nolan) later?

These are yours to make at the appropriate time. None of them blocks the current
design and controlled build work, and none is being decided for you now:

- **Executive organizational acceptance** - before any material organizational
  commitment or pilot authorization.
- **Funding approval** - before any external expenditure or funded delivery
  commitment.
- Endorsement to proceed to **pilot** with a named club/PTSO cohort.
- Acceptance of the **financial model** (fees, payments, sustainability) when it
  is ready for decision.

## 9. What work is now authorized?

Gate G0 is **PASS_WITH_TIME_BOUNDED_CONDITIONS**. That authorizes controlled
design, documentation, architecture, requirements, test construction, and governed
implementation of the club-affiliation workflow. The constitutional foundation
(Packages 1-4) is complete, ratified, frozen, and machine-validated. The program
can now build - carefully, under its own controls - the first real workflow.

## 10. What is explicitly not yet being claimed?

To be completely straight with you, the following are **not** claimed:

- This is **not** independent certification. The readiness is author-verified and
  self-attested by the accountable authority, and it says so plainly.
- We are **not** claiming your executive acceptance, funding approval, or any
  stakeholder or domain sign-off. Those remain open decisions with named owners.
- We are **not** claiming production readiness, security/privacy assurance,
  bilingual or accessibility conformance, or operational proof. Each is scheduled
  before its corresponding production exposure.

Nothing in this brief should be read as more than it says: a disciplined,
governed foundation is in place, one real workflow is authorized to be built under
control, and the material commitments remain yours to make when the evidence for
them is ready.
