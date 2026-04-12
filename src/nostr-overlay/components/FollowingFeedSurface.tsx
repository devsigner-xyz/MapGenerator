import { Button } from '@/components/ui/button';
import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';

interface FollowingFeedSurfaceProps extends FollowingFeedViewProps {
    onClose: () => void;
}

export function FollowingFeedSurface({ onClose, ...feedProps }: FollowingFeedSurfaceProps) {
    return (
        <section className="nostr-following-feed-surface" aria-label="Agora">
            <FollowingFeedContent
                {...feedProps}
                className="nostr-following-feed-surface-content"
                headerKicker="Nostr social"
                headerSubtitle="Timeline en tiempo real de personas que sigues"
                headerActions={(
                    <Button type="button" variant="outline" size="sm" onClick={onClose}>
                        Volver al mapa
                    </Button>
                )}
            />
        </section>
    );
}
