import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface FollowingFeedSurfaceProps extends FollowingFeedViewProps {
    agoraFeedLayout?: AgoraFeedLayout;
    onAgoraFeedLayoutChange?: (layout: AgoraFeedLayout) => void;
    activeHashtag?: string;
    onClearHashtag?: () => void;
}

export function FollowingFeedSurface({ agoraFeedLayout = 'list', onAgoraFeedLayoutChange, activeHashtag, onClearHashtag, ...feedProps }: FollowingFeedSurfaceProps) {
    const headerSubtitle = activeHashtag
        ? `Filtrando por #${activeHashtag}`
        : 'Timeline en tiempo real de personas que sigues';
    const showFeedHeaderActions = !feedProps.activeThread;
    const pendingItemsLabel = feedProps.pendingNewCount === 1
        ? 'Ver 1 publicacion nueva'
        : `Ver ${feedProps.pendingNewCount} publicaciones nuevas`;

    const headerActions = showFeedHeaderActions
        ? (
            <>
                {onAgoraFeedLayoutChange ? (
                    <ToggleGroup
                        type="single"
                        required
                        variant="outline"
                        size="sm"
                        value={agoraFeedLayout}
                        onValueChange={(value) => {
                            if (value === 'list' || value === 'masonry') {
                                onAgoraFeedLayoutChange(value);
                            }
                        }}
                    >
                        <ToggleGroupItem value="list" aria-label="Ver Agora en lista">
                            Lista
                        </ToggleGroupItem>
                        <ToggleGroupItem value="masonry" aria-label="Ver Agora en masonry">
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
                            Actualizando
                        </>
                    ) : 'Actualizar'}
                </Button>
                {activeHashtag && onClearHashtag ? (
                    <Button type="button" variant="outline" size="sm" onClick={onClearHashtag}>
                        Quitar filtro
                    </Button>
                ) : null}
            </>
        )
        : undefined;

    return (
        <section className="nostr-routed-surface nostr-following-feed-surface" aria-label="Agora">
            <div className="nostr-routed-surface-content nostr-following-feed-routed-surface-content">
                <FollowingFeedContent
                    {...feedProps}
                    agoraFeedLayout={agoraFeedLayout}
                    {...(activeHashtag ? { activeHashtag } : {})}
                    className="nostr-following-feed-surface-content nostr-following-feed-page nostr-following-feed-page-edge-to-edge nostr-routed-surface-panel nostr-page-layout"
                    headerSubtitle={headerSubtitle}
                    {...(headerActions ? { headerActions } : {})}
                />
            </div>
        </section>
    );
}
