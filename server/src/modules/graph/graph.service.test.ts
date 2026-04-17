// @vitest-environment node

import type { SimplePool } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';

import { createGraphService } from './graph.service';
import type { RelayGateway } from '../../relay/relay-gateway.types';
import type { GraphFollowersQuery, GraphFollowersResponseDto, GraphFollowsQuery, GraphFollowsResponseDto } from './graph.schemas';

const OWNER_PUBKEY = 'a'.repeat(64);
const TARGET_PUBKEY = 'b'.repeat(64);
const FOLLOW_ONE = 'c'.repeat(64);
const FOLLOW_TWO = 'd'.repeat(64);

describe('graph service', () => {
  it('returns follows and relay hints from latest kind3 event', async () => {
    const querySync = vi.fn(async () => [
      {
        id: '1'.repeat(64),
        pubkey: TARGET_PUBKEY,
        created_at: 100,
        tags: [
          ['p', FOLLOW_ONE, 'wss://relay.one'],
          ['p', FOLLOW_TWO],
          ['p', FOLLOW_ONE],
        ],
        content: '',
      },
    ]);
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getFollows({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
    });

    expect(result).toEqual({
      pubkey: TARGET_PUBKEY,
      follows: [FOLLOW_ONE, FOLLOW_TWO],
      relayHints: ['wss://relay.one'],
    });
    expect(querySync).toHaveBeenCalledTimes(1);
  });

  it('returns followers from tag scan and candidate author scan', async () => {
    const followerOne = 'e'.repeat(64);
    const followerTwo = 'f'.repeat(64);
    const querySync = vi
      .fn()
      .mockImplementationOnce(async () => [
        {
          id: '2'.repeat(64),
          pubkey: followerOne,
          created_at: 120,
          tags: [['p', TARGET_PUBKEY]],
          content: '',
        },
      ])
      .mockImplementationOnce(async () => [
        {
          id: '3'.repeat(64),
          pubkey: followerTwo,
          created_at: 115,
          tags: [['p', TARGET_PUBKEY]],
          content: '',
        },
      ]);
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: `${followerOne},${followerTwo}`,
    });

    expect(result.pubkey).toBe(TARGET_PUBKEY);
    expect(result.followers).toEqual([followerOne, followerTwo]);
    expect(result.complete).toBe(true);
    expect(querySync).toHaveBeenCalledTimes(2);
  });

  it('returns partial followers instead of throwing when relay queries fail', async () => {
    const followerOne = 'e'.repeat(64);
    const querySync = vi
      .fn()
      .mockImplementationOnce(async () => [
        {
          id: '2'.repeat(64),
          pubkey: followerOne,
          created_at: 120,
          tags: [['p', TARGET_PUBKEY]],
          content: '',
        },
      ])
      .mockImplementationOnce(async () => {
        throw new Error('relay timeout');
      });
    const pool = { querySync } as unknown as SimplePool;

    const service = createGraphService({
      pool,
      bootstrapRelays: ['wss://relay.damus.io'],
    });

    const result = await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: `${followerOne}`,
    });

    expect(result.pubkey).toBe(TARGET_PUBKEY);
    expect(result.followers).toEqual([followerOne]);
    expect(result.complete).toBe(false);
  });

  it('returns empty incomplete followers when gateway query fails', async () => {
    const followsGateway: RelayGateway<GraphFollowsQuery, GraphFollowsResponseDto> = {
      query: vi.fn(async () => ({
        pubkey: TARGET_PUBKEY,
        follows: [],
        relayHints: [],
      })),
      clearCache: vi.fn(),
    };
    const followersGateway: RelayGateway<GraphFollowersQuery, GraphFollowersResponseDto> = {
      query: vi.fn(async () => {
        throw new Error('gateway timeout');
      }),
      clearCache: vi.fn(),
    };

    const service = createGraphService({
      followsGateway,
      followersGateway,
    });

    const result = await service.getFollowers({
      ownerPubkey: OWNER_PUBKEY,
      pubkey: TARGET_PUBKEY,
      candidateAuthors: 'c'.repeat(64),
    });

    expect(result).toEqual({
      pubkey: TARGET_PUBKEY,
      followers: [],
      complete: false,
    });
  });
});
