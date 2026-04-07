import { useEffect, useMemo, useState } from 'react';
import { assignPubkeysToBuildings, type AssignmentResult } from '../../nostr/domain/assignment';
import { buildOccupancyState } from '../../nostr/domain/occupancy';
import { fetchFollowsByNpub } from '../../nostr/follows';
import { NdkClient } from '../../nostr/ndk-client';
import { fetchProfiles } from '../../nostr/profiles';
import type { NostrClient, NostrProfile } from '../../nostr/types';
import type { MapBridge } from '../map-bridge';

type OverlayStatus = 'idle' | 'loading' | 'success' | 'error';

interface OverlayData {
    ownerPubkey?: string;
    follows: string[];
    profiles: Record<string, NostrProfile>;
    assignments: AssignmentResult;
    buildingsCount: number;
    selectedPubkey?: string;
}

interface OverlayState {
    status: OverlayStatus;
    error?: string;
    data: OverlayData;
}

export interface NostrOverlayServices {
    createClient?: () => NostrClient;
    fetchFollowsByNpubFn?: typeof fetchFollowsByNpub;
    fetchProfilesFn?: typeof fetchProfiles;
}

interface UseNostrOverlayOptions {
    mapBridge: MapBridge | null;
    services?: NostrOverlayServices;
}

function createInitialData(): OverlayData {
    return {
        follows: [],
        profiles: {},
        assignments: {
            assignments: [],
            byBuildingIndex: {},
            pubkeyToBuildingIndex: {},
            unassignedPubkeys: [],
        },
        buildingsCount: 0,
    };
}

function dedupe(values: string[]): string[] {
    return [...new Set(values)];
}

export function useNostrOverlay({ mapBridge, services }: UseNostrOverlayOptions) {
    const createClient = services?.createClient || (() => new NdkClient());
    const fetchFollowsByNpubFn = services?.fetchFollowsByNpubFn || fetchFollowsByNpub;
    const fetchProfilesFn = services?.fetchProfilesFn || fetchProfiles;

    const [state, setState] = useState<OverlayState>({
        status: 'idle',
        data: createInitialData(),
    });

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onMapGenerated(() => {
            setState((current) => {
                if (current.status !== 'success' || !current.data.ownerPubkey) {
                    return current;
                }

                const buildings = mapBridge.listBuildings();
                const assignments = assignPubkeysToBuildings({
                    pubkeys: current.data.follows,
                    buildingsCount: buildings.length,
                    seed: current.data.ownerPubkey,
                });

                const occupancy = buildOccupancyState({
                    buildingsCount: buildings.length,
                    assignments: assignments.assignments,
                    selectedPubkey: current.data.selectedPubkey,
                });

                mapBridge.applyOccupancy({
                    byBuildingIndex: occupancy.byBuildingIndex,
                    selectedBuildingIndex: occupancy.selectedBuildingIndex,
                });

                if (occupancy.selectedBuildingIndex !== undefined) {
                    mapBridge.focusBuilding(occupancy.selectedBuildingIndex);
                }

                return {
                    ...current,
                    data: {
                        ...current.data,
                        buildingsCount: buildings.length,
                        assignments,
                    },
                };
            });
        });
    }, [mapBridge]);

    const submitNpub = async (npub: string): Promise<void> => {
        if (!mapBridge) {
            setState({
                status: 'error',
                error: 'No se pudo conectar la capa Nostr con el mapa',
                data: createInitialData(),
            });
            return;
        }

        setState((current) => ({ ...current, status: 'loading', error: undefined }));

        try {
            const client = createClient();
            const graph = await fetchFollowsByNpubFn(npub, client);
            const follows = dedupe(graph.follows);
            const profiles = await fetchProfilesFn(follows, client);

            await mapBridge.ensureGenerated();
            const buildings = mapBridge.listBuildings();
            const assignments = assignPubkeysToBuildings({
                pubkeys: follows,
                buildingsCount: buildings.length,
                seed: graph.ownerPubkey,
            });

            const occupancy = buildOccupancyState({
                buildingsCount: buildings.length,
                assignments: assignments.assignments,
            });

            mapBridge.applyOccupancy({
                byBuildingIndex: occupancy.byBuildingIndex,
                selectedBuildingIndex: occupancy.selectedBuildingIndex,
            });

            setState({
                status: 'success',
                data: {
                    ownerPubkey: graph.ownerPubkey,
                    follows,
                    profiles,
                    assignments,
                    buildingsCount: buildings.length,
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo cargar la red Nostr';
            setState({
                status: 'error',
                error: message,
                data: createInitialData(),
            });
        }
    };

    const selectFollowing = (pubkey: string): void => {
        if (!mapBridge || state.status !== 'success') {
            return;
        }

        const selectedPubkey = state.data.selectedPubkey === pubkey ? undefined : pubkey;
        const occupancy = buildOccupancyState({
            buildingsCount: state.data.buildingsCount,
            assignments: state.data.assignments.assignments,
            selectedPubkey,
        });

        mapBridge.applyOccupancy({
            byBuildingIndex: occupancy.byBuildingIndex,
            selectedBuildingIndex: occupancy.selectedBuildingIndex,
        });

        if (occupancy.selectedBuildingIndex !== undefined) {
            mapBridge.focusBuilding(occupancy.selectedBuildingIndex);
        }

        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                selectedPubkey,
            },
        }));
    };

    const assignedCount = useMemo(() => Object.keys(state.data.assignments.byBuildingIndex).length, [state.data.assignments]);

    return {
        status: state.status,
        error: state.error,
        follows: state.data.follows,
        profiles: state.data.profiles,
        selectedPubkey: state.data.selectedPubkey,
        followsCount: state.data.follows.length,
        assignedCount,
        submitNpub,
        selectFollowing,
    };
}
