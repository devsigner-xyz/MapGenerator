// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertHexPubkey,
  normalizeHexEventId,
  normalizeHexPubkey,
  sanitizeNostrTagValue,
} from './nostr-validation';

describe('nostr validation helpers', () => {
  it('normalizes lowercase and uppercase 64-character hex pubkeys', () => {
    const lowercase = 'a'.repeat(64);
    const uppercase = 'ABCDEF'.repeat(10) + 'ABCD';

    expect(normalizeHexPubkey(` ${lowercase} `)).toBe(lowercase);
    expect(normalizeHexPubkey(uppercase)).toBe(uppercase.toLowerCase());
  });

  it('rejects pubkeys with invalid length or non-hex characters', () => {
    expect(normalizeHexPubkey('a'.repeat(63))).toBeNull();
    expect(normalizeHexPubkey('a'.repeat(65))).toBeNull();
    expect(normalizeHexPubkey(`${'a'.repeat(63)}z`)).toBeNull();
  });

  it('throws a field-specific error when asserting an invalid pubkey', () => {
    expect(() => assertHexPubkey('not-a-pubkey', 'ownerPubkey')).toThrow('ownerPubkey');
  });

  it('normalizes event ids with the same strict hex rules', () => {
    const eventId = 'ABCDEF'.repeat(10) + 'ABCD';

    expect(normalizeHexEventId(` ${eventId} `)).toBe(eventId.toLowerCase());
    expect(normalizeHexEventId('g'.repeat(64))).toBeNull();
  });

  it('sanitizes Nostr tag values without accepting non-string values', () => {
    expect(sanitizeNostrTagValue('  p  ')).toBe('p');
    expect(sanitizeNostrTagValue('')).toBeNull();
    expect(sanitizeNostrTagValue('   ')).toBeNull();
    expect(sanitizeNostrTagValue(1)).toBeNull();
    expect(sanitizeNostrTagValue(null)).toBeNull();
  });
});
