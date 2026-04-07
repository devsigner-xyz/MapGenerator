import { useEffect, useMemo, useRef, useState } from 'react';
import { assignPubkeysToBuildings, type AssignmentResult } from '../../nostr/domain/assignment';
import { buildOccupancyState } from '../../nostr/domain/occupancy';
import { fetchFollowersBestEffort } from '../../nostr/followers';
import { fetchFollowsByNpub } from '../../nostr/follows';
import { NdkClient } from '../../nostr/ndk-client';
import { fetchProfiles } from '../../nostr/profiles';
import type { NostrClient, NostrProfile } from '../../nostr/types';
import type { MapBridge } from '../map-bridge';
import { createFollowerBatcher } from './follower-batcher';

export type OverlayStatus =
    | 'idle'
    | 'loading_graph'
    | 'loading_profiles'
    | 'assigning_map'
    | 'loading_followers'
    | 'success'
    | 'error';

interface OverlayData {
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    follows: string[];
    profiles: Record<string, NostrProfile>;
    followers: string[];
    followerProfiles: Record<string, NostrProfile>;
    followersLoading: boolean;
    assignments: AssignmentResult;
    buildingsCount: number;
    selectedPubkey?: string;
    activeProfilePubkey?: string;
    activeProfileBuildingIndex?: number;
}

interface OverlayState {
    status: OverlayStatus;
    error?: string;
    data: OverlayData;
}

export interface NostrOverlayServices {
    createClient?: (relays?: string[]) => NostrClient;
    fetchFollowsByNpubFn?: typeof fetchFollowsByNpub;
    fetchProfilesFn?: typeof fetchProfiles;
    fetchFollowersBestEffortFn?: typeof fetchFollowersBestEffort;
}

interface UseNostrOverlayOptions {
    mapBridge: MapBridge | null;
    services?: NostrOverlayServices;
}

