import type { NostrEvent } from './types';

export const LONG_FORM_ARTICLE_KIND = 30023;

export interface ArticleMetadata {
    title?: string;
    summary?: string;
    image?: string;
    publishedAt?: number;
    topics: string[];
}

function firstTagValue(tags: string[][], name: string): string | undefined {
    const value = tags.find((tag) => tag[0] === name)?.[1]?.trim();
    return value ? value : undefined;
}

export function isLongFormArticleEvent(event: NostrEvent): boolean {
    return event.kind === LONG_FORM_ARTICLE_KIND;
}

export function parseArticleMetadata(event: NostrEvent): ArticleMetadata {
    const title = firstTagValue(event.tags, 'title');
    const summary = firstTagValue(event.tags, 'summary');
    const image = firstTagValue(event.tags, 'image');
    const publishedAtValue = firstTagValue(event.tags, 'published_at');
    const parsedPublishedAt = publishedAtValue ? Number.parseInt(publishedAtValue, 10) : undefined;
    const topics = event.tags
        .filter((tag) => tag[0] === 't')
        .map((tag) => tag[1]?.trim().toLowerCase() ?? '')
        .filter((topic, index, allTopics) => topic.length > 0 && allTopics.indexOf(topic) === index);

    const metadata: ArticleMetadata = { topics };
    if (title) {
        metadata.title = title;
    }
    if (summary) {
        metadata.summary = summary;
    }
    if (image) {
        metadata.image = image;
    }
    if (typeof parsedPublishedAt === 'number' && Number.isFinite(parsedPublishedAt)) {
        metadata.publishedAt = parsedPublishedAt;
    }

    return metadata;
}
