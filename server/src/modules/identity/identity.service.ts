import { SimplePool } from 'nostr-tools';

import { shouldUseFallbackRelays } from '../../relay/relay-fallback';
import { resolveRelaySets } from '../../relay/relay-resolver';
import type {
  IdentityProfileDto,
  Nip05BatchCheckDto,
  Nip05BatchResultDto,
  Nip05VerifyBatchRequestDto,
  Nip05VerifyBatchResponseDto,
  ProfilesResolveRequestDto,
  ProfilesResolveResponseDto,
} from './identity.schemas';

type NostrEventLike = {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
};

type Nip05JsonResponse = {
  names?: Record<string, string>;
};

type MetadataContent = {
  name?: unknown;
  display_name?: unknown;
  about?: unknown;
  nip05?: unknown;
  picture?: unknown;
  banner?: unknown;
  lud16?: unknown;
};

interface ParsedNip05Identifier {
  name: string;
  domain: string;
  normalized: string;
  display: string;
}

interface Nip05CacheEntry {
  result: Nip05BatchResultDto;
  expiresAtMs: number;
}

interface ProfileCacheEntry {
  profile: IdentityProfileDto | null;
  expiresAtMs: number;
}

const DEFAULT_BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const LOWER_HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const METADATA_KIND = 0;
const DEFAULT_NIP05_TIMEOUT_MS = 3_500;
const NIP05_SUCCESS_TTL_MS = 15 * 60_000;
const NIP05_ERROR_TTL_MS = 3 * 60_000;
const PROFILE_CACHE_TTL_MS = 5 * 60_000;
const PROFILE_NAME_MAX_LENGTH = 128;
const PROFILE_DISPLAY_NAME_MAX_LENGTH = 128;
const PROFILE_ABOUT_MAX_LENGTH = 2_048;
const PROFILE_NIP05_MAX_LENGTH = 320;
const PROFILE_IMAGE_URL_MAX_LENGTH = 2_048;
const PROFILE_LUD16_MAX_LENGTH = 320;

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const normalizeNip05 = (value: string): string => value.trim().toLowerCase();

const isPubkey = (value: string): boolean => LOWER_HEX_64_PATTERN.test(value);

const resolveTimeoutMs = (timeoutMs?: number): number => {
  if (!Number.isFinite(timeoutMs)) {
    return DEFAULT_NIP05_TIMEOUT_MS;
  }

  return Math.max(250, Math.round(timeoutMs as number));
};

const parseNip05Identifier = (value: string | undefined): ParsedNip05Identifier | null => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return null;
  }

  const pieces = raw.split('@');
  if (pieces.length !== 2) {
    return null;
  }

  const rawName = pieces[0]?.trim();
  const rawDomain = pieces[1]?.trim().toLowerCase();
  if (!rawName || !rawDomain) {
    return null;
  }

  if (!/^[a-z0-9._-]+$/i.test(rawName)) {
    return null;
  }

  if (!/^[a-z0-9.-]+$/i.test(rawDomain) || !rawDomain.includes('.')) {
    return null;
  }

  const name = rawName.toLowerCase();
  const normalized = `${name}@${rawDomain}`;

  return {
    name,
    domain: rawDomain,
    normalized,
    display: name === '_' ? rawDomain : normalized,
  };
};

const lookupNameIgnoreCase = (names: Record<string, string>, expectedName: string): string | undefined => {
  const expected = expectedName.toLowerCase();
  for (const [key, value] of Object.entries(names)) {
    if (key.toLowerCase() === expected) {
      return value;
    }
  }

  return undefined;
};

const parseNip05JsonResponse = (value: unknown): Nip05JsonResponse => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Nip05JsonResponse;
};

const toStringOrUndefined = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const parseProfileContent = (content: string): MetadataContent | null => {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as MetadataContent;
  } catch {
    return null;
  }
};

const toProfileDto = (event: NostrEventLike): IdentityProfileDto | null => {
  const content = parseProfileContent(event.content);
  if (!content) {
    return null;
  }

  return {
    pubkey: event.pubkey,
    createdAt: event.created_at,
    name: toStringOrUndefined(content.name, PROFILE_NAME_MAX_LENGTH),
    displayName: toStringOrUndefined(content.display_name, PROFILE_DISPLAY_NAME_MAX_LENGTH),
    about: toStringOrUndefined(content.about, PROFILE_ABOUT_MAX_LENGTH),
    nip05: toStringOrUndefined(content.nip05, PROFILE_NIP05_MAX_LENGTH),
    picture: toStringOrUndefined(content.picture, PROFILE_IMAGE_URL_MAX_LENGTH),
    banner: toStringOrUndefined(content.banner, PROFILE_IMAGE_URL_MAX_LENGTH),
    lud16: toStringOrUndefined(content.lud16, PROFILE_LUD16_MAX_LENGTH),
  };
};

export interface IdentityServiceOptions {
  pool?: SimplePool;
  bootstrapRelays?: string[];
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  nip05SuccessTtlMs?: number;
  nip05ErrorTtlMs?: number;
  profileCacheTtlMs?: number;
  defaultNip05TimeoutMs?: number;
}

