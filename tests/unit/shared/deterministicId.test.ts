import { describe, it, expect } from 'vitest';
import { uuidV5 } from '../../../src/shared/uuid/deterministic.js';

/**
 * The projection's idempotency rests on deterministic identity: identical inputs MUST always
 * produce the same well-formed v5 UUID, and distinct inputs must (overwhelmingly) differ.
 */
describe('uuidV5 (deterministic, name-based UUID)', () => {
  const NS = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';
  const UUID_V5_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

  it('is deterministic: same namespace + name → identical UUID', () => {
    expect(uuidV5(NS, 'tenant:subject:2025-26')).toBe(uuidV5(NS, 'tenant:subject:2025-26'));
  });

  it('produces a well-formed v5 UUID (version nibble 5, RFC 4122 variant)', () => {
    expect(uuidV5(NS, 'anything')).toMatch(UUID_V5_RE);
  });

  it('different names within a namespace produce different UUIDs', () => {
    expect(uuidV5(NS, 'a')).not.toBe(uuidV5(NS, 'b'));
  });

  it('the same name under different namespaces produces different UUIDs', () => {
    const other = '11111111-2222-3333-4444-555555555555';
    expect(uuidV5(NS, 'same')).not.toBe(uuidV5(other, 'same'));
  });

  it('matches the RFC 4122 §4.3 reference vector (DNS namespace, "www.example.com")', () => {
    // Known published vector for uuid5(NAMESPACE_DNS, 'www.example.com').
    const NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    expect(uuidV5(NAMESPACE_DNS, 'www.example.com')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('rejects a malformed namespace UUID', () => {
    expect(() => uuidV5('not-a-uuid', 'x')).toThrow(/Invalid namespace/u);
  });
});
