# V1-G - Volume 1 Release Provenance Amendment

Document ID: V1-G  
Title: Volume 1 Release Provenance Amendment  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Post-release patch amendment (v1.0.1); basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-108 APP-V1-045)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G5)  
Supersedes: Only the `base_commit: 677f10e` whole-volume-source interpretation recorded in REG-108 APP-V1-043 and REG-107 DEC-V1-030  
Review Cycle: Frozen at Volume 1 v1.0.1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-G.1 Purpose and narrow scope

This section is normative.

This is a **narrow, post-release governance-metadata amendment**. It corrects a temporal
provenance defect in the machine-readable whole-volume freeze and nothing else. It
changes **no** substantive Volume 1 finding, capability disposition, contradiction,
qualification decision, gate result, or authorization posture. V1-E, V1-F, and every
qualification decision remain unchanged. The published `central-registration-volume-1-v1.0.0`
tag is **not** moved or overwritten; it remains the immutable original released baseline.

## V1-G.2 The defect

This section is normative.

REG-108 APP-V1-043 and REG-107 DEC-V1-030 recorded a single `base_commit: 677f10e` as the
frozen whole-volume baseline, including chapters (V1-F) and freeze records that did not yet
exist at that commit. That is a temporal impossibility: commit `677f10e` is the Package 5
closure commit, which predates both the V1-F executive brief and the whole-volume freeze
records themselves. The defect is confined to internal provenance metadata; the actual
released content is intact because the release tag points to the correct merged commit.

## V1-G.3 Correct four-commit provenance model

This section is normative.

The permanent record distinguishes four distinct commits and one published tag. A single
`base_commit` field cannot correctly represent all of them:

| Field | Correct value | Meaning |
| --- | --- | --- |
| Package 5 closure commit | `677f10e` | Package 5 substantive convergence closed (pre-V1-F, pre-freeze) |
| Complete pre-freeze source snapshot | `9c0f04f` | V1-F executive handoff added; full Volume 1 content present |
| Whole-volume freeze commit | `32d9cd5` | Whole-volume closure and freeze records (DEC-V1-030, APP-V1-043) authored |
| Merged release commit | `3d1e481` | PR #3 merged to `main`; published release commit |
| Published release tag | `central-registration-volume-1-v1.0.0` | Immutable original released baseline |

The corrected values are recorded in machine-readable form in REG-108 APP-V1-045 under
`release_provenance` (`package_closure_commit`, `source_snapshot_commit`, `freeze_commit`,
`merged_release_commit`, `release_tag`).

## V1-G.4 What is superseded and what is preserved

This section is normative.

- **Superseded**: only the interpretation that `base_commit: 677f10e` is the
  complete-volume source snapshot. It is not; `677f10e` is the Package 5 closure commit.
- **Preserved**: `677f10e` remains valid and correct as the Package 5 closure commit.
  V1-E, V1-F, and all qualification decisions (QD-037..QD-065) are unchanged. The v1.0.0
  freeze scope and frozen-artifact versions are unchanged. All prior freezes (Volume 0 and
  Packages 1-5) are preserved and no frozen artifact is modified.

## V1-G.5 Unchanged governance posture

This section is normative.

This amendment confirms, without change:

- **Gate V1-G5**: remains **PASS**.
- **Volume 2**: remains authorized for product and service definition (planning only).
- **Master development plan**: remains **pending**.
- **Implementation and procurement**: remain **not authorized**.
- **Material organizational commitment**: remains **pending executive acceptance**
  (Nolan, D0) at a later material-commitment gate.

## V1-G.6 Release identity

This section is normative.

This amendment is published as patch release **v1.0.1** with tag
`central-registration-volume-1-v1.0.1`, representing the corrected governance metadata.
The original **v1.0.0** baseline and its tag remain immutable. Volume 2 authoring proceeds
from the corrected **v1.0.1** baseline.
