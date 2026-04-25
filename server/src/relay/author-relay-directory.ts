import type { SimplePool } from 'nostr-tools';

import { normalizeHexPubkey } from '../nostr/nostr-validation';
import { createTTLCache } from '../cache/ttl-cache';
import { createRelayQueryExecutor, type RelayQueryExecutor } from './relay-query-executor';
import { canonicalRelaySet } from './relay-resolver';

interface NostrEventLike {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

interface RelayMetadata {
  read: string[];
  write: string[];
}

export interface AuthorRelayDirectory {
  getAuthorReadRelays(pubkey: string): Promise<string[]>;
  getAuthorWriteRelays(pubkey: string): Promise<string[]>;
}

export interface CreateAuthorRelayDirectoryOptions {
  pool: SimplePool;
  bootstrapRelays: string[];
  ttlMs?: number;
  maxEntries?: number;
  maxRelaysPerAuthor?: number;
  relayQueryExecutor?: RelayQueryExecutor;
}

export interface RelaySelectionInput {
  authors: string[];
  scopedReadRelays?: string[];
  bootstrapRelays: string[];
  authorRelayDirectory?: AuthorRelayDirectory;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;
const DEFAULT_MAX_RELAYS_PER_AUTHOR = 8;

function normalizePubkey(value: string): string {
  return normalizeHexPubkey(value) ?? value.trim().toLowerCase();
}

function isHexPubkey(value: string): boolean {
  return normalizeHexPubkey(value) !== null;
}

function byCreatedAtDesc(left: NostrEventLike, right: NostrEventLike): number {
  if (left.created_at !== right.created_at) {
    return right.created_at - left.created_at;
  }

  return left.id.localeCompare(right.id);
}

function sliceRelaySet(relays: string[], maxRelaysPerAuthor: number): string[] {
  return canonicalRelaySet(relays).slice(0, Math.max(1, maxRelaysPerAuthor));
}

function parseRelayMetadataFromKind10002(
  event: NostrEventLike | null,
  maxRelaysPerAuthor: number,
): RelayMetadata {
  if (!event || event.kind !== 10002) {
    return { read: [], write: [] };
  }

  const readRelays: string[] = [];
  const writeRelays: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string' || tag[1].length === 0) {
      continue;
    }

    const marker = typeof tag[2] === 'string' ? tag[2].toLowerCase() : '';
    if (marker === 'read') {
      readRelays.push(tag[1]);
      continue;
    }

    if (marker === 'write') {
      writeRelays.push(tag[1]);
      continue;
    }

    readRelays.push(tag[1]);
    writeRelays.push(tag[1]);
  }

  return {
    read: sliceRelaySet(readRelays, maxRelaysPerAuthor),
    write: sliceRelaySet(writeRelays, maxRelaysPerAuthor),
  };
}

function parseRelayHintsFromKind3(
  event: NostrEventLike | null,
  maxRelaysPerAuthor: number,
): RelayMetadata {
  if (!event || event.kind !== 3) {
    return { read: [], write: [] };
  }

  let hints: string[] = [];
  let writeHints: string[] = [];
  if (event.content) {
    try {
      const parsed = JSON.parse(event.content) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const [relay, value] of Object.entries(parsed)) {
          if (!value || typeof value !== 'object') {
            hints.push(relay);
            writeHints.push(relay);
            continue;
          }

          const typed = value as { read?: unknown; write?: unknown };
          if (typed.read === true || typed.write !== true) {
            hints.push(relay);
          }
          if (typed.write === true || typed.read !== true) {
            writeHints.push(relay);
          }
        }
      }
    } catch {
      hints = [];
      writeHints = [];
    }
  }

  const normalizedRead = sliceRelaySet(hints, maxRelaysPerAuthor);
  const normalizedWrite = sliceRelaySet(writeHints, maxRelaysPerAuthor);
  return {
    read: normalizedRead,
    write: normalizedWrite,
  };
}

export function createAuthorRelayDirectory(
  options: CreateAuthorRelayDirectoryOptions,
): AuthorRelayDirectory {
  const maxRelaysPerAuthor = options.maxRelaysPerAuthor ?? DEFAULT_MAX_RELAYS_PER_AUTHOR;
  const relayQueryExecutor = options.relayQueryExecutor ?? createRelayQueryExecutor({ pool: options.pool });
  const cache = createTTLCache<string, RelayMetadata>({
    ttlMs: options.ttlMs ?? DEFAULT_CACHE_TTL_MS,
    maxEntries: options.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES,
  });

  async function loadRelayMetadata(pubkey: string): Promise<RelayMetadata> {
    const normalizedPubkey = normalizePubkey(pubkey);
    if (!isHexPubkey(normalizedPubkey)) {
      return { read: [], write: [] };
    }

    const cached = cache.get(normalizedPubkey);
    if (cached) {
      return cached;
    }

    const relayListEvents = await relayQueryExecutor.query<NostrEventLike>({
      relays: options.bootstrapRelays,
      filter: {
        authors: [normalizedPubkey],
        kinds: [10002],
        limit: 1,
      },
    });
    const latestRelayList = [...relayListEvents].sort(byCreatedAtDesc)[0] ?? null;
    const relayListMetadata = parseRelayMetadataFromKind10002(latestRelayList, maxRelaysPerAuthor);

    if (relayListMetadata.read.length > 0 || relayListMetadata.write.length > 0) {
      cache.set(normalizedPubkey, relayListMetadata);
      return relayListMetadata;
    }

    const kind3Events = await relayQueryExecutor.query<NostrEventLike>({
      relays: options.bootstrapRelays,
      filter: {
        authors: [normalizedPubkey],
        kinds: [3],
        limit: 1,
      },
    });
    const latestKind3 = [...kind3Events].sort(byCreatedAtDesc)[0] ?? null;
    const fallbackMetadata = parseRelayHintsFromKind3(latestKind3, maxRelaysPerAuthor);
    cache.set(normalizedPubkey, fallbackMetadata);
    return fallbackMetadata;
  }

  return {
    async getAuthorReadRelays(pubkey: string): Promise<string[]> {
      return (await loadRelayMetadata(pubkey)).read;
    },
    async getAuthorWriteRelays(pubkey: string): Promise<string[]> {
      return (await loadRelayMetadata(pubkey)).write;
    },
  };
}

export async function selectReadRelays(input: RelaySelectionInput): Promise<string[]> {
  const scopedReadRelays = canonicalRelaySet(input.scopedReadRelays ?? []);
  const validAuthors = [...new Set(input.authors.map(normalizeHexPubkey).filter((value): value is string => value !== null))];

  if (validAuthors.length === 0 || !input.authorRelayDirectory) {
    return scopedReadRelays.length > 0 ? scopedReadRelays : canonicalRelaySet(input.bootstrapRelays);
  }

  const discoveredRelays: string[] = [];
  for (const author of validAuthors) {
    try {
      discoveredRelays.push(...await input.authorRelayDirectory.getAuthorReadRelays(author));
    } catch {
      // Discovery failures should not prevent fallback relay selection.
    }
  }

  const selectedRelays = canonicalRelaySet(scopedReadRelays, discoveredRelays);
  return selectedRelays.length > 0 ? selectedRelays : canonicalRelaySet(input.bootstrapRelays);
}
