import type { ReactNode } from 'react';

export interface OverlayAppShellProps {
    sidebar: ReactNode;
    main: ReactNode;
    mapControls: ReactNode;
    dialogs: ReactNode;
}

export function OverlayAppShell({ sidebar, mapControls, main, dialogs }: OverlayAppShellProps) {
    return (
        <div className="nostr-overlay-shell">
            {sidebar}
            {mapControls}
            {main}
            {dialogs}
        </div>
    );
}
