import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface OverlayPageHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    indicator?: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function OverlayPageHeader({
    title,
    description,
    indicator,
    actions,
    className,
}: OverlayPageHeaderProps) {
    return (
        <header data-slot="overlay-page-header" className={cn('nostr-page-header gap-3', className)}>
            <div className="flex items-start justify-between gap-3">
                <div data-slot="overlay-page-header-copy" className="min-w-0 flex-1 space-y-1">
                    <div className="inline-flex min-w-0 items-center gap-1.5">
                        <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">{title}</h4>
                        {indicator}
                    </div>
                    {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
                </div>

                {actions ? (
                    <div data-slot="overlay-page-header-actions" className="flex shrink-0 items-center gap-2">
                        {actions}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
