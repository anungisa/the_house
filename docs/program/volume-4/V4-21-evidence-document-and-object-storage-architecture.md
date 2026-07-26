# V4-21 - Evidence, Document, and Object-Storage Architecture

Document ID: V4-21  
Title: Evidence, Document, and Object-Storage Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-030)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-21.1 Purpose and scope

This section is normative.

This chapter defines the architecture for evidence and supporting documents: the separation between
authoritative evidence metadata and binary content, evidence binding and provenance, integrity,
sensitivity and restricted access, lifecycle, and the scanning, encryption, retention, and legal-hold
boundaries. It authors no storage schema, selects no storage vendor, and claims that no scanning,
encryption, legal-hold, or retention control is implemented.

## V4-21.2 Metadata and binary-content separation

This section is normative.

Authoritative evidence metadata and binding are owned by the House (DATA-V4-017); binary or object
content resides in a controlled evidence-storage service (DEP-V4-018). This separation is an
architecture decision (ADR-V4-021, ARCH-V4-021): the House holds the authoritative record of which
evidence exists, to what it is bound, and its provenance and sensitivity, while the storage service
holds the content. The storage service is not authoritative over binding, sensitivity, or lifecycle.

## V4-21.3 Evidence binding, provenance, and integrity

This section is normative.

Evidence metadata records binding to the affiliation case, the applicable requirement version, the
submitting actor, provenance, and the effective evidence version (inherits CTRL-V4-013). It records
content type and an integrity verification reference so that content can be checked against its
recorded integrity value. Replacement and supersession preserve prior versions; evidence is never
silently overwritten.

## V4-21.4 Sensitivity, restricted access, and confidentiality

This section is normative.

Each evidence item carries a sensitivity classification. Evidence visibility is a resource-aware
authorization decision (CTRL-V4-022): access to restricted evidence requires both resource and
sensitivity authorization, consistent with V4-15. Evidence confidentiality and integrity are quality
attributes of the architecture (NFR-V4-018); the encryption boundary is defined architecturally while
the cryptographic implementation and key management remain validation-pending (V4-24).

## V4-21.5 Lifecycle, quarantine, and retention boundary

This section is normative.

The evidence lifecycle includes replacement, supersession, expiry, withdrawal, quarantine, a
malware-scanning boundary, deletion authorization, and recovery. Quarantine and the scanning boundary
are architectural placements: evidence pending scan is not treated as accepted governed evidence.
Retention and destruction are governed by the approved records and privacy policy and are recorded as
assumptions (REG-404); the architecture does not assert that retention or legal-hold controls are
implemented.

## V4-21.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation. It selects no storage vendor; authors no storage schema,
bucket, or object layout; and claims no implemented scanning, encryption, legal-hold, retention, or
recovery control. Every element it introduces carries `authorizes_implementation: false`.