function createInitialData(): OverlayData {
    return {
        follows: [],
        profiles: {},
        followers: [],
        followerProfiles: {},
        followersLoading: false,
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

function hasLoadedOverlayData(status: OverlayStatus): boolean {
    return status === 'loading_followers' || status === 'success';
}

export function useNostrOverlay({ mapBridge, services }: UseNostrOverlayOptions) {
    const createClient = services?.createClient || ((relays: string[] = []) => new NdkClient(relays));
    const fetchFollowsByNpubFn = services?.fetchFollowsByNpubFn || fetchFollowsByNpub;
    const fetchProfilesFn = services?.fetchProfilesFn || fetchProfiles;
    const fetchFollowersBestEffortFn = services?.fetchFollowersBestEffortFn || fetchFollowersBestEffort;

    const [state, setState] = useState<OverlayState>({
        status: 'idle',
        data: createInitialData(),
    });
    const requestIdRef = useRef(0);
    const latestStateRef = useRef(state);

    useEffect(() => {
        latestStateRef.current = state;
    }, [state]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onMapGenerated(() => {
            setState((current) => {
                if (!hasLoadedOverlayData(current.status) || !current.data.ownerPubkey) {
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

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        if (!hasLoadedOverlayData(state.status) || !state.data.activeProfilePubkey) {
            mapBridge.setModalBuildingHighlight(undefined);
            return;
        }

        const highlightedIndex = state.data.activeProfileBuildingIndex ?? state.data.assignments.pubkeyToBuildingIndex[state.data.activeProfilePubkey];
        mapBridge.setModalBuildingHighlight(highlightedIndex);
    }, [mapBridge, state.status, state.data.activeProfilePubkey, state.data.activeProfileBuildingIndex, state.data.assignments]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onOccupiedBuildingClick(({ buildingIndex, pubkey }) => {
            const current = latestStateRef.current;
            if (!hasLoadedOverlayData(current.status)) {
                return;
            }

            const occupancy = buildOccupancyState({
                buildingsCount: current.data.buildingsCount,
                assignments: current.data.assignments.assignments,
                selectedPubkey: pubkey,
            });

            mapBridge.applyOccupancy({
                byBuildingIndex: occupancy.byBuildingIndex,
                selectedBuildingIndex: occupancy.selectedBuildingIndex,
            });
            mapBridge.focusBuilding(buildingIndex);

            setState((prev) => {
                if (!hasLoadedOverlayData(prev.status)) {
                    return prev;
                }

                return {
                    ...prev,
                    data: {
                        ...prev.data,
                        selectedPubkey: pubkey,
                        activeProfilePubkey: pubkey,
                        activeProfileBuildingIndex: buildingIndex,
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

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        setState((current) => ({ ...current, status: 'loading_graph', error: undefined }));

        try {
            const client = createClient();
            const graph = await fetchFollowsByNpubFn(npub, client);
            const follows = dedupe(graph.follows);

            if (requestIdRef.current !== requestId) {
                return;
            }

            setState((current) => ({
                ...current,
                status: 'loading_profiles',
                error: undefined,
            }));

            const [ownerProfiles, profiles] = await Promise.all([
                fetchProfilesFn([graph.ownerPubkey], client),
                fetchProfilesFn(follows, client),
            ]);
            const ownerProfile = ownerProfiles[graph.ownerPubkey];

            if (requestIdRef.current !== requestId) {
                return;
            }

            setState((current) => ({
                ...current,
                status: 'assigning_map',
                error: undefined,
            }));

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

            if (requestIdRef.current !== requestId) {
                return;
            }

            setState({
                status: 'loading_followers',
                data: {
                    ownerPubkey: graph.ownerPubkey,
                    ownerProfile,
                    follows,
                    profiles,
                    followers: [],
                    followerProfiles: {},
                    followersLoading: true,
                    assignments,
                    buildingsCount: buildings.length,
                    activeProfilePubkey: undefined,
                    activeProfileBuildingIndex: undefined,
                },
            });

            void (async () => {
                const followerSet = new Set<string>();
                const nextFollowerProfiles: Record<string, NostrProfile> = {};
                const followerBatcher = createFollowerBatcher(async (newFollowers: string[]) => {
                    if (requestIdRef.current !== requestId || newFollowers.length === 0) {
                        return;
                    }

                    for (const pubkey of newFollowers) {
                        followerSet.add(pubkey);
                    }

                    const fetchedProfiles = await fetchProfilesFn(newFollowers, client);
                    Object.assign(nextFollowerProfiles, fetchedProfiles);

                    if (requestIdRef.current !== requestId) {
                        return;
                    }

                    setState((current) => {
                        if (
                            !hasLoadedOverlayData(current.status) ||
                            current.data.ownerPubkey !== graph.ownerPubkey ||
                            requestIdRef.current !== requestId
                        ) {
                            return current;
                        }

                        return {
                            ...current,
                            data: {
                                ...current.data,
                                followers: [...followerSet],
                                followerProfiles: {
                                    ...current.data.followerProfiles,
                                    ...fetchedProfiles,
                                },
                            },
                        };
                    });
                });

                try {
                    const followersClient = createClient(graph.relayHints);
                    await fetchFollowersBestEffortFn({
                        targetPubkey: graph.ownerPubkey,
                        client: followersClient,
                        candidateAuthors: follows,
                        onBatch: async (batch) => {
                            if (requestIdRef.current !== requestId || batch.newFollowers.length === 0) {
                                return;
                            }
                            followerBatcher.add(batch.newFollowers);
                        },
                    });

                    await followerBatcher.flushNow();
                } catch {
                    // Keep follows + profile visible even when follower discovery fails.
                } finally {
                    followerBatcher.dispose();
                }

                if (requestIdRef.current !== requestId) {
                    return;
                }

                setState((current) => {
                    if (
                        !hasLoadedOverlayData(current.status) ||
                        current.data.ownerPubkey !== graph.ownerPubkey ||
                        requestIdRef.current !== requestId
                    ) {
                        return current;
                    }

                    return {
                        ...current,
                        status: 'success',
                        data: {
                            ...current.data,
                            followers: [...followerSet],
                            followerProfiles: {
                                ...current.data.followerProfiles,
                                ...nextFollowerProfiles,
                            },
                            followersLoading: false,
                        },
                    };
                });
            })();
        } catch (error) {
            if (requestIdRef.current !== requestId) {
                return;
            }

            const message = error instanceof Error ? error.message : 'No se pudo cargar la red Nostr';
            setState({
                status: 'error',
                error: message,
                data: createInitialData(),
            });
        }
    };

    const selectFollowing = (pubkey: string): void => {
        if (!mapBridge || !hasLoadedOverlayData(state.status)) {
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
                activeProfilePubkey: undefined,
                activeProfileBuildingIndex: undefined,
            },
        }));
    };

    const closeActiveProfileModal = (): void => {
        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                activeProfilePubkey: undefined,
                activeProfileBuildingIndex: undefined,
            },
        }));
    };

    const assignedCount = useMemo(() => Object.keys(state.data.assignments.byBuildingIndex).length, [state.data.assignments]);

    return {
        status: state.status,
        error: state.error,
        ownerPubkey: state.data.ownerPubkey,
        ownerProfile: state.data.ownerProfile,
        follows: state.data.follows,
        profiles: state.data.profiles,
        followers: state.data.followers,
        followerProfiles: state.data.followerProfiles,
        followersLoading: state.data.followersLoading,
        selectedPubkey: state.data.selectedPubkey,
        activeProfilePubkey: state.data.activeProfilePubkey,
        activeProfile: state.data.activeProfilePubkey ? state.data.profiles[state.data.activeProfilePubkey] : undefined,
        followsCount: state.data.follows.length,
        assignedCount,
        submitNpub,
        selectFollowing,
        closeActiveProfileModal,
    };
}
