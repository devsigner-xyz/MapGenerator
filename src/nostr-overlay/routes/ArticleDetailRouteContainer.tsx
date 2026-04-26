import type { NostrEvent } from '../../nostr/types';
import type { SocialFeedItem, SocialFeedService } from '../../nostr/social-feed-service';
import { useArticleDetailQuery } from '../query/following-feed.query';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { OverlaySurface } from '../components/OverlaySurface';
import { ArticleMarkdownContent } from '../components/ArticleMarkdownContent';
import { useParams } from 'react-router';

export interface ArticleDetailRouteContainerProps {
    items: SocialFeedItem[];
    service: SocialFeedService;
    enabled: boolean;
    onBack: () => void;
}

export function ArticleDetailRouteContainer({ items, service, enabled, onBack }: ArticleDetailRouteContainerProps) {
    const { t } = useI18n();
    const params = useParams();
    const eventId = params.eventId ?? null;
    const cachedEvent = items.find((item) => item.id === eventId)?.rawEvent;
    const query = useArticleDetailQuery({ eventId, service, enabled: enabled && !cachedEvent });
    const event: NostrEvent | null = cachedEvent ?? query.data ?? null;

    return (
        <OverlaySurface ariaLabel={t('articles.title')} contentClassName="overflow-y-auto">
            <div className="flex flex-col gap-4 pb-10" data-testid="article-detail-content">
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={onBack}>
                    {t('articles.back')}
                </Button>
                {query.isLoading && !event ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner />
                        <span>{t('articles.loadingTitle')}</span>
                    </div>
                ) : null}
                {query.error ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : null}
                {!query.isLoading && !event ? <p>{t('articles.markdownUnavailable')}</p> : null}
                {event ? <ArticleMarkdownContent event={event} /> : null}
                <Button type="button" variant="outline" size="sm" className="mt-4 self-center" onClick={onBack}>
                    {t('articles.back')}
                </Button>
            </div>
        </OverlaySurface>
    );
}
