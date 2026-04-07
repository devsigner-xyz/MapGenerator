export interface FollowerBatcher {
    add: (pubkeys: string[]) => void;
    flushNow: () => Promise<void>;
    dispose: () => void;
}

export function createFollowerBatcher(
    onFlush: (pubkeys: string[]) => Promise<void> | void,
    delayMs = 250,
): FollowerBatcher {
    const pendingPubkeys = new Set<string>();
    const safeDelayMs = Math.max(0, delayMs);
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const flushNow = async (): Promise<void> => {
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }

        if (pendingPubkeys.size === 0) {
            return;
        }

        const nextPubkeys = [...pendingPubkeys];
        pendingPubkeys.clear();
        await onFlush(nextPubkeys);
    };

    const scheduleFlush = (): void => {
        if (timeoutHandle !== null) {
            return;
        }

        timeoutHandle = setTimeout(() => {
            void flushNow();
        }, safeDelayMs);
    };

    const add = (pubkeys: string[]): void => {
        for (const pubkey of pubkeys) {
            pendingPubkeys.add(pubkey);
        }
        scheduleFlush();
    };

    const dispose = (): void => {
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }
        pendingPubkeys.clear();
    };

    return {
        add,
        flushNow,
        dispose,
    };
}
