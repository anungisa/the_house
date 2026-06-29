/**
 * Evidence content hashing.
 *
 * Payloads are hash-addressed and hash-verified with SHA-256. Injecting an {@link EvidenceHasher}
 * keeps storage backends testable and lets the digest algorithm stay in one place.
 */

import { createHash } from 'node:crypto';

export interface EvidenceHasher {
  /** Compute the lowercase hex SHA-256 of the given bytes. */
  hash(content: Uint8Array): string;
}

/** Compute the lowercase hex SHA-256 digest of the given bytes. */
export function sha256Hex(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** The default SHA-256 hasher used by storage backends. */
export const sha256EvidenceHasher: EvidenceHasher = {
  hash: sha256Hex,
};
