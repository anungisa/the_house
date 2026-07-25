# Base44 (5) -> (7) Delta (NON-AUTHORITATIVE)

> Generated deterministically by `docs/program/volume-1/controls/delta-base44.mjs`.
> Historical source SRC-009 = `curl-link-hub (5).zip`; current source SRC-001 = `curl-link-hub (7).zip`.
> Evidence input to the Volume 1 Package 2 corrective amendment. Not a qualification decision.

## Corpus totals (5 -> 7)

| Artifact | (5) | (7) | Delta |
| --- | --- | --- | --- |
| routes | 148 | 155 | +7 |
| entities | 87 | 95 | +8 |
| functions | 99 | 101 | +2 |
| pages | 144 | 151 | +7 |
| components | 589 | 604 | +15 |

## Authorization posture (5 -> 7) — core Package 2 findings

| Metric | (5) | (7) |
| --- | --- | --- |
| Functions referencing a permission check | 2 | 2 |
| Functions mutating entities | 66 | 68 |
| Mutating WITHOUT permission check | 66 | 68 |
| Functions using asServiceRole | 78 | 80 |
| Access-matrix entries | 130 | 132 |
| Routes missing from matrix | 18 | 23 |
| Route/matrix role drift | 82 | 83 |
| Unknown path defaults open | true | true |

## Added routes in (7)

- `/iebok`
- `/iebok/browse`
- `/iebok/glossary`
- `/iebok/mechanics`
- `/iebok/standards`
- `/jobs`
- `/jobs/review`

## Removed routes (present in (5), absent in (7))

- (none)

## Added entities in (7)

- `IEBOKArtifact`
- `IEBOKGlossaryTerm`
- `IEBOKMechanic`
- `IEBOKProposal`
- `IEBOKRelationship`
- `IEBOKWorkingGroup`
- `JobPosting`
- `SavedJob`

## Removed entities (present in (5), absent in (7))

- (none)

## Added server functions in (7)

- `expireJobPostings`
- `notifyJobStatus`

## Removed server functions (present in (5), absent in (7))

- (none)

## Dependency / integration delta

- Dependencies: 65 = 65
- Added dependencies: (none)
- Removed dependencies: (none)
- Stripe payments: true = true

## Tests & CI

- (5): test files 0, CI false, test script false
- (7): test files 0, CI false, test script false

## Candidate capability domains (routes / entities / functions / pages)

| Domain | (5) r/e/f/p | (7) r/e/f/p |
| --- | --- | --- |
| analytics | 16/0/3/18 | 16/0/3/18 |
| club_360 | 2/0/0/2 | 2/0/0/2 |
| club_affiliation | 3/2/1/3 | 3/2/1/3 |
| compliance | 7/7/2/7 | 7/7/2/7 |
| event_operations | 19/8/6/15 | 19/8/6/15 |
| governance_administration | 12/7/8/11 | 12/7/8/11 |
| knowledge | 5/2/3/5 | 5/2/3/5 |
| membership | 8/3/9/9 | 8/3/9/9 |
| national_operations | 15/3/1/16 | 16/3/1/17 |
| organization_registry | 15/5/10/8 | 15/5/10/8 |
| participant_identity | 5/4/0/5 | 5/4/0/5 |
| payments | 11/4/5/10 | 11/4/5/10 |
| registration | 3/1/0/3 | 3/1/0/3 |
| support | 2/1/1/2 | 2/1/1/2 |
| unclassified | 44/44/53/51 | 50/52/55/57 |

