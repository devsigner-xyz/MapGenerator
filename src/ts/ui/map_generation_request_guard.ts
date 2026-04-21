export function createLatestRequestRunner<T>(runner: (input: T) => Promise<void>): (input: T) => Promise<void> {
    interface QueuedRequest {
        input: T;
        promise: Promise<void>;
        resolve: () => void;
        reject: (error: unknown) => void;
    }

    let activeRequest: QueuedRequest | null = null;
    let pendingRequest: QueuedRequest | null = null;
    let processing = false;

    const createQueuedRequest = (input: T): QueuedRequest => {
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<void>((nextResolve, nextReject) => {
            resolve = nextResolve;
            reject = nextReject;
        });

        return {
            input,
            promise,
            resolve,
            reject,
        };
    };

    const processQueue = async (): Promise<void> => {
        if (processing) {
            return;
        }

        processing = true;
        try {
            while (activeRequest || pendingRequest) {
                if (!activeRequest) {
                    activeRequest = pendingRequest;
                    pendingRequest = null;
                }

                const currentRequest = activeRequest;
                if (!currentRequest) {
                    continue;
                }

                try {
                    await runner(currentRequest.input);
                    currentRequest.resolve();
                } catch (error) {
                    currentRequest.reject(error);
                } finally {
                    activeRequest = null;
                }
            }
        } finally {
            processing = false;
            if (pendingRequest) {
                void processQueue();
            }
        }
    };

    return (input: T): Promise<void> => {
        if (activeRequest || processing) {
            if (pendingRequest) {
                pendingRequest.input = input;
                return pendingRequest.promise;
            }

            pendingRequest = createQueuedRequest(input);
            void processQueue();
            return pendingRequest.promise;
        } else {
            activeRequest = createQueuedRequest(input);
            void processQueue();
            return activeRequest.promise;
        }
    };
}
