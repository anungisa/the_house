# Volume 10 — Scope Baseline, Configuration, Change Control, and Release Units

Document ID: V10-03
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V10-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED

## 1. Purpose

This chapter defines the scope baseline, the configuration-baseline concept, the
change-control rules, and the release-unit concept for delivery planning. These
are planning controls; they cut no baseline and enact no change or release.

## 2. Scope baseline

The scope baseline is the controlled statement of what is in and out of delivery
scope. It is established at planning level and is traceable to the outcome, the
inherited obligations, and the House P0 findings. The scope baseline is a
documentary baseline; it authorizes no construction.

## 3. Change control

Any change to the scope baseline must pass governed change control. Change
control requires an owner, an impact assessment, and a governed decision. No
change to the scope baseline is enacted silently. The change-control process is
recorded in the planning backlog (REG-1004) and is a planning process only; it
does not itself authorize implementation.

## 4. Configuration baseline

A configuration baseline is a controlled reference to the configuration a release
unit will contain. In Package 1 the configuration baseline is a planning concept
only: no baseline is cut, and no configuration is assembled, provisioned, or
deployed.

## 5. Release unit

A release unit is the controlled packaging of work that a future release will
deliver. A release unit is defined here at planning level with a defined state.
A defined release unit is not a release candidate, an accepted release, or a
deployment. Release-unit definitions are recorded in REG-1002 with a
`release_unit_state` of `DEFINED`. Advancement of a release unit's state is
governed by later gates and is not authorized by this package.
