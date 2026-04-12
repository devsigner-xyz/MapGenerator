import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';

export function FollowingFeedSurface(feedProps: FollowingFeedViewProps) {
    return (
        <section className="nostr-routed-surface nostr-following-feed-surface" aria-label="Agora">
            <div className="nostr-routed-surface-content">
                <FollowingFeedContent
                    {...feedProps}
                    className="nostr-following-feed-surface-content nostr-following-feed-page nostr-routed-surface-panel nostr-page-layout"
                    headerSubtitle="Timeline en tiempo real de personas que sigues"
                />
            </div>
        </section>
    );
}