export interface IdentityService {
  verifyNip05Batch(
    input: Nip05VerifyBatchRequestDto,
  ): Promise<Nip05VerifyBatchResponseDto>;
  resolveProfiles(
    input: ProfilesResolveRequestDto,
  ): Promise<ProfilesResolveResponseDto>;
}

class GatewayIdentityService implements IdentityService {
  private readonly nip05SuccessCache = new Map<string, Nip05CacheEntry>();

  private readonly nip05ErrorCache = new Map<string, Nip05CacheEntry>();

  private readonly nip05Inflight = new Map<string, Promise<Nip05BatchResultDto>>();

  private readonly profileCache = new Map<string, ProfileCacheEntry>();

  private readonly profileBatchInflight = new Map<string, Promise<Record<string, IdentityProfileDto | null>>>();

  constructor(
    private readonly options: Required<
      Pick<IdentityServiceOptions, 'fetchImpl' | 'nowMs' | 'nip05SuccessTtlMs' | 'nip05ErrorTtlMs' | 'profileCacheTtlMs' | 'defaultNip05TimeoutMs'>
      > & {
        pool: SimplePool;
        bootstrapRelays: string[];
      },
  ) {}

  async verifyNip05Batch(
    input: Nip05VerifyBatchRequestDto,
  ): Promise<Nip05VerifyBatchResponseDto> {
    const timeoutMs = resolveTimeoutMs(input.timeoutMs ?? this.options.defaultNip05TimeoutMs);
    const results = await Promise.all(input.checks.map((check) => this.verifySingleNip05(check, timeoutMs)));
    return { results };
  }

  async resolveProfiles(
    input: ProfilesResolveRequestDto,
  ): Promise<ProfilesResolveResponseDto> {
    const normalizedPubkeys = [...new Set(input.pubkeys.map(normalizePubkey).filter(isPubkey))];
    if (normalizedPubkeys.length === 0) {
      return { profiles: {} };
    }

    const profiles: Record<string, IdentityProfileDto> = {};
    const missingPubkeys: string[] = [];

    for (const pubkey of normalizedPubkeys) {
      const cached = this.getProfileFromCache(pubkey);
      if (cached === undefined) {
        missingPubkeys.push(pubkey);
        continue;
      }

      profiles[pubkey] = cached ?? {
        pubkey,
        createdAt: 0,
      };
    }

    if (missingPubkeys.length > 0) {
      const loaded = await this.loadProfilesBatch(missingPubkeys);
      for (const pubkey of missingPubkeys) {
        const profile = loaded[pubkey];
        profiles[pubkey] = profile ?? {
          pubkey,
          createdAt: 0,
        };
      }
    }

    return { profiles };
  }

