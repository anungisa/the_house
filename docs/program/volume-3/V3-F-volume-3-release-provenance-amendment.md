# V3-F - Volume 3 Release Provenance Amendment

Document ID: V3-F  
Title: Volume 3 Release Provenance Amendment  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Post-release patch amendment (v1.0.1); basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-067)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G5)  
Supersedes: Only the `merged_commit: 8a1c6ae` released-state interpretation recorded in REG-305 APP-V3-065 and APP-V3-066 and REG-304 DEC-V3-016  
Review Cycle: Frozen at Volume 3 v1.0.1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-F.1 Purpose and narrow scope

This section is normative.

This is a **narrow, post-release governance-metadata amendment**. It corrects a temporal
provenance defect in the machine-readable Package 5 and whole-volume freeze provenance and
nothing else. It changes **no** substantive Volume 3 finding, operating-model definition,
service, authority boundary, requirement, control, measure, gate result, or authorization
posture. V3-E and every substantive Volume 3 chapter, decision, and requirement remain
unchanged. The published `central-registration-volume-3-v1.0.0` tag is **not** moved or
overwritten; it remains the immutable original released baseline.

## V3-F.2 The defect

This section is normative.

REG-305 APP-V3-065 (PACKAGE-3-5) and APP-V3-066 (VOLUME-3), and REG-304 DEC-V3-016, recorded
`merged_commit: 8a1c6ae` as the merged state of the release. Commit `8a1c6ae` is the **original
Package 5 merge** (PR #24). It is not the final released repository state: the published
`central-registration-volume-3-v1.0.0` tag points to `c1d8d9b`, which is the merge of the
Package 5 provenance amendment itself (PR #25). The machine-readable record did not distinguish
the provenance-amendment authoring commit (`62db1cd`) or the final release merge (`c1d8d9b`) from
the original Package 5 merge (`8a1c6ae`). The defect is confined to internal provenance metadata;
the actual released content is intact because the release tag points to the correct merged commit.

## V3-F.3 Correct six-role provenance model

This section is normative.

The permanent record distinguishes six distinct provenance roles. A single `merged_commit` field
cannot correctly represent all of them:

| Provenance role | Commit | Meaning |
| --- | --- | --- |
| Package 5 authoring snapshot | `6b1a1df` | Package 5 chapters, closure tooling, and register expansion authored |
| Package 5 / Volume 3 closure-freeze | `9f64667` | V3-E closure, Gate V3-G5 disposition, Package 5 and whole-volume freeze records authored |
| Original Package 5 merge | `8a1c6ae` | PR #24 merged to `main`; original Package 5 merge commit |
| Provenance-amendment authoring commit | `62db1cd` | Package 5 freeze-provenance completion authored (PR #25 branch tip) |
| Final Volume 3 v1.0.0 release merge | `c1d8d9b` | PR #25 merged to `main`; final released repository state |
| Published release tag | `central-registration-volume-3-v1.0.0` | Immutable original released baseline (points to `c1d8d9b`) |

The corrected values are recorded in machine-readable form in REG-305 APP-V3-067 under
`package_provenance` (`source_snapshot_commit`, `closure_freeze_commit`,
`original_package_merge_commit`, `provenance_amendment_commit`, `release_merge_commit`,
`release_tag`, `inherited_baseline_tag`).

## V3-F.4 What is superseded and what is preserved

This section is normative.

- **Superseded**: only the interpretation that `merged_commit: 8a1c6ae` is the final released
  repository state. It is not; `8a1c6ae` is the original Package 5 merge, and the final released
  state is `c1d8d9b`.
- **Preserved**: `8a1c6ae` remains valid and correct as the original Package 5 merge. `6b1a1df`
  (authoring snapshot) and `9f64667` (closure-freeze) are unchanged. V3-E and all substantive
  Volume 3 content are unchanged. The v1.0.0 freeze scope and frozen-artifact versions are
  unchanged. All prior freezes (Volume 0, Volumes 1 and 2, and Volume 3 Packages 1-5) are
  preserved and no frozen artifact is modified.

## V3-F.5 Unchanged governance posture

This section is normative.

This amendment confirms, without change:

- **Gate V3-G5**: remains **PASS** (BUSINESS_OPERATING_MODEL_COMPLETE).
- **Volume 4**: remains authorized for architecture and engineering definition (planning only).
- **Master development plan**: remains **pending**.
- **Implementation and procurement**: remain **not authorized**.
- **Staffing, headcount, cost, fees, funding, pilot, rollout, launch, and delivery sequencing**:
  remain **not authorized**.
- **Material organizational commitment**: remains **pending executive acceptance** (Nolan) at a
  later material-commitment gate.

## V3-F.6 Release identity

This section is normative.

This amendment is published as patch release **v1.0.1** with tag
`central-registration-volume-3-v1.0.1`, representing the corrected governance metadata. The
original **v1.0.0** baseline and its tag remain immutable. Volume 4 authoring proceeds from the
corrected **v1.0.1** baseline. The inherited baseline tag `central-registration-volume-2-v1.0.1`
is unchanged.
