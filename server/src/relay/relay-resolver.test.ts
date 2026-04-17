// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { shouldUseFallbackRelays } from './relay-fallback';
import { relaySetKey, resolveRelaySets } from './relay-resolver';

describe('resolveRelaySets', () => {
  it('uses scoped/user relays as primary when available', () => {
    const resolved = resolveRelaySets({
      scopedRelays: ['wss://scoped.one/', 'wss://scoped.two'],
      userRelays: ['wss://user.one/', 'wss://scoped.one'],
      bootstrapRelays: ['wss://bootstrap.one', 'wss://bootstrap.two/'],
    });

    expect(resolved.primary).toEqual([
      'wss://scoped.one',
      'wss://scoped.two',
      'wss://user.one',
    ]);
    expect(resolved.fallback).toEqual([
      'wss://bootstrap.one',
      'wss://bootstrap.two',
    ]);
  });

  it('does not mix bootstrap relays into primary when scoped/user relays exist', () => {
    const resolved = resolveRelaySets({
      scopedRelays: ['wss://scoped.one'],
      userRelays: ['wss://user.one'],
      bootstrapRelays: ['wss://bootstrap.one'],
    });

    expect(resolved.primary).toEqual(['wss://scoped.one', 'wss://user.one']);
    expect(resolved.primary).not.toContain('wss://bootstrap.one');
    expect(resolved.fallback).toEqual(['wss://bootstrap.one']);
  });

  it('returns stable relaySetKey for dedupe/cache usage', () => {
    const keyA = relaySetKey(['wss://b.example/', 'wss://a.example', 'wss://b.example']);
    const keyB = relaySetKey(['wss://a.example/', 'wss://b.example']);

    expect(keyA).toBe(keyB);
    expect(keyA).toBe('wss://a.example|wss://b.example');
  });
});

describe('shouldUseFallbackRelays', () => {
  it('uses fallback when primary set is empty', () => {
    expect(shouldUseFallbackRelays({ primaryRelays: [] })).toBe(true);
  });

  it('uses fallback for recoverable failures', () => {
    const recoverableError = {
      code: 'ETIMEDOUT',
    };

    expect(
      shouldUseFallbackRelays({
        primaryRelays: ['wss://scoped.one'],
        error: recoverableError,
      }),
    ).toBe(true);
  });

  it('does not use fallback for non-recoverable failures when primary exists', () => {
    const nonRecoverableError = {
      code: 'EACCES',
    };

    expect(
      shouldUseFallbackRelays({
        primaryRelays: ['wss://scoped.one'],
        error: nonRecoverableError,
      }),
    ).toBe(false);
  });
});
