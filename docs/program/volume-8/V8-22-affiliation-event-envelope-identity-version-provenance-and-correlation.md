# V8-22 - Affiliation Event Envelope, Identity, Version, Provenance, and Correlation

Document ID: V8-22
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-22.1 Purpose

This section is normative.

This chapter defines the governed event envelope: the required contextual information every affiliation event carries independent of its payload. The envelope is a logical contract of required meaning, not a wire format, serialization, or field encoding. This chapter names the envelope's required elements; it defines no schema, media type, or transport for any of them.

## V8-22.2 Envelope as a logical contract

This section is normative.

The envelope is the governed frame that makes an event identifiable, attributable, orderable within its scope, and reconcilable. Every affiliation event carries an envelope; an event that cannot carry a complete envelope fails closed and is not emitted. The envelope contract is stated as required meanings, each of which is recorded in the contract-requirement register. It defines no byte layout and mandates no particular encoding.

## V8-22.3 Required envelope elements

This section is normative.

Every affiliation event envelope carries, as required meaning: a unique event identity that is stable and never reused; an event type that names the governed fact; an event contract version that names the envelope and payload contract in force; the originating institutional authority; the authoritative source of the fact; the tenant scope within which the fact is true; a correlation identity that links related events of one governed activity; a causation identity that names the event or transition that caused this event; the occurrence time at which the fact became true; the recording time at which the event was captured; a sensitivity marking; and a replay marking that distinguishes an original emission from a governed re-emission. An envelope missing any required element fails closed.

## V8-22.4 Identity, uniqueness, and reuse

This section is normative.

Event identity is unique and permanent. An identity is never reused for a different fact, and a re-emission of the same governed fact carries the same event identity together with a replay marking rather than a new identity presented as a new fact. Identity uniqueness is the basis on which consumers deduplicate; it is defined here as a required envelope meaning and is not an implementation of any keying, hashing, or storage mechanism.

## V8-22.5 Version and provenance

This section is normative.

Every event names the event contract version under which it was emitted, so that a consumer can resolve the meaning it was given rather than a later or earlier meaning. Provenance is carried as originating authority, authoritative source, occurrence time, and recording time. Version and provenance together let the House and its consumers attribute every event to a known authority under a known contract. Version negotiation, schema registries, and compatibility enforcement are not defined here; only the required carriage of version and provenance is defined.

## V8-22.6 Correlation and causation

This section is normative.

Correlation identity links every event produced by one governed affiliation activity so that the activity can be reconstructed. Causation identity names the immediate cause of an event, forming an ordered causal chain from an originating transition. Correlation and causation are required envelope meanings; they are the same correlation and causation identities the governance kernel and outbox propagate. This chapter defines their required presence and meaning, not any propagation, tracing, or storage mechanism.

## V8-22.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no serialization, media type, schema, header, field encoding, broker, or transport for any envelope element, and it changes no governed state. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
