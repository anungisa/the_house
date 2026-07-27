# Volume 9 — Master-Test Catalogue

Document ID: V9-32
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G4)

## Purpose

This chapter defines the master-test catalogue: the governed inventory of the
distinct object types that the integrated master-test baseline is built from, and
the rule that those object types remain distinct and are never collapsed into one
another. The catalogue is a documentary definition only and authorizes no execution.

## The distinct object types

The master-test catalogue holds the following object types strictly distinct. Each
is a separate governed concept with its own record shape, its own authority, and its
own admissibility rule.

- A **test object** is the thing under test: a governed component, service, boundary,
  interface, dataset, or composition.
- A **test requirement** is an obligation that a test object must satisfy, traced to
  an authoritative source and an institutional invariant.
- A **test scenario** is a governed situation — including negative, denial, conflict,
  stale-state, degraded, interruption, duplicate, replay, and recovery situations —
  under which a requirement is exercised.
- A **test case** is a concrete, governed instance of a scenario with preconditions,
  a stimulus, and an expected result bound to an oracle.
- A **test oracle** is the authoritative basis by which a result is judged, derived
  from a governed authority and never from the object under test.
- A **test environment** is the governed class of environment in which a test would
  run; it is never assumed and never a substitute for another class.
- **Test data** is the governed data a test would use; it is classified and governed
  and never unauthorized production information.
- **Evidence** is the governed artifact a test would produce, bound to its version,
  configuration, environment, identity, organization, jurisdiction, data, and time.
- A **result** is the governed disposition of an exercised case; it is never
  presumed and inconclusive is distinct from passed.
- A **defect** is a governed shortfall; it carries an owner, a state, and a
  remediation, retest, and regression obligation.
- **Acceptance** is a governed executive determination; it is distinct from a passing
  result and from documentary completeness.

## The distinctness rule

These object types remain distinct. A requirement is not a scenario; a scenario is
not a case; a case is not a result; a result is not acceptance; an oracle is not the
object it judges; an environment is not a substitute for another environment; test
data is not production data; and evidence is not the claim it supports. The
catalogue records this distinctness as a governed invariant of the baseline, so that
no later volume may silently collapse two object types and mistake one for another.

## Documentary boundary

The catalogue enumerates and governs object types; it instantiates none of them. No
test object is built, no scenario is exercised, no case is run, no environment is
provisioned, no data is created, no evidence is produced, no result is recorded, and
no acceptance is conferred by this chapter.
