import { getTagValues, type SocialNotificationItem, type SocialNotificationKind } from '../../nostr/social-notifications-service';

export type NotificationCategory = 'reply' | 'mention' | 'repost' | 'reaction' | 'zap';

export interface NotificationActor {
    key: string;
    pubkey: string;
}

export interface NotificationInboxItem {
    groupKey: string;
    category: NotificationCategory;
    actors: NotificationActor[];
    primaryActorPubkey: string;
    targetEventId?: string;
    targetPubkey?: string;
    reactionContent?: string;
    zapTotalSats?: number;
    itemCount: number;
    occurredAt: number;
    sourceKinds: SocialNotificationKind[];
    sourceItems: SocialNotificationItem[];
}

export interface NotificationInboxSections {
    newItems: NotificationInboxItem[];
    recentItems: NotificationInboxItem[];
}

interface BuildNotificationInboxSectionsInput {
    newNotifications: SocialNotificationItem[];
    recentNotifications: SocialNotificationItem[];
}

function sortItems(items: SocialNotificationItem[]): SocialNotificationItem[] {
    return [...items].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return right.createdAt - left.createdAt;
        }

        return left.id.localeCompare(right.id);
    });
}

function isMarkedReply(item: SocialNotificationItem): boolean {
    return item.rawEvent.tags.some((tag) => Array.isArray(tag) && tag[0] === 'e' && typeof tag[1] === 'string' && tag[3] === 'reply');
}

function classifyNotificationCategory(item: SocialNotificationItem): NotificationCategory {
    if (item.kind === 9735) {
        return 'zap';
    }

    if (item.kind === 7) {
        return 'reaction';
    }

    if (item.kind === 6 || item.kind === 16) {
        return 'repost';
    }

    return isMarkedReply(item) ? 'reply' : 'mention';
}

function normalizeReactionContent(item: SocialNotificationItem): string {
    const normalized = item.content.trim();
    return normalized || '+';
}

function parseZapMsatsFromDescription(item: SocialNotificationItem): number {
    const descriptionValues = getTagValues(item.rawEvent.tags, 'description');
    const latest = descriptionValues[descriptionValues.length - 1];
    if (!latest) {
        return 0;
    }

    try {
        const parsed = JSON.parse(latest) as { tags?: unknown };
        if (!Array.isArray(parsed.tags)) {
            return 0;
        }

        for (const rawTag of parsed.tags) {
            if (!Array.isArray(rawTag) || rawTag[0] !== 'amount' || typeof rawTag[1] !== 'string') {
                continue;
            }

            const msats = Number(rawTag[1]);
            if (Number.isFinite(msats) && msats > 0) {
                return msats;
            }
        }
    } catch {
        return 0;
    }

    return 0;
}

function parseBolt11Sats(invoice: string): number {
    const normalized = invoice.trim().toLowerCase();
    const match = normalized.match(/^lnbc(\d+)([munp]?)1/);
    if (!match) {
        return 0;
    }

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
        return 0;
    }

    const unit = match[2] || '';
    const sats = (() => {
        if (unit === 'm') {
            return amount * 100_000;
        }

        if (unit === 'u') {
            return amount * 100;
        }

        if (unit === 'n') {
            return amount / 10;
        }

        if (unit === 'p') {
            return amount / 10_000;
        }

        return amount * 100_000_000;
    })();

    return Number.isFinite(sats) && sats > 0 ? Math.floor(sats) : 0;
}

function parseZapSats(item: SocialNotificationItem): number {
    const fromDescription = parseZapMsatsFromDescription(item);
    if (fromDescription > 0) {
        return Math.max(0, Math.floor(fromDescription / 1000));
    }

    const amountValues = getTagValues(item.rawEvent.tags, 'amount');
    const latestAmount = amountValues[amountValues.length - 1];
    const amountMsats = latestAmount ? Number(latestAmount) : 0;
    if (Number.isFinite(amountMsats) && amountMsats > 0) {
        return Math.max(0, Math.floor(amountMsats / 1000));
    }

    const bolt11Values = getTagValues(item.rawEvent.tags, 'bolt11');
    const latestBolt11 = bolt11Values[bolt11Values.length - 1];
    if (latestBolt11) {
        return parseBolt11Sats(latestBolt11);
    }

    return 0;
}

function resolveTargetKey(item: SocialNotificationItem): string {
    return item.targetEventId || item.targetAddress || item.id;
}

function buildGroupKey(item: SocialNotificationItem, category: NotificationCategory): string {
    if (category === 'reaction') {
        return `${category}:${resolveTargetKey(item)}:${normalizeReactionContent(item)}`;
    }

    if (category === 'zap') {
        return `${category}:${resolveTargetKey(item)}`;
    }

    if (category === 'repost') {
        return `${category}:${resolveTargetKey(item)}:${item.kind}`;
    }

    return `${category}:${item.id}`;
}

function toNotificationActor(item: SocialNotificationItem): NotificationActor {
    return {
        key: item.actorPubkey || `anonymous:${item.id}`,
        pubkey: item.actorPubkey,
    };
}

function appendActor(actors: NotificationActor[], nextActor: NotificationActor): NotificationActor[] {
    if (actors.some((actor) => actor.key === nextActor.key)) {
        return actors;
    }

    return [...actors, nextActor];
}

function appendKind(kinds: SocialNotificationKind[], kind: SocialNotificationKind): SocialNotificationKind[] {
    return kinds.includes(kind) ? kinds : [...kinds, kind];
}

function buildGroupedItems(items: SocialNotificationItem[]): NotificationInboxItem[] {
    const grouped = new Map<string, NotificationInboxItem>();

    for (const item of sortItems(items)) {
        const category = classifyNotificationCategory(item);
        const groupKey = buildGroupKey(item, category);
        const existing = grouped.get(groupKey);

        if (!existing) {
            grouped.set(groupKey, {
                groupKey,
                category,
                actors: [toNotificationActor(item)],
                primaryActorPubkey: item.actorPubkey,
                ...(item.targetEventId ? { targetEventId: item.targetEventId } : {}),
                ...(item.targetPubkey ? { targetPubkey: item.targetPubkey } : {}),
                ...(category === 'reaction' ? { reactionContent: normalizeReactionContent(item) } : {}),
                ...(category === 'zap' ? { zapTotalSats: parseZapSats(item) } : {}),
                itemCount: 1,
                occurredAt: item.createdAt,
                sourceKinds: [item.kind],
                sourceItems: [item],
            });
            continue;
        }

        existing.actors = appendActor(existing.actors, toNotificationActor(item));
        existing.itemCount += 1;
        existing.occurredAt = Math.max(existing.occurredAt, item.createdAt);
        existing.sourceKinds = appendKind(existing.sourceKinds, item.kind);
        existing.sourceItems = sortItems([...existing.sourceItems, item]);
        if (category === 'zap') {
            existing.zapTotalSats = (existing.zapTotalSats ?? 0) + parseZapSats(item);
        }
    }

    return [...grouped.values()].sort((left, right) => {
        if (left.occurredAt !== right.occurredAt) {
            return right.occurredAt - left.occurredAt;
        }

        return left.groupKey.localeCompare(right.groupKey);
    });
}

export function buildNotificationInboxSections(input: BuildNotificationInboxSectionsInput): NotificationInboxSections {
    const newItems = buildGroupedItems(input.newNotifications);
    const newSourceIds = new Set(input.newNotifications.map((item) => item.id));
    const recentItems = buildGroupedItems(input.recentNotifications.filter((item) => !newSourceIds.has(item.id)));

    return {
        newItems,
        recentItems,
    };
}
