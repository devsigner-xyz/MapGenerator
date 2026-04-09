interface OverlayBootstrapModule {
    mountNostrOverlay: () => void;
}

interface DeferredBootstrapScheduler {
    requestIdleCallback?: (callback: IdleRequestCallback) => number;
    setTimeout: (handler: () => void, timeout?: number) => number;
}

export interface MountNostrOverlayDeferredOptions {
    scheduler?: DeferredBootstrapScheduler;
    importOverlayBootstrap?: () => Promise<OverlayBootstrapModule>;
}

const defaultScheduler: DeferredBootstrapScheduler = {
    requestIdleCallback:
        typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
            ? (callback: IdleRequestCallback) => window.requestIdleCallback(callback)
            : undefined,
    setTimeout: (handler: () => void, timeout = 0) => window.setTimeout(handler, timeout),
};

const defaultImportOverlayBootstrap = (): Promise<OverlayBootstrapModule> => import('./bootstrap');

export function mountNostrOverlayDeferred(options: MountNostrOverlayDeferredOptions = {}): void {
    const scheduler = options.scheduler ?? defaultScheduler;
    const importOverlayBootstrap = options.importOverlayBootstrap ?? defaultImportOverlayBootstrap;

    const mountOverlay = (): void => {
        void importOverlayBootstrap().then((mod) => {
            mod.mountNostrOverlay();
        });
    };

    if (typeof scheduler.requestIdleCallback === 'function') {
        scheduler.requestIdleCallback(() => mountOverlay());
        return;
    }

    scheduler.setTimeout(() => mountOverlay(), 0);
}
