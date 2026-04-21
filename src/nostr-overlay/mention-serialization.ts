import { nip19 } from 'nostr-tools';

export interface MentionEntity {
    pubkey: string;
    label: string;
    start: number;
    end: number;
}

export interface MentionDraft {
    text: string;
    mentions: MentionEntity[];
}

export interface SerializedMentionDraft {
    content: string;
    tags: string[][];
}

function mentionText(label: string): string {
    return `@${label}`;
}

function sortMentions(mentions: MentionEntity[]): MentionEntity[] {
    return [...mentions].sort((left, right) => left.start - right.start);
}

function shiftMention(mention: MentionEntity, offset: number): MentionEntity {
    return {
        ...mention,
        start: mention.start + offset,
        end: mention.end + offset,
    };
}

function sharedPrefixLength(left: string, right: string): number {
    const limit = Math.min(left.length, right.length);
    let index = 0;
    while (index < limit && left[index] === right[index]) {
        index += 1;
    }
    return index;
}

function sharedSuffixLength(left: string, right: string, prefixLength: number): number {
    const leftRemaining = left.length - prefixLength;
    const rightRemaining = right.length - prefixLength;
    const limit = Math.min(leftRemaining, rightRemaining);
    let index = 0;
    while (index < limit && left[left.length - 1 - index] === right[right.length - 1 - index]) {
        index += 1;
    }
    return index;
}

function isMentionStillValid(draft: MentionDraft, mention: MentionEntity): boolean {
    if (mention.start < 0 || mention.end > draft.text.length || mention.start >= mention.end) {
        return false;
    }

    return draft.text.slice(mention.start, mention.end) === mentionText(mention.label);
}

export function createMentionDraft(text = ''): MentionDraft {
    return {
        text,
        mentions: [],
    };
}

export function invalidateMentionsForEdit(previous: MentionDraft, nextText: string): MentionDraft {
    if (previous.text === nextText) {
        return previous;
    }

    const prefixLength = sharedPrefixLength(previous.text, nextText);
    const suffixLength = sharedSuffixLength(previous.text, nextText, prefixLength);
    const previousChangeEnd = previous.text.length - suffixLength;
    const delta = nextText.length - previous.text.length;

    return {
        text: nextText,
        mentions: previous.mentions.flatMap((mention) => {
            if (mention.end <= prefixLength) {
                return [mention];
            }

            if (mention.start >= previousChangeEnd) {
                return [shiftMention(mention, delta)];
            }

            return [];
        }),
    };
}

export function insertMentionIntoText(
    draft: MentionDraft,
    input: { pubkey: string; label: string; replaceStart: number; replaceEnd: number },
): MentionDraft {
    const normalizedStart = Math.max(0, Math.min(input.replaceStart, draft.text.length));
    const normalizedEnd = Math.max(normalizedStart, Math.min(input.replaceEnd, draft.text.length));
    const insertedMentionText = mentionText(input.label);
    const suffix = draft.text.slice(normalizedEnd);
    const needsTrailingSpace = suffix.length === 0 || !/^\s/.test(suffix);
    const replacement = needsTrailingSpace ? `${insertedMentionText} ` : insertedMentionText;
    const nextText = `${draft.text.slice(0, normalizedStart)}${replacement}${draft.text.slice(normalizedEnd)}`;
    const delta = replacement.length - (normalizedEnd - normalizedStart);
    const nextMention: MentionEntity = {
        pubkey: input.pubkey,
        label: input.label,
        start: normalizedStart,
        end: normalizedStart + insertedMentionText.length,
    };

    const shiftedMentions = draft.mentions.flatMap((mention) => {
        if (mention.end <= normalizedStart) {
            return [mention];
        }

        if (mention.start >= normalizedEnd) {
            return [shiftMention(mention, delta)];
        }

        return [];
    });

    return {
        text: nextText,
        mentions: sortMentions([...shiftedMentions, nextMention]),
    };
}

export function serializeMentionDraft(draft: MentionDraft): SerializedMentionDraft {
    const validMentions = sortMentions(draft.mentions).filter((mention) => isMentionStillValid(draft, mention));
    if (validMentions.length === 0) {
        return {
            content: draft.text,
            tags: [],
        };
    }

    let cursor = 0;
    let content = '';
    const seenPubkeys = new Set<string>();
    const tags: string[][] = [];

    for (const mention of validMentions) {
        if (mention.start < cursor) {
            continue;
        }

        content += draft.text.slice(cursor, mention.start);
        content += `nostr:${nip19.nprofileEncode({ pubkey: mention.pubkey })}`;
        cursor = mention.end;

        if (!seenPubkeys.has(mention.pubkey)) {
            seenPubkeys.add(mention.pubkey);
            tags.push(['p', mention.pubkey]);
        }
    }

    content += draft.text.slice(cursor);

    return {
        content: content.trimEnd(),
        tags,
    };
}
