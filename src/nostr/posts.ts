import type { NostrClient } from './types';

export interface NostrPostPreview {
    id: string;
    pubkey: string;
    createdAt: number;
    content: string;
}

export interface FetchLatestPostsByPubkeyResult {
    posts: NostrPostPreview[];
    nextUntil?: number;
    hasMore: boolean;
}

function parsePostContent(content: string): string {
    return content.replace(/\s+/g, ' ').trim();
}

export async function fetchLatestPostsByPubkey(input: {
    pubkey: string;
    client: NostrClient;
    limit?: number;
    until?: number;
}): Promise<FetchLatestPostsByPubkeyResult> {
    const limit = Math.max(1, input.limit ?? 20);

    await input.client.connect();
    const events = await input.client.fetchEvents({
        authors: [input.pubkey],
        kinds: [1],
        limit,
        until: input.until,
    });

    const posts = events
        .filter((event) => event.kind === 1 && event.pubkey === input.pubkey)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit)
        .map((event) => ({
            id: event.id,
            pubkey: event.pubkey,
            createdAt: event.created_at,
            content: parsePostContent(event.content),
        }));

    if (posts.length === 0) {
        return {
            posts,
            hasMore: false,
        };
    }

    const minCreatedAt = posts.reduce((min, post) => Math.min(min, post.createdAt), posts[0].createdAt);
    return {
        posts,
        nextUntil: minCreatedAt - 1,
        hasMore: posts.length === limit,
    };
}
