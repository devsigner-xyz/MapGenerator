import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { createWindowMapBridge } from './map-bridge';
import { getNostrOverlayQueryClient } from './query/query-client';
import './styles.css';

let overlayRoot: Root | null = null;

export function mountNostrOverlay(win: Window = window): void {
    const container = win.document.getElementById('nostr-overlay-root');
    if (!container) {
        return;
    }

    const bridge = createWindowMapBridge(win);
    const queryClient = getNostrOverlayQueryClient();
    if (!overlayRoot) {
        overlayRoot = createRoot(container);
    }

    overlayRoot.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <HashRouter>
                    <App mapBridge={bridge} />
                </HashRouter>
            </QueryClientProvider>
        </StrictMode>
    );
}
