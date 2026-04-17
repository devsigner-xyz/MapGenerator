// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createIdentityService } from './identity.service';

const OWNER_PUBKEY = 'a'.repeat(64);
const PROFILE_PUBKEY = 'b'.repeat(64);

describe('identity service nip05 verification', () => {
  it('reuses cached results for repeated nip05 checks', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    const service = createIdentityService({ fetchImpl: fetchMock });

    const first = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });
    const second = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(first.results[0]?.status).toBe('verified');
    expect(second.results[0]?.status).toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns error status when nip05 request times out', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          },
          { once: true },
        );
      });
    });

    const service = createIdentityService({
      fetchImpl: fetchMock,
      defaultNip05TimeoutMs: 10,
    });

    const result = await service.verifyNip05Batch({
      ownerPubkey: OWNER_PUBKEY,
      timeoutMs: 10,
      checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
    });

    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.error).toBeDefined();
  });

  it('dedupes concurrent nip05 checks by identity key', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return new Response(JSON.stringify({ names: { alice: OWNER_PUBKEY } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    });

    const service = createIdentityService({ fetchImpl: fetchMock });

    const [first, second] = await Promise.all([
      service.verifyNip05Batch({
        ownerPubkey: OWNER_PUBKEY,
        checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
      }),
      service.verifyNip05Batch({
        ownerPubkey: OWNER_PUBKEY,
        checks: [{ pubkey: OWNER_PUBKEY, nip05: 'alice@example.com' }],
      }),
    ]);

    expect(first.results[0]?.status).toBe('verified');
    expect(second.results[0]?.status).toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('identity service profile resolve', () => {
  it('uses profile cache for repeated resolve requests', async () => {
    const querySync = vi.fn(async () => [
      {
        id: 'c'.repeat(64),
        pubkey: PROFILE_PUBKEY,
        created_at: 1_719_000_100,
        content: JSON.stringify({
          name: 'alice',
          nip05: 'alice@example.com',
        }),
      },
    ]);
    const pool = { querySync } as unknown as SimplePool;

    const service = createIdentityService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
      profileCacheTtlMs: 60_000,
    });

    const first = await service.resolveProfiles({
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    });
    const second = await service.resolveProfiles({
      ownerPubkey: OWNER_PUBKEY,
      pubkeys: [PROFILE_PUBKEY],
    });

    expect(first.profiles[PROFILE_PUBKEY]).toMatchObject({
      pubkey: PROFILE_PUBKEY,
      name: 'alice',
      nip05: 'alice@example.com',
    });
    expect(second.profiles[PROFILE_PUBKEY]?.pubkey).toBe(PROFILE_PUBKEY);
    expect(querySync).toHaveBeenCalledTimes(1);
  });
});
