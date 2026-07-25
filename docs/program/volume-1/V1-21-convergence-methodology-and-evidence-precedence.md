# V1-21 - Convergence Methodology and Evidence Precedence

Document ID: V1-21  
Title: Convergence Methodology and Evidence Precedence  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 5 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-E, REG-108 APP-V1-034)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G5)  
Supersedes: None  
Review Cycle: Frozen at Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-21.1 Purpose

This section is normative.

This chapter opens Volume 1 Package 5 — Convergence and Target Disposition, the final
Volume 1 package. It answers the first half of the central convergence question — *how*
the three ratified evidence streams are converged into one defensible target
disposition — and fixes the evidence-precedence rules that every later convergence
chapter (V1-22 through V1-26) and the closure record (V1-E) must obey.

Package 5 is qualification and target-definition work. It does **not** implement the
application, author a master development plan, authorize procurement, or make any
material commitment. Those remain reserved for a later executive-accepted
material-commitment gate.

## V1-21.2 The three converged evidence streams

This section is normative.

Convergence draws on three already-ratified factual inputs, each with a distinct and
bounded authority:

1. **Base44 product and interaction intelligence** (Package 2, V1-05..V1-09;
   `generated/base44/`). Product and experience evidence only. It is **not** production
   authority. Its reusable value is qualified; its prototype behaviour and hardcoded
   assumptions are rejected.
2. **The House implementation truth** (Package 3, V1-10..V1-14; `generated/house/`).
   Runtime code, persistence constraints, and executable tests. Production-candidate,
   not established production truth; demonstrated VALUE is separated from unproven
   READINESS.
3. **Curling Canada operating and ecosystem reality** (Package 4, V1-15..V1-20;
   `generated/ecosystem/`). Policy truth is distinguished from stakeholder-described
   operations; contractual and commercial questions remain open.

The controlled convergence source (REG-101 SRC-022,
`inputs/convergence-input.yaml`) structures these into the target disposition. It
introduces no new primary evidence and generates no facts from absence.

## V1-21.3 Evidence precedence: claim type determines controlling evidence

This section is normative.

The controlling evidence for any assertion is determined by the **type of claim** being
made, not by which stream is newest or most polished. The precedence table is recorded
in `generated/convergence/source-baseline-summary.json`:

| Claim type | Controlling evidence |
| --- | --- |
| National policy or decision authority | Ratified policy and authorized decision |
| Actual current operating practice | Corroborated operational evidence and stakeholder validation |
| Implemented system behaviour | Runtime code, persistence constraints, and executable tests |
| Contractual obligation | Executed agreement or authoritative contract record |
| Vendor capability | Demonstrated capability or authoritative vendor evidence |
| User-experience value | Observed journey, validated stakeholder need, usability evidence |
| Financial truth | Accounting, contract, and validated business evidence |

## V1-21.4 Precedence rules

This section is normative.

The following rules bind every convergence decision. They are recorded verbatim in the
controlled input and are non-negotiable for Package 5:

1. Newer does not automatically mean more authoritative.
2. Implemented does not automatically mean desirable.
3. Polished UX does not establish business validity.
4. Current practice does not automatically become the target.
5. Documentation does not override contradictory executable evidence.
6. Unresolved material contradictions must remain open.
7. E0/E1 evidence alone cannot support an irreversible target decision.
8. A source authoritative for one claim type is non-authoritative for another.

## V1-21.5 Deterministic convergence tooling

This section is normative.

The `qualification:convergence` tooling
(`controls/inventory-convergence.mjs`, `controls/convergence-lib.mjs`) structures the
controlled convergence input, the ratified registers, and the generated Package 2-4
inventories into NON-AUTHORITATIVE views under `generated/convergence/`. The tooling is
deterministic and anchored to the input fingerprint (SHA-256 of
`inputs/convergence-input.yaml`). It **invents no target decision**: every disposition
originates in the controlled input or the ratified chapters and registers. Regenerating
from the same input reproduces the inventories byte-for-byte.

## V1-21.6 Test-accounting reconciliation

This section is normative.

Package 5 records a narrow evidence correction to the Package 3 test accounting
(DEC-V1-026; REG-101 SRC-023; REG-102 EV-052). The static Package 3 inventory reported
1326 unit test cases; that figure is a **lexical** it/test token count that includes
tokens appearing in comments and strings and cannot expand `it.each()` blocks. The
observed runtime execution (`npx vitest run tests/unit`, 2026-07-25) is **1300 passed,
0 skipped, 0 todo, 0 excluded, 99 files**. The 26-case gap is entirely a
parser-semantics artifact. The controlling figure for Volume 1 is **1300 executed and
passed**. This correction is recorded in the Package 5 layer only and does **not**
reopen or modify the frozen Package 3 artifacts.

## V1-21.7 Scope and non-authorization

This section is normative.

This chapter authorizes no implementation, no procurement, and no master development
plan. It fixes methodology and evidence precedence. Material contradictions are retained
open (V1-23), not force-closed. Executive organizational acceptance (Nolan, D0) remains
pending at a later material-commitment gate.
