import Vector from '../vector';

export interface MiddlePanState {
    active: boolean;
    lastScreenPoint: Vector | null;
}

export function createMiddlePanState(startScreenPoint: Vector): MiddlePanState {
    return {
        active: true,
        lastScreenPoint: startScreenPoint.clone(),
    };
}

export function stopMiddlePanState(): MiddlePanState {
    return {
        active: false,
        lastScreenPoint: null,
    };
}

export function updateMiddlePanState(state: MiddlePanState, nextScreenPoint: Vector): { state: MiddlePanState; deltaScreen: Vector | null } {
    if (!state.active || !state.lastScreenPoint) {
        return {
            state,
            deltaScreen: null,
        };
    }

    const deltaScreen = new Vector(
        nextScreenPoint.x - state.lastScreenPoint.x,
        nextScreenPoint.y - state.lastScreenPoint.y,
    );

    return {
        state: {
            active: true,
            lastScreenPoint: nextScreenPoint.clone(),
        },
        deltaScreen,
    };
}
