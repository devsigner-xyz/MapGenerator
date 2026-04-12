import { Button } from '@/components/ui/button';
import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';

interface FollowingFeedSurfaceProps extends FollowingFeedViewProps {
    onClose: () => void;
}

export function FollowingFeedSurface({ onClose, ...feedProps }: FollowingFeedSurfaceProps) {
    return (
        <section className="nostr-following-feed-surface" aria-label="Feed siguiendo">
            <FollowingFeedContent
                {...feedProps}
                className="nostr-following-feed-dialog nostr-following-feed-surface-content"
                headerActions={(
                    <Button type="button" variant="outline" size="sm" onClick={onClose}>
                        Volver al mapa
                    </Button>
                )}
            />
        </section>
    );
}
