import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { OverlaySurface } from './OverlaySurface';

interface FollowingFeedSurfaceProps extends FollowingFeedViewProps {
    agoraFeedLayout?: AgoraFeedLayout;
    onAgoraFeedLayoutChange?: (layout: AgoraFeedLayout) => void;
    activeHashtag?: string;
    onClearHashtag?: () => void;
}

export function FollowingFeedSurface({ agoraFeedLayout = 'list', onAgoraFeedLayoutChange, activeHashtag, onClearHashtag, ...feedProps }: FollowingFeedSurfaceProps) {
    const { t } = useI18n();
    const headerSubtitle = activeHashtag
        ? t('feed.subtitle.hashtag', { hashtag: activeHashtag })
        : t('feed.subtitle.following');
    const showFeedHeaderActions = !feedProps.activeThread;
    const pendingItemsLabel = feedProps.pendingNewCount === 1
        ? t('feed.newPosts.one')
        : t('feed.newPosts.many', { count: feedProps.pendingNewCount });

    const headerActions = showFeedHeaderActions
        ? (
            <>
                {onAgoraFeedLayoutChange ? (
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={agoraFeedLayout}
                        onValueChange={(value) => {
                            if (value === 'list' || value === 'masonry') {
                                onAgoraFeedLayoutChange(value);
                            }
                        }}
                    >
                        <ToggleGroupItem value="list" aria-label={t('feed.viewList')}>
                            {t('settings.ui.agoraLayoutList')}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="masonry" aria-label={t('feed.viewMasonry')}>
                            Masonry
                        </ToggleGroupItem>
                    </ToggleGroup>
                ) : null}
                {feedProps.hasPendingNewItems ? (
                    <Button type="button" size="sm" onClick={feedProps.onApplyPendingNewItems}>
                        {pendingItemsLabel}
                    </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={() => {
                    void feedProps.onRefreshFeed();
                }} disabled={feedProps.isRefreshingFeed}>
                    {feedProps.isRefreshingFeed ? (
                        <>
                            <Spinner className="size-4" />
                            {t('feed.refreshing')}
                        </>
                    ) : t('feed.refresh')}
                </Button>
                {activeHashtag && onClearHashtag ? (
                    <Button type="button" variant="outline" size="sm" onClick={onClearHashtag}>
                        {t('feed.clearFilter')}
                    </Button>
                ) : null}
            </>
        )
        : undefined;

    return (
        <OverlaySurface ariaLabel="Agora" className="nostr-following-feed-surface" contentClassName="nostr-following-feed-routed-surface-content gap-0">
            <div>
                <FollowingFeedContent
                    {...feedProps}
                    agoraFeedLayout={agoraFeedLayout}
                    {...(activeHashtag ? { activeHashtag } : {})}
                    className="nostr-following-feed-surface-content nostr-following-feed-page nostr-routed-surface-panel nostr-page-layout"
                    headerSubtitle={headerSubtitle}
                    {...(headerActions ? { headerActions } : {})}
                />
            </div>
        </OverlaySurface>
    );
}
