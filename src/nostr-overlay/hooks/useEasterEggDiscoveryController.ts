import { useEffect, useRef, useState } from 'react';
import {
    loadEasterEggProgress,
    markEasterEggDiscovered,
    type EasterEggProgressState,
} from '../../nostr/easter-egg-progress';
import type { EasterEggBuildingClickPayload, MapBridge } from '../map-bridge';

export interface EasterEggDialogState extends EasterEggBuildingClickPayload {
    nonce: number;
}

interface UseEasterEggDiscoveryControllerInput {
    mapBridge: MapBridge | null;
    ownerPubkey?: string;
}

interface EasterEggDiscoveryController {
    easterEggProgress: EasterEggProgressState;
    activeEasterEgg: EasterEggDialogState | null;
    easterEggCelebrationNonce: number;
    closeActiveEasterEgg: () => void;
    resetEasterEggProgress: () => void;
}

export function useEasterEggDiscoveryController({
    mapBridge,
    ownerPubkey,
}: UseEasterEggDiscoveryControllerInput): EasterEggDiscoveryController {
    const [easterEggProgress, setEasterEggProgress] = useState<EasterEggProgressState>(() => loadEasterEggProgress());
    const [activeEasterEgg, setActiveEasterEgg] = useState<EasterEggDialogState | null>(null);
    const [easterEggCelebrationNonce, setEasterEggCelebrationNonce] = useState(0);
    const easterEggNonceRef = useRef(0);
    const easterEggProgressRef = useRef(easterEggProgress);

    useEffect(() => {
        easterEggProgressRef.current = easterEggProgress;
    }, [easterEggProgress]);

    useEffect(() => {
        const nextProgress = loadEasterEggProgress(ownerPubkey ? { ownerPubkey } : undefined);
        easterEggProgressRef.current = nextProgress;
        setEasterEggProgress(nextProgress);
    }, [ownerPubkey]);

    useEffect(() => {
        if (!mapBridge?.onEasterEggBuildingClick) {
            return;
        }

        return mapBridge.onEasterEggBuildingClick((payload) => {
            const currentProgress = easterEggProgressRef.current;
            const wasAlreadyDiscovered = currentProgress.discoveredIds.includes(payload.easterEggId);
            const nextProgress = markEasterEggDiscovered({
                easterEggId: payload.easterEggId,
                currentState: currentProgress,
                ...(ownerPubkey ? { ownerPubkey } : {}),
            });

            easterEggProgressRef.current = nextProgress;
            if (!wasAlreadyDiscovered) {
                setEasterEggCelebrationNonce((currentNonce) => currentNonce + 1);
            }

            setEasterEggProgress(nextProgress);
            easterEggNonceRef.current += 1;
            setActiveEasterEgg({
                ...payload,
                nonce: easterEggNonceRef.current,
            });
        });
    }, [mapBridge, ownerPubkey]);

    const closeActiveEasterEgg = (): void => {
        setActiveEasterEgg(null);
    };

    const resetEasterEggProgress = (): void => {
        const nextProgress = { discoveredIds: [] };
        easterEggProgressRef.current = nextProgress;
        setEasterEggProgress(nextProgress);
        setActiveEasterEgg(null);
    };

    return {
        easterEggProgress,
        activeEasterEgg,
        easterEggCelebrationNonce,
        closeActiveEasterEgg,
        resetEasterEggProgress,
    };
}
