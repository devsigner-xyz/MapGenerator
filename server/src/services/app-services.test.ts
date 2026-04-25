// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createAppServices } from './app-services';
import type { RelayQueryExecutor } from '../relay/relay-query-executor';

describe('createAppServices', () => {
  it('exposes a shared relay query executor and default app services', () => {
    const pool = { querySync: vi.fn(async () => []) } as unknown as SimplePool;

    const services = createAppServices({ pool });

    expect(services.relayQueryExecutor).toBeDefined();
    expect(services.graphService).toBeDefined();
    expect(services.contentService).toBeDefined();
    expect(services.usersService).toBeDefined();
    expect(services.notificationsService).toBeDefined();
  });

  it('injects the shared relay query executor into relay-backed app services', async () => {
    const targetPubkey = 'b'.repeat(64);
    const followPubkey = 'c'.repeat(64);
    const query = vi.fn(async () => [
      {
        id: '1'.repeat(64),
        pubkey: targetPubkey,
        created_at: 100,
        tags: [['p', followPubkey]],
        content: '',
      },
    ]);
    const relayQueryExecutor: RelayQueryExecutor = {
      query: query as RelayQueryExecutor['query'],
    };

    const services = createAppServices({
      pool: { querySync: vi.fn(async () => []) } as unknown as SimplePool,
      relayQueryExecutor,
    });

    const result = await services.graphService.getFollows({
      ownerPubkey: 'a'.repeat(64),
      pubkey: targetPubkey,
      scopedReadRelays: ['wss://relay.one'],
    });

    expect(result.follows).toEqual([followPubkey]);
    expect(query).toHaveBeenCalled();
  });
});
