import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';
import { Button } from '@/components/ui/button';

interface FollowingFeedSurfaceProps extends FollowingFeedViewProps {
    activeHashtag?: string;
    onClearHashtag?: () => void;
}

export function FollowingFeedSurface({ activeHashtag, onClearHashtag, ...feedProps }: FollowingFeedSurfaceProps) {
    const headerSubtitle = activeHashtag
        ? `Filtrando por #${activeHashtag}`
        : 'Timeline en tiempo real de personas que sigues';

    const headerActions = activeHashtag && onClearHashtag
        ? (
            <Button type="button" variant="outline" size="sm" onClick={onClearHashtag}>
                Quitar filtro
            </Button>
        )
        : undefined;

    return (
        <section className="nostr-routed-surface nostr-following-feed-surface" aria-label="Agora">
            <div className="nostr-routed-surface-content">
                <FollowingFeedContent
                    {...feedProps}
                    activeHashtag={activeHashtag}
                    className="nostr-following-feed-surface-content nostr-following-feed-page nostr-routed-surface-panel nostr-page-layout"
                    headerSubtitle={headerSubtitle}
                    headerActions={headerActions}
                />
            </div>
        </section>
    );
}
