# V4-K - Volume 4 Release Provenance Amendment

Document ID: V4-K  
Title: Volume 4 Release Provenance Amendment  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Post-release governance-metadata amendment; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-072)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G5)  
Supersedes: Released-state interpretation in REG-405 APP-V4-071 only  
Review Cycle: Frozen at Volume 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-K.1 Purpose and narrow scope

This section is normative.

This is a **narrow, post-release governance-metadata amendment**. It completes and corrects the
machine-readable release-provenance record for Volume 4 now that the final release merge and the
annotated release tag both exist. It changes **no** substantive Volume 4 architecture finding,
integrated-baseline element, boundary definition, authority invariant, security or privacy synthesis,
data or integration rule, quality-attribute scenario, engineering control, test or evidence rule,
decision, fitness function, assumption, risk, exception, debt disposition, readiness classification,
House P0 coverage mapping, downstream-volume constraint, or gate result. Gate V4-G5 - Architecture and
Engineering Definition Complete and its ARCHITECTURE_AND_ENGINEERING_DEFINITION_COMPLETE disposition
remain unchanged and remain a PASS. The completion record V4-I, the Package 5 freeze (PACKAGE-4-5), and
the whole-volume freeze (VOLUME-4) are **not** reopened or modified. It authorizes no implementation.

## V4-K.2 Reason for the amendment

This section is normative.

The V4-J provenance amendment (REG-405 APP-V4-071) deliberately did not pre-record its own future merge
commit or the annotated release tag as established evidence, because at V4-J authoring time neither
existed. At that time the only merge that existed was the original Package 5 merge `bab2ea0`, which
APP-V4-071 recorded as `release_merge_commit`. Both deferred facts now exist: the final Volume 4 release
merge is `512d28e` (the V4-J merge) and the annotated tag `central-registration-volume-4-v1.0.0`
(tag object `704eebf`) points at commit `512d28e`. Recording `bab2ea0` as the released state is
therefore now an **incomplete released-state interpretation**: `bab2ea0` is the original Package 5 merge,
not the final released repository state. This amendment records the complete, temporally precise release
lineage in machine-readable form and supersedes only that released-state interpretation in APP-V4-071.

## V4-K.3 Complete Volume 4 release lineage

This section is normative.

The permanent record distinguishes the following eight provenance references. Each is a distinct role and
none is a substitute for another.

| Provenance role | Commit or reference | Meaning |
| --- | --- | --- |
| Package 5 architecture snapshot | `ebdd6ce` | Chapters V4-39..V4-49 authored; closure tooling extended; REG-400..REG-405 expanded |
| Package 5 and Volume 4 closure-freeze | `d0af521` | V4-I completion record, Gate V4-G5 disposition, Package 5 freeze, and whole-volume freeze authored |
| Original Package 5 merge | `bab2ea0` | PR #35 merged to `main`; original Package 5 merge, not the final released state |
| V4-J provenance-amendment authoring | `439114d` | Package 5 provenance completion (V4-J) authored |
| Final Volume 4 release merge | `512d28e` | PR #36 (V4-J) merged to `main`; final released Volume 4 repository state |
| Original annotated release tag | `central-registration-volume-4-v1.0.0` | Canonical v1.0.0 release pointer; not moved by this amendment |
| Annotated tag object | `704eebf` | The annotated tag object for v1.0.0 |
| Tag target commit | `512d28e` | The commit the v1.0.0 tag dereferences to |

Inherited baseline: the corrected Volume 3 tag `central-registration-volume-3-v1.0.1`. These corrected and
completed values are recorded in machine-readable form in REG-405 APP-V4-072 under `package_provenance`
(`source_snapshot_commit`, `closure_freeze_commit`, `original_package_merge_commit`,
`provenance_amendment_commit`, `release_merge_commit`, `release_tag`, `release_tag_object`,
`release_tag_target_commit`, `inherited_baseline_tag`).

## V4-K.4 What is superseded and what is preserved

This section is normative.

- **Superseded (narrowly)**: only the released-state interpretation in REG-405 APP-V4-071, in which the
  original Package 5 merge `bab2ea0` was recorded as `release_merge_commit`. The final released state is
  `512d28e`. APP-V4-071's ratification of V4-J is otherwise preserved and is not withdrawn.
- **Preserved**: the completion record V4-I; Gate V4-G5 and its ARCHITECTURE_AND_ENGINEERING_DEFINITION_COMPLETE
  disposition as a PASS; all twenty-one gate conditions; the Package 5 freeze (PACKAGE-4-5) and the
  whole-volume freeze (VOLUME-4); the frozen artifacts V4-39 through V4-49 and V4-I; Volume 5 authorization
  as an architecture- and data-definition volume only; and every substantive Volume 4 architecture element,
  decision, fitness function, assumption, and risk.
- **Unchanged posture**: this amendment authorizes no implementation, physical schema, executable
  migration, executable interface, infrastructure provisioning, procurement, vendor or cloud-service
  selection, security accreditation, delivery sequencing, staffing, cost plan, pilot, rollout, launch, or
  master development plan, and claims no implemented architecture and no fabricated validation.

## V4-K.5 Tag and release-pointer discipline

This section is normative.

The annotated tag `central-registration-volume-4-v1.0.0` is immutable and is **not** moved by this
amendment; it continues to point at commit `512d28e`. A corrected patch tag
`central-registration-volume-4-v1.0.1` is published separately against the V4-K release-merge commit as
the canonical final-release pointer that includes this completed provenance record, and the still-empty
Volume 5 branch `docs/volume-5-data-governance` is recreated from the corrected v1.0.1 tag. Consistent with
the discipline applied to V4-J, this amendment does not pre-record its own future merge commit or the
v1.0.1 tag object or target as established evidence; those become machine-readable only once they exist.
