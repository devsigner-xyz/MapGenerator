class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    Object.defineProperty(window, 'ResizeObserver', {
        value: ResizeObserverMock,
        writable: true,
        configurable: true,
    });
}

if (typeof globalThis !== 'undefined' && !('ResizeObserver' in globalThis)) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
        value: ResizeObserverMock,
        writable: true,
        configurable: true,
    });
}
