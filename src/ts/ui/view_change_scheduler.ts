export interface ViewChangeScheduler {
    schedule: () => void;
    dispose: () => void;
}

export interface ViewChangeSchedulerFrameApi {
    scheduleFrame: (callback: FrameRequestCallback) => number;
    cancelFrame: (id: number) => void;
}

function defaultFrameApi(): ViewChangeSchedulerFrameApi {
    return {
        scheduleFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (id) => cancelAnimationFrame(id),
    };
}

export function createViewChangeScheduler(
    notify: () => void,
    frameApi: ViewChangeSchedulerFrameApi = defaultFrameApi(),
): ViewChangeScheduler {
    let pendingFrameId: number | null = null;

    const schedule = (): void => {
        if (pendingFrameId !== null) {
            return;
        }

        pendingFrameId = frameApi.scheduleFrame(() => {
            pendingFrameId = null;
            notify();
        });
    };

    const dispose = (): void => {
        if (pendingFrameId === null) {
            return;
        }

        frameApi.cancelFrame(pendingFrameId);
        pendingFrameId = null;
    };

    return {
        schedule,
        dispose,
    };
}
