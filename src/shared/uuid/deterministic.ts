import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * Deterministic (name-based) UUID v5 generation.
 *
 * RFC 4122 §4.3: a UUID v5 is derived from a namespace UUID + a name via SHA-1, so the SAME
 * (namespace, name) pair ALWAYS yields the SAME UUID. This gives us a stable, collision-resistant
 * identity that can be recomputed independently by any party without coordination — exactly what an
 * idempotent, at-least-once projection needs: a replayed or duplicated event resolves to the SAME
 * derived identity rather than minting a new random one.
 *
 * This is NOT a random id generator (see {@link IdGenerator}); it is a PURE function of its inputs.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Parse a canonical UUID string into its 16 raw bytes. Throws on a malformed namespace. */
function uuidToBytes(uuid: string): Buffer {
  if (!UUID_RE.test(uuid)) {
    throw new Error(`Invalid namespace UUID: ${uuid}`);
  }
  return Buffer.from(uuid.replace(/-/gu, ''), 'hex');
}

/** Format 16 raw bytes as a canonical lowercase UUID string. */
function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

/**
 * Compute the RFC 4122 v5 (SHA-1, name-based) UUID for `name` within `namespace`.
 *
 * Deterministic and pure: identical inputs always produce an identical UUID. The version nibble is
 * forced to 5 and the variant bits to RFC 4122, so the result is a well-formed v5 UUID.
 */
export function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = uuidToBytes(namespace);
  const hash = createHash('sha1')
    .update(namespaceBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = hash.subarray(0, 16);
  // Set the version (high nibble of byte 6) to 5, and the variant (high bits of byte 8) to 10x.
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}
