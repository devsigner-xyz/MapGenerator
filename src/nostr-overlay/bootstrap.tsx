import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { App } from './App';
import { createWindowMapBridge } from './map-bridge';
import './styles.css';

let overlayRoot: Root | null = null;

export function mountNostrOverlay(win: Window = window): void {
    const container = win.document.getElementById('nostr-overlay-root');
    if (!container) {
        return;
    }

    const bridge = createWindowMapBridge(win);
    if (!overlayRoot) {
        overlayRoot = createRoot(container);
    }

    overlayRoot.render(
        <StrictMode>
            <HashRouter>
                <App mapBridge={bridge} />
            </HashRouter>
        </StrictMode>
    );
}
