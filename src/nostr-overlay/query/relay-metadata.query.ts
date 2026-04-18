import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { RelayInformationDocument, RelayInfoState } from '../components/settings-pages/types';
import { createMetadataQueryOptions } from './options';

interface UseRelayMetadataByUrlQueryInput {
    relayUrls: string[];
    enabled: boolean;
}

interface RelayQueryEntry {
    relayUrl: string;
    queryRelayUrl: string;
}

function relayHttpEndpoint(relayUrl: string): string | null {
    try {
        const parsed = new URL(relayUrl);
        if (parsed.protocol === 'wss:') {
            parsed.protocol = 'https:';
        } else if (parsed.protocol === 'ws:') {
            parsed.protocol = 'http:';
        } else {
            return null;
        }

        return parsed.toString();
    } catch {
        return null;
    }
}

async function fetchRelayInformation(relayUrl: string): Promise<RelayInformationDocument> {
    const endpoint = relayHttpEndpoint(relayUrl);
    if (!endpoint) {
        throw new Error('invalid relay endpoint');
    }

    const fetchFn = typeof window !== 'undefined' ? window.fetch?.bind(window) : globalThis.fetch;
    if (typeof fetchFn !== 'function') {
        throw new Error('fetch unavailable');
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
        controller.abort();
    }, 3500);

    try {
        const response = await fetchFn(endpoint, {
            method: 'GET',
            headers: {
                Accept: 'application/nostr+json, application/json;q=0.9',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }

        const payload = await response.json() as unknown;
        if (!payload || typeof payload !== 'object') {
            throw new Error('invalid payload');
        }

        return payload as RelayInformationDocument;
    } finally {
        window.clearTimeout(timeout);
    }
}

function normalizeRelayUrls(relayUrls: string[]): string[] {
    return [...new Set(relayUrls.map((relayUrl) => relayUrl.trim()).filter((relayUrl) => relayUrl.length > 0))].sort((left, right) => left.localeCompare(right));
}

function toDeterministicRelayKey(relayUrl: string): string {
    const trimmed = relayUrl.trim();
    if (!trimmed) {
        return trimmed;
    }

    try {
        const parsed = new URL(trimmed);
        const serialized = parsed.toString();
        if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
            return serialized.replace(/\/$/, '');
        }

        return serialized;
    } catch {
        return trimmed;
    }
}

function buildRelayQueryEntries(relayUrls: string[]): RelayQueryEntry[] {
    const dedupedByKey = new Map<string, RelayQueryEntry>();
    for (const relayUrl of normalizeRelayUrls(relayUrls)) {
        const queryRelayUrl = toDeterministicRelayKey(relayUrl);
        if (!queryRelayUrl) {
            continue;
        }

        if (dedupedByKey.has(queryRelayUrl)) {
            continue;
        }

        dedupedByKey.set(queryRelayUrl, {
            relayUrl: queryRelayUrl,
            queryRelayUrl,
        });
    }

    return [...dedupedByKey.values()].sort((left, right) => left.relayUrl.localeCompare(right.relayUrl));
}

export function useRelayMetadataByUrlQuery(input: UseRelayMetadataByUrlQueryInput): Record<string, RelayInfoState> {
    const relayEntries = useMemo(() => buildRelayQueryEntries(input.relayUrls), [input.relayUrls]);
    const fetchAvailable = typeof window !== 'undefined' && typeof window.fetch === 'function';

    return useQueries({
        queries: relayEntries.map((entry) => createMetadataQueryOptions({
            queryKey: ['nostr-overlay', 'social', 'relay-metadata', { relayUrl: entry.queryRelayUrl }] as const,
            queryFn: () => fetchRelayInformation(entry.queryRelayUrl),
            enabled: input.enabled && fetchAvailable,
        })),
        combine: (queryResults) => {
            const typedQueryResults = queryResults as Array<{
                error?: unknown;
                data?: RelayInformationDocument;
                isPending?: boolean;
                isFetching?: boolean;
            }>;
            const relayInfoByUrl: Record<string, RelayInfoState> = {};
            for (const [index, entry] of relayEntries.entries()) {
                const query = typedQueryResults[index];
                if (!query) {
                    continue;
                }

                if (query.error) {
                    relayInfoByUrl[entry.relayUrl] = { status: 'error' };
                    continue;
                }

                if (query.data) {
                    relayInfoByUrl[entry.relayUrl] = {
                        status: 'ready',
                        data: query.data,
                    };
                    continue;
                }

                if (query.isPending || query.isFetching) {
                    relayInfoByUrl[entry.relayUrl] = { status: 'loading' };
                }
            }

            return relayInfoByUrl;
        },
    });
}
