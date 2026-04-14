import { useMemo, useState, type ReactNode } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

type RichToken =
    | { kind: 'text'; value: string }
    | { kind: 'url'; value: string }
    | { kind: 'hashtag'; value: string };

export interface RichMediaAttachment {
    url: string;
    kind: 'image' | 'video';
    alt?: string;
}

interface ImetaEntry {
    mime?: string;
    alt?: string;
}

export interface RichNostrContentProps {
    content: string;
    tags?: string[][];
    onSelectHashtag?: (hashtag: string) => void;
    textClassName?: string;
    emptyFallback?: ReactNode;
}

function sanitizeUrlToken(value: string): string {
    return value.replace(/[),.!?]+$/g, '');
}

function normalizeHashtag(value: string): string {
    return value.replace(/^#+/, '').trim().toLowerCase();
}

function tokenizeContent(content: string): RichToken[] {
    const tokens: RichToken[] = [];
    const pattern = /https?:\/\/[^\s]+|#[A-Za-z0-9_]+/g;
    let lastIndex = 0;

    for (const match of content.matchAll(pattern)) {
        if (typeof match.index !== 'number') {
            continue;
        }

        if (match.index > lastIndex) {
            tokens.push({
                kind: 'text',
                value: content.slice(lastIndex, match.index),
            });
        }

        const rawToken = match[0];
        if (rawToken.startsWith('#')) {
            tokens.push({ kind: 'hashtag', value: rawToken });
        } else {
            tokens.push({ kind: 'url', value: sanitizeUrlToken(rawToken) });
        }

        lastIndex = match.index + rawToken.length;
    }

    if (lastIndex < content.length) {
        tokens.push({ kind: 'text', value: content.slice(lastIndex) });
    }

    if (tokens.length === 0) {
        return [{ kind: 'text', value: content }];
    }

    return tokens;
}

function parseImetaEntries(tags: string[][]): Record<string, ImetaEntry> {
    const byUrl: Record<string, ImetaEntry> = {};

    for (const tag of tags) {
        if (!Array.isArray(tag) || tag[0] !== 'imeta') {
            continue;
        }

        let url: string | undefined;
        let mime: string | undefined;
        let alt: string | undefined;

        for (const entry of tag.slice(1)) {
            if (typeof entry !== 'string') {
                continue;
            }

            const separator = entry.indexOf(' ');
            if (separator <= 0) {
                continue;
            }

            const key = entry.slice(0, separator).trim();
            const value = entry.slice(separator + 1).trim();
            if (!value) {
                continue;
            }

            if (key === 'url') {
                url = value;
            }

            if (key === 'm') {
                mime = value;
            }

            if (key === 'alt') {
                alt = value;
            }
        }

        if (!url) {
            continue;
        }

        byUrl[url] = {
            mime,
            alt,
        };
    }

    return byUrl;
}

function resolveMediaKind(url: string, mime: string | undefined): 'image' | 'video' | null {
    if (mime?.startsWith('image/')) {
        return 'image';
    }

    if (mime?.startsWith('video/')) {
        return 'video';
    }

    if (/\.(png|jpe?g|gif|webp|avif|svg)([?#].*)?$/i.test(url)) {
        return 'image';
    }

    if (/\.(mp4|webm|ogg|mov|m4v)([?#].*)?$/i.test(url)) {
        return 'video';
    }

    return null;
}

function extractMediaAttachments(content: string, tags: string[][]): RichMediaAttachment[] {
    const seen = new Set<string>();
    const imetaByUrl = parseImetaEntries(tags);
    const attachments: RichMediaAttachment[] = [];

    for (const token of tokenizeContent(content)) {
        if (token.kind !== 'url') {
            continue;
        }

        const url = sanitizeUrlToken(token.value);
        if (!url || seen.has(url)) {
            continue;
        }

        const imeta = imetaByUrl[url];
        const mediaKind = resolveMediaKind(url, imeta?.mime);
        if (!mediaKind) {
            continue;
        }

        seen.add(url);
        attachments.push({
            url,
            kind: mediaKind,
            alt: imeta?.alt,
        });
    }

    return attachments;
}

function renderInlineTokens(tokens: RichToken[], onSelectHashtag: ((hashtag: string) => void) | undefined): ReactNode[] {
    return tokens.map((token, index) => {
        if (token.kind === 'text') {
            return <span key={`text-${index}`}>{token.value}</span>;
        }

        if (token.kind === 'url') {
            return null;
        }

        const normalized = normalizeHashtag(token.value);
        if (!normalized || !onSelectHashtag) {
            return <span key={`hashtag-${index}`}>{token.value}</span>;
        }

        return (
            <button
                key={`hashtag-${index}`}
                type="button"
                className="nostr-rich-hashtag"
                aria-label={`Filtrar por hashtag ${normalized}`}
                onClick={() => onSelectHashtag(normalized)}
            >
                #{normalized}
            </button>
        );
    });
}

export function RichNostrContent({
    content,
    tags,
    onSelectHashtag,
    textClassName,
    emptyFallback,
}: RichNostrContentProps) {
    const normalizedContent = content.trim();
    const tokenizedContent = useMemo(() => tokenizeContent(content), [content]);
    const mediaAttachments = useMemo(() => extractMediaAttachments(content, tags ?? []), [content, tags]);
    const imageSlides = useMemo(
        () => mediaAttachments
            .filter((attachment) => attachment.kind === 'image')
            .map((attachment) => ({ src: attachment.url, alt: attachment.alt })),
        [mediaAttachments]
    );
    const [lightboxIndex, setLightboxIndex] = useState<number>(-1);
    const hasVisibleInlineToken = tokenizedContent.some((token) => token.kind !== 'url');
    const inlineNodes = useMemo(
        () => renderInlineTokens(tokenizedContent, onSelectHashtag),
        [tokenizedContent, onSelectHashtag]
    );

    const openLightbox = (imageUrl: string) => {
        const imageIndex = imageSlides.findIndex((slide) => slide.src === imageUrl);
        if (imageIndex < 0) {
            return;
        }

        setLightboxIndex(imageIndex);
    };

    const closeLightbox = () => {
        setLightboxIndex(-1);
    };
    const isLightboxOpen = lightboxIndex >= 0 && imageSlides.length > 0;
    const safeLightboxIndex = lightboxIndex < 0 ? 0 : Math.min(lightboxIndex, imageSlides.length - 1);

    return (
        <>
            {normalizedContent && hasVisibleInlineToken ? (
                <p className={textClassName || 'nostr-rich-content-text'}>
                    {inlineNodes}
                </p>
            ) : (emptyFallback || null)}

            {mediaAttachments.length > 0 ? (
                <div className="nostr-rich-media-grid">
                    {mediaAttachments.map((attachment, index) => (
                        <div key={`${attachment.kind}-${attachment.url}`} className="nostr-rich-media-item">
                            {attachment.kind === 'image' ? (
                                <button
                                    type="button"
                                    className="nostr-rich-media-trigger"
                                    aria-label={`Abrir imagen ${index + 1} de ${mediaAttachments.length}`}
                                    onClick={() => openLightbox(attachment.url)}
                                >
                                    <img
                                        src={attachment.url}
                                        alt={attachment.alt || 'Imagen adjunta'}
                                        loading="lazy"
                                        className="nostr-rich-media-image"
                                    />
                                </button>
                            ) : (
                                <video
                                    src={attachment.url}
                                    controls
                                    preload="metadata"
                                    className="nostr-rich-media-video"
                                />
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            <Lightbox
                open={isLightboxOpen}
                close={closeLightbox}
                index={safeLightboxIndex}
                slides={imageSlides}
                portal={{
                    root: typeof document === 'undefined' ? null : document.body,
                }}
                controller={{
                    closeOnBackdropClick: true,
                }}
                on={{
                    view: ({ index }) => setLightboxIndex(index),
                }}
                styles={{
                    root: {
                        zIndex: 2147483000,
                    },
                }}
            />
        </>
    );
}
