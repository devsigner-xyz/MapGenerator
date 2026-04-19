import { cn } from '@/lib/utils';

interface OverlayUnreadIndicatorProps {
    className?: string;
    variant?: 'inline' | 'overlay';
    srLabel?: string;
}

export function OverlayUnreadIndicator({ className, variant = 'inline', srLabel }: OverlayUnreadIndicatorProps) {
    return (
        <>
            <span
                data-slot="overlay-unread-indicator"
                aria-hidden="true"
                className={cn(
                    'shrink-0 rounded-full bg-destructive',
                    variant === 'overlay'
                        ? 'absolute top-1.5 right-1.5 size-2 border-2 border-sidebar'
                        : 'mb-0.5 size-2 ring-2 ring-background/90',
                    className,
                )}
            />
            {srLabel ? <span className="sr-only">{srLabel}</span> : null}
        </>
    );
}
