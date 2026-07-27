# Volume 10 — Delivery Doctrine, Lifecycle, and Phase-Gate Model

Document ID: V10-01
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V10-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED

## 1. Purpose

This chapter defines the delivery doctrine, the delivery lifecycle, and the
phase-gate model that governs how The House moves a governed capability from
definition to stabilization. The model is a planning model; passing a phase gate
is a governed decision, not an automatic consequence of authoring a plan.

## 2. Delivery doctrine

Delivery is governed, evidence-bearing, and fail-closed. Work does not advance
between phases without the evidence and authority the receiving phase requires.
A plan is never an authorization; an estimate is never a budget; a target is
never a commitment; a defined environment is never a provisioned or qualified
environment; a test-enablement plan is never an executed test; and a release
candidate is never an accepted release or a deployment.

## 3. Delivery lifecycle phases

The delivery lifecycle is a phase-gate model. Each phase has an entry condition,
a defined body of work, an exit condition, and a governing gate. The phases are
held distinct and are not collapsed into one another:

| Phase | Intent |
| --- | --- |
| Definition | Establish scope, obligations, and planning baseline. |
| Qualification | Confirm inherited obligations and constraints. |
| Planning | Author the delivery plan, work packages, and dependencies. |
| Enablement | Plan environments, data, identity, and provider readiness. |
| Implementation readiness | Confirm readiness to construct; no construction yet. |
| Implementation authorization | Distinct gate that confers implementation authority. |
| Construction | Build the capability under authorization. |
| Verification | Execute verification against defined evidence obligations. |
| Release candidate formation | Assemble a release candidate. |
| Operational readiness | Confirm operability, rollback, and handoff readiness. |
| Release acceptance | Accept a release candidate as a release. |
| Deployment | Deploy an accepted release. |
| Stabilization | Stabilize the deployed capability. |

## 4. Phase distinctions

The following are governed as distinct phases and states, never conflated:

- Planning is distinct from implementation readiness.
- Implementation readiness is distinct from implementation authorization.
- Construction is distinct from Verification.
- Verification is distinct from Operational readiness.
- Operational readiness is distinct from Release acceptance.
- Release acceptance is distinct from Deployment.

## 5. Gate model

Each phase boundary is governed by a gate. A gate is passed only by a governed,
authority-bearing decision supported by the evidence the gate requires. Gate
V10-G1 governs the boundary of this delivery-planning governance foundation; it
confers no implementation authority. Implementation authority is conferred only
by a later implementation-authorization gate.
