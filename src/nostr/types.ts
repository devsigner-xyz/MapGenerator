export interface NostrEvent {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
}

export interface NostrFilter {
    ids?: string[];
    authors?: string[];
    kinds?: number[];
    '#p'?: string[];
    since?: number;
    until?: number;
    limit?: number;
}

export interface NostrClient {
    connect(): Promise<void>;
    fetchLatestReplaceableEvent(pubkey: string, kind: number): Promise<NostrEvent | null>;
    fetchEvents(filter: NostrFilter): Promise<NostrEvent[]>;
}

export interface NostrProfile {
    pubkey: string;
    name?: string;
    displayName?: string;
    picture?: string;
}

export interface FollowGraphResult {
    ownerPubkey: string;
    follows: string[];
    relayHints: string[];
}
