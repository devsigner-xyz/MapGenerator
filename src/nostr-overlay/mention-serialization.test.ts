import { nip19 } from 'nostr-tools';
import { describe, expect, test } from 'vitest';
import {
    createMentionDraft,
    insertMentionIntoText,
    invalidateMentionsForEdit,
    serializeMentionDraft,
} from './mention-serialization';

describe('mention-serialization', () => {
    test('serializes one selected mention to nprofile content and p tag', () => {
        const pubkey = 'a'.repeat(64);
        const draft = insertMentionIntoText(createMentionDraft('hola @al mundo'), {
            pubkey,
            label: 'Alice',
            replaceStart: 5,
            replaceEnd: 8,
        });

        expect(draft.text).toBe('hola @Alice mundo');

        const serialized = serializeMentionDraft(draft);

        expect(serialized.content).toBe(`hola nostr:${nip19.nprofileEncode({ pubkey })} mundo`);
        expect(serialized.tags).toEqual([['p', pubkey]]);
    });

    test('deduplicates p tags for repeated mentions to the same pubkey', () => {
        const pubkey = 'b'.repeat(64);
        const withFirstMention = insertMentionIntoText(createMentionDraft('@bo y otra vez @bo'), {
            pubkey,
            label: 'Bob',
            replaceStart: 0,
            replaceEnd: 3,
        });
        const secondMentionStart = withFirstMention.text.lastIndexOf('@bo');
        const draft = insertMentionIntoText(withFirstMention, {
            pubkey,
            label: 'Bob',
            replaceStart: secondMentionStart,
            replaceEnd: secondMentionStart + 3,
        });

        const serialized = serializeMentionDraft(draft);

        expect(serialized.content).toBe([
            `nostr:${nip19.nprofileEncode({ pubkey })}`,
            ' y otra vez ',
            `nostr:${nip19.nprofileEncode({ pubkey })}`,
        ].join(''));
        expect(serialized.tags).toEqual([['p', pubkey]]);
    });

    test('serializes two different mentions and preserves surrounding text', () => {
        const alicePubkey = 'c'.repeat(64);
        const brunoPubkey = 'd'.repeat(64);
        const withAlice = insertMentionIntoText(createMentionDraft('@al saluda a @br'), {
            pubkey: alicePubkey,
            label: 'Alice',
            replaceStart: 0,
            replaceEnd: 3,
        });
        const brunoMentionStart = withAlice.text.indexOf('@br');
        const draft = insertMentionIntoText(withAlice, {
            pubkey: brunoPubkey,
            label: 'Bruno',
            replaceStart: brunoMentionStart,
            replaceEnd: brunoMentionStart + 3,
        });

        const serialized = serializeMentionDraft(draft);

        expect(serialized.content).toBe([
            `nostr:${nip19.nprofileEncode({ pubkey: alicePubkey })}`,
            ' saluda a ',
            `nostr:${nip19.nprofileEncode({ pubkey: brunoPubkey })}`,
        ].join(''));
        expect(serialized.tags).toEqual([
            ['p', alicePubkey],
            ['p', brunoPubkey],
        ]);
    });

    test('invalidates only the mention touched by an edit and shifts later mentions', () => {
        const alicePubkey = 'e'.repeat(64);
        const brunoPubkey = 'f'.repeat(64);
        const withAlice = insertMentionIntoText(createMentionDraft('@al y @br'), {
            pubkey: alicePubkey,
            label: 'Alice',
            replaceStart: 0,
            replaceEnd: 3,
        });
        const brunoMentionStart = withAlice.text.indexOf('@br');
        const draft = insertMentionIntoText(withAlice, {
            pubkey: brunoPubkey,
            label: 'Bruno',
            replaceStart: brunoMentionStart,
            replaceEnd: brunoMentionStart + 3,
        });

        const editedDraft = invalidateMentionsForEdit(draft, '@Alicia y @Bruno ');
        const serialized = serializeMentionDraft(editedDraft);

        expect(editedDraft.mentions).toHaveLength(1);
        expect(editedDraft.mentions[0]).toMatchObject({ pubkey: brunoPubkey, label: 'Bruno' });
        expect(serialized.content).toBe(`@Alicia y nostr:${nip19.nprofileEncode({ pubkey: brunoPubkey })}`);
        expect(serialized.tags).toEqual([['p', brunoPubkey]]);
    });

    test('keeps plain text untouched when there are no valid mentions', () => {
        const draft = createMentionDraft('solo texto plano');

        expect(serializeMentionDraft(draft)).toEqual({
            content: 'solo texto plano',
            tags: [],
        });
    });

    test('adds a trailing space after inserting a mention', () => {
        const pubkey = '1'.repeat(64);

        const draft = insertMentionIntoText(createMentionDraft('hola @ca'), {
            pubkey,
            label: 'Carla',
            replaceStart: 5,
            replaceEnd: 8,
        });

        expect(draft.text).toBe('hola @Carla ');
        expect(draft.mentions).toEqual([
            {
                pubkey,
                label: 'Carla',
                start: 5,
                end: 11,
            },
        ]);
    });
});