  private getNip05CacheEntry(cache: Map<string, Nip05CacheEntry>, key: string): Nip05BatchResultDto | undefined {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAtMs <= this.options.nowMs()) {
      cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  private setNip05CacheEntry(
    cache: Map<string, Nip05CacheEntry>,
    key: string,
    result: Nip05BatchResultDto,
    ttlMs: number,
  ): void {
    cache.set(key, {
      result,
      expiresAtMs: this.options.nowMs() + Math.max(0, ttlMs),
    });
  }

  private async verifySingleNip05(
    input: Nip05BatchCheckDto,
    timeoutMs: number,
  ): Promise<Nip05BatchResultDto> {
    const pubkey = normalizePubkey(input.pubkey);
    const parsed = parseNip05Identifier(input.nip05);

    if (!parsed) {
      return {
        pubkey,
        nip05: normalizeNip05(input.nip05),
        status: 'unverified',
        identifier: normalizeNip05(input.nip05),
        checkedAt: this.options.nowMs(),
      };
    }

    const cacheKey = `${pubkey}::${parsed.normalized}`;
    const cachedSuccess = this.getNip05CacheEntry(this.nip05SuccessCache, cacheKey);
    if (cachedSuccess) {
      return cachedSuccess;
    }

    const cachedError = this.getNip05CacheEntry(this.nip05ErrorCache, cacheKey);
    if (cachedError) {
      return cachedError;
    }

    const inflight = this.nip05Inflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const expectedPubkey = pubkey;
    const promise = (async (): Promise<Nip05BatchResultDto> => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.name)}`;
        const response = await this.options.fetchImpl(url, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const parsedBody = parseNip05JsonResponse(await response.json());
        const names = parsedBody.names;
        if (!names || typeof names !== 'object') {
          const result: Nip05BatchResultDto = {
            pubkey,
            nip05: parsed.normalized,
            status: 'unverified',
            identifier: parsed.normalized,
            displayIdentifier: parsed.display,
            checkedAt: this.options.nowMs(),
          };
          this.setNip05CacheEntry(this.nip05SuccessCache, cacheKey, result, this.options.nip05SuccessTtlMs);
          return result;
        }

        const resolvedPubkeyRaw = lookupNameIgnoreCase(names, parsed.name);
        if (!resolvedPubkeyRaw) {
          const result: Nip05BatchResultDto = {
            pubkey,
            nip05: parsed.normalized,
            status: 'unverified',
            identifier: parsed.normalized,
            displayIdentifier: parsed.display,
            checkedAt: this.options.nowMs(),
          };
          this.setNip05CacheEntry(this.nip05SuccessCache, cacheKey, result, this.options.nip05SuccessTtlMs);
          return result;
        }

        const resolvedPubkey = normalizePubkey(resolvedPubkeyRaw);
        const result: Nip05BatchResultDto = {
          pubkey,
          nip05: parsed.normalized,
          status: resolvedPubkey === expectedPubkey ? 'verified' : 'unverified',
          identifier: parsed.normalized,
          displayIdentifier: parsed.display,
          resolvedPubkey,
          checkedAt: this.options.nowMs(),
        };
        this.setNip05CacheEntry(this.nip05SuccessCache, cacheKey, result, this.options.nip05SuccessTtlMs);
        return result;
      } catch (error) {
        const result: Nip05BatchResultDto = {
          pubkey,
          nip05: parsed.normalized,
          status: 'error',
          identifier: parsed.normalized,
          displayIdentifier: parsed.display,
          error: error instanceof Error ? error.message : 'NIP-05 request failed',
          checkedAt: this.options.nowMs(),
        };
        this.setNip05CacheEntry(this.nip05ErrorCache, cacheKey, result, this.options.nip05ErrorTtlMs);
        return result;
      } finally {
        clearTimeout(timer);
        this.nip05Inflight.delete(cacheKey);
      }
    })();

    this.nip05Inflight.set(cacheKey, promise);
    return promise;
  }

  private getProfileFromCache(pubkey: string): IdentityProfileDto | null | undefined {
    const entry = this.profileCache.get(pubkey);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAtMs <= this.options.nowMs()) {
      this.profileCache.delete(pubkey);
      return undefined;
    }

    return entry.profile;
  }

  private setProfileInCache(pubkey: string, profile: IdentityProfileDto | null): void {
    this.profileCache.set(pubkey, {
      profile,
      expiresAtMs: this.options.nowMs() + this.options.profileCacheTtlMs,
    });
  }

  private async loadProfilesBatch(pubkeys: string[]): Promise<Record<string, IdentityProfileDto | null>> {
    const batchKey = [...pubkeys].sort().join(',');
    const inflight = this.profileBatchInflight.get(batchKey);
    if (inflight) {
      return inflight;
    }

    const promise = (async (): Promise<Record<string, IdentityProfileDto | null>> => {
      const result: Record<string, IdentityProfileDto | null> = Object.fromEntries(
        pubkeys.map((pubkey) => [pubkey, null]),
      ) as Record<string, IdentityProfileDto | null>;

      const relaySets = resolveRelaySets({
        scopedRelays: [],
        userRelays: [],
        bootstrapRelays: this.options.bootstrapRelays,
      });

      const queryOnRelays = async (relays: string[]): Promise<NostrEventLike[]> => {
        if (relays.length === 0) {
          return [];
        }

        return this.options.pool.querySync(relays, {
          authors: pubkeys,
          kinds: [METADATA_KIND],
          limit: Math.max(pubkeys.length * 2, pubkeys.length + 1),
        }) as Promise<NostrEventLike[]>;
      };

      const events = await (async () => {
        if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary })) {
          return queryOnRelays(relaySets.fallback);
        }

        try {
          return await queryOnRelays(relaySets.primary);
        } catch (error) {
          if (shouldUseFallbackRelays({ primaryRelays: relaySets.primary, error })) {
            return queryOnRelays(relaySets.fallback);
          }

          throw error;
        }
      })();

      const latestByPubkey = new Map<string, NostrEventLike>();
      for (const event of events) {
        if (!isPubkey(event.pubkey)) {
          continue;
        }

        const existing = latestByPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          latestByPubkey.set(event.pubkey, event);
        }
      }

      for (const pubkey of pubkeys) {
        const event = latestByPubkey.get(pubkey);
        const profile = event ? toProfileDto(event) : null;
        result[pubkey] = profile;
        this.setProfileInCache(pubkey, profile);
      }

      return result;
    })().finally(() => {
      this.profileBatchInflight.delete(batchKey);
    });

    this.profileBatchInflight.set(batchKey, promise);
    return promise;
  }
}

export const createIdentityService = (options: IdentityServiceOptions = {}): IdentityService => {
  return new GatewayIdentityService({
    pool: options.pool ?? new SimplePool(),
    bootstrapRelays: options.bootstrapRelays ?? DEFAULT_BOOTSTRAP_RELAYS,
    fetchImpl: options.fetchImpl ?? fetch,
    nowMs: options.nowMs ?? Date.now,
    nip05SuccessTtlMs: options.nip05SuccessTtlMs ?? NIP05_SUCCESS_TTL_MS,
    nip05ErrorTtlMs: options.nip05ErrorTtlMs ?? NIP05_ERROR_TTL_MS,
    profileCacheTtlMs: options.profileCacheTtlMs ?? PROFILE_CACHE_TTL_MS,
    defaultNip05TimeoutMs: options.defaultNip05TimeoutMs ?? DEFAULT_NIP05_TIMEOUT_MS,
  });
};
