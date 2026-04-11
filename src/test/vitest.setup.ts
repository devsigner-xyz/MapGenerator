class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    (window as any).ResizeObserver = ResizeObserverMock;
}

if (typeof globalThis !== 'undefined' && !('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = ResizeObserverMock;
}
