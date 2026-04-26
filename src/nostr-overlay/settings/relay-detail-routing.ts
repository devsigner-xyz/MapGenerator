import { RELAY_TYPES, type RelayType } from '../../nostr/relay-settings';
import type { RelaySource } from '../components/settings-pages/types';

export interface RelayDetailRouteParams {
    relayUrl: string;
    source: RelaySource;
    relayType: RelayType;
}

const RELAY_SOURCE_SET = new Set<RelaySource>(['configured', 'suggested']);
const RELAY_TYPE_SET = new Set<RelayType>(RELAY_TYPES);

export function buildRelayDetailPath(params: RelayDetailRouteParams): string {
    const searchParams = new URLSearchParams();
    searchParams.set('url', params.relayUrl);
    searchParams.set('source', params.source);
    searchParams.set('type', params.relayType);
    return `/relays/detail?${searchParams.toString()}`;
}

export function parseRelayDetailSearch(search: string): RelayDetailRouteParams | null {
    const query = new URLSearchParams(search);
    const relayUrl = query.get('url')?.trim() ?? '';
    const source = query.get('source')?.trim() ?? '';
    const relayType = query.get('type')?.trim() ?? '';

    if (!relayUrl && !source && !relayType) {
        const legacyRelayUrl = query.get('relay')?.trim() ?? '';

        if (legacyRelayUrl) {
            return {
                relayUrl: legacyRelayUrl,
                source: 'configured',
                relayType: 'nip65Both',
            };
        }
    }

    if (!relayUrl || !RELAY_SOURCE_SET.has(source as RelaySource) || !RELAY_TYPE_SET.has(relayType as RelayType)) {
        return null;
    }

    return {
        relayUrl,
        source: source as RelaySource,
        relayType: relayType as RelayType,
    };
}
