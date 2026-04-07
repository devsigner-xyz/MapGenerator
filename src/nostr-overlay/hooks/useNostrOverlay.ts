import { useEffect, useMemo, useRef, useState } from 'react';
import { assignPubkeysToBuildings, hashPubkeyToIndex, type AssignmentResult } from '../../nostr/domain/assignment';
import { buildOccupancyState } from '../../nostr/domain/occupancy';
import { fetchFollowersBestEffort } from '../../nostr/followers';
import { fetchFollowsByNpub, parseFollowsFromKind3 } from '../../nostr/follows';
import { NdkClient } from '../../nostr/ndk-client';
import { fetchLatestPostsByPubkey, type NostrPostPreview } from '../../nostr/posts';
import { fetchProfileStats } from '../../nostr/profile-stats';
import { fetchProfiles } from '../../nostr/profiles';
import { loadRelaySettings } from '../../nostr/relay-settings';
import { getBootstrapRelays, mergeRelaySets, relayListFromKind10002Event } from '../../nostr/relay-policy';
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
    ownerBuildingIndex?: number;
    follows: string[];
    profiles: Record<string, NostrProfile>;
    followers: string[];
    followerProfiles: Record<string, NostrProfile>;
    followersLoading: boolean;
    assignments: AssignmentResult;
    buildingsCount: number;
    selectedPubkey?: string;
    relayHints: string[];
    suggestedRelays: string[];
    activeProfilePubkey?: string;
    activeProfileBuildingIndex?: number;
    activeProfilePosts: NostrPostPreview[];
    activeProfilePostsCursor?: number;
    activeProfilePostsHasMore: boolean;
    activeProfilePostsLoading: boolean;
    activeProfilePostsError?: string;
    activeProfileFollowsCount: number;
    activeProfileFollowersCount: number;
    activeProfileStatsLoading: boolean;
    activeProfileStatsError?: string;
    activeProfileFollows: string[];
    activeProfileFollowers: string[];
    activeProfileNetworkProfiles: Record<string, NostrProfile>;
    activeProfileNetworkLoading: boolean;
    activeProfileNetworkError?: string;
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
    fetchLatestPostsByPubkeyFn?: typeof fetchLatestPostsByPubkey;
    fetchProfileStatsFn?: typeof fetchProfileStats;
}

interface UseNostrOverlayOptions {
    mapBridge: MapBridge | null;
    services?: NostrOverlayServices;
}

function createEmptyActiveProfileState(): Pick<
    OverlayData,
    | 'activeProfilePubkey'
    | 'activeProfileBuildingIndex'
    | 'activeProfilePosts'
    | 'activeProfilePostsCursor'
    | 'activeProfilePostsHasMore'
    | 'activeProfilePostsLoading'
    | 'activeProfilePostsError'
    | 'activeProfileFollowsCount'
    | 'activeProfileFollowersCount'
    | 'activeProfileStatsLoading'
    | 'activeProfileStatsError'
    | 'activeProfileFollows'
    | 'activeProfileFollowers'
    | 'activeProfileNetworkProfiles'
    | 'activeProfileNetworkLoading'
    | 'activeProfileNetworkError'
> {
    return {
        activeProfilePubkey: undefined,
        activeProfileBuildingIndex: undefined,
        activeProfilePosts: [],
        activeProfilePostsCursor: undefined,
        activeProfilePostsHasMore: true,
        activeProfilePostsLoading: false,
        activeProfilePostsError: undefined,
        activeProfileFollowsCount: 0,
        activeProfileFollowersCount: 0,
        activeProfileStatsLoading: false,
        activeProfileStatsError: undefined,
        activeProfileFollows: [],
        activeProfileFollowers: [],
        activeProfileNetworkProfiles: {},
        activeProfileNetworkLoading: false,
        activeProfileNetworkError: undefined,
    };
}

function createInitialData(): OverlayData {
    return {
        ownerBuildingIndex: undefined,
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
        relayHints: [],
        suggestedRelays: [],
        ...createEmptyActiveProfileState(),
    };
}

function resolveOwnerBuildingIndex(ownerPubkey: string | undefined, buildingsCount: number): number | undefined {
    if (!ownerPubkey) {
        return undefined;
    }

    const index = hashPubkeyToIndex(ownerPubkey, buildingsCount, ownerPubkey);
    return index >= 0 ? index : undefined;
}

function dedupe(values: string[]): string[] {
    return [...new Set(values)];
}

function hasLoadedOverlayData(status: OverlayStatus): boolean {
    return status === 'loading_followers' || status === 'success';
}

export function useNostrOverlay({ mapBridge, services }: UseNostrOverlayOptions) {
    const ACTIVE_PROFILE_POST_LIMIT = 10;
    const createClient = services?.createClient || ((relays: string[] = []) => new NdkClient(relays));
    const fetchFollowsByNpubFn = services?.fetchFollowsByNpubFn || fetchFollowsByNpub;
    const fetchProfilesFn = services?.fetchProfilesFn || fetchProfiles;
    const fetchFollowersBestEffortFn = services?.fetchFollowersBestEffortFn || fetchFollowersBestEffort;
    const fetchLatestPostsByPubkeyFn = services?.fetchLatestPostsByPubkeyFn || fetchLatestPostsByPubkey;
    const fetchProfileStatsFn = services?.fetchProfileStatsFn || fetchProfileStats;

    const [state, setState] = useState<OverlayState>({
        status: 'idle',
        data: createInitialData(),
    });
    const requestIdRef = useRef(0);
    const activeProfileLoadIdRef = useRef(0);
    const latestStateRef = useRef(state);

    const resolveOverlayRelays = (relayHints: string[]): string[] => {
        const configuredRelays = (() => {
            const loaded = loadRelaySettings().relays;
            return loaded.length > 0 ? loaded : getBootstrapRelays();
        })();

        return mergeRelaySets(configuredRelays, relayHints);
    };

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
                        ownerBuildingIndex: resolveOwnerBuildingIndex(current.data.ownerPubkey, buildings.length),
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
                        ...createEmptyActiveProfileState(),
                        activeProfilePubkey: pubkey,
                        activeProfileBuildingIndex: buildingIndex,
                    },
                };
            });
        });
    }, [mapBridge]);

    useEffect(() => {
        if (!hasLoadedOverlayData(state.status) || !state.data.activeProfilePubkey) {
            return;
        }

        const pubkey = state.data.activeProfilePubkey;
        activeProfileLoadIdRef.current += 1;
        const loadId = activeProfileLoadIdRef.current;

        setState((current) => {
            if (!hasLoadedOverlayData(current.status) || current.data.activeProfilePubkey !== pubkey) {
                return current;
            }

            return {
                ...current,
                data: {
                    ...current.data,
                    ...createEmptyActiveProfileState(),
                    activeProfileBuildingIndex: current.data.activeProfileBuildingIndex,
                    activeProfilePostsLoading: true,
                    activeProfileStatsLoading: true,
                    activeProfileNetworkLoading: true,
                    activeProfilePubkey: pubkey,
                },
            };
        });

        void (async () => {
            const current = latestStateRef.current;
            const client = createClient(resolveOverlayRelays(current.data.relayHints));

            void (async () => {
                try {
                    const postsResult = await fetchLatestPostsByPubkeyFn({
                        pubkey,
                        client,
                        limit: ACTIVE_PROFILE_POST_LIMIT,
                    });

                    if (activeProfileLoadIdRef.current !== loadId) {
                        return;
                    }

                    setState((nextState) => {
                        if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                            return nextState;
                        }

                        return {
                            ...nextState,
                            data: {
                                ...nextState.data,
                                activeProfilePosts: postsResult.posts,
                                activeProfilePostsCursor: postsResult.nextUntil,
                                activeProfilePostsHasMore: postsResult.hasMore,
                                activeProfilePostsLoading: false,
                                activeProfilePostsError: undefined,
                            },
                        };
                    });
                } catch (error) {
                    if (activeProfileLoadIdRef.current !== loadId) {
                        return;
                    }

                    const message = error instanceof Error ? error.message : 'No se pudieron cargar publicaciones';
                    setState((nextState) => {
                        if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                            return nextState;
                        }

                        return {
                            ...nextState,
                            data: {
                                ...nextState.data,
                                activeProfilePostsLoading: false,
                                activeProfilePostsError: message,
                            },
                        };
                    });
                }
            })();

            void (async () => {
                try {
                    const statsResult = await fetchProfileStatsFn({
                        pubkey,
                        client,
                        candidateAuthors: current.data.follows,
                    });

                    if (activeProfileLoadIdRef.current !== loadId) {
                        return;
                    }

                    setState((nextState) => {
                        if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                            return nextState;
                        }

                        return {
                            ...nextState,
                            data: {
                                ...nextState.data,
                                activeProfileFollowsCount: statsResult.followsCount,
                                activeProfileFollowersCount: statsResult.followersCount,
                                activeProfileStatsLoading: false,
                                activeProfileStatsError: undefined,
                            },
                        };
                    });
                } catch (error) {
                    if (activeProfileLoadIdRef.current !== loadId) {
                        return;
                    }

                    const message = error instanceof Error ? error.message : 'No se pudo cargar estadisticas del perfil';
                    setState((nextState) => {
                        if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                            return nextState;
                        }

                        return {
                            ...nextState,
                            data: {
                                ...nextState.data,
                                activeProfileStatsLoading: false,
                                activeProfileStatsError: message,
                            },
                        };
                    });
                }
            })();

            void (async () => {
                try {
                    const [kind3Event, followersResult] = await Promise.all([
                        client.fetchLatestReplaceableEvent(pubkey, 3),
                        fetchFollowersBestEffortFn({
                            targetPubkey: pubkey,
                            client,
                            candidateAuthors: current.data.follows,
                        }),
                    ]);
                    const follows = kind3Event ? parseFollowsFromKind3(kind3Event) : [];
                    const followers = dedupe(followersResult.followers);
                    const networkPubkeys = dedupe([...follows, ...followers]);
                    const networkProfiles = await fetchProfilesFn(networkPubkeys, client);

                    if (activeProfileLoadIdRef.current !== loadId) {
                        return;
                    }

                    setState((nextState) => {
                        if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                            return nextState;
                        }

                        return {
                            ...nextState,
                            data: {
                                ...nextState.data,
                                activeProfileFollows: follows,
                                activeProfileFollowers: followers,
                                activeProfileNetworkProfiles: networkProfiles,
                                activeProfileNetworkLoading: false,
                                activeProfileNetworkError: undefined,
                                activeProfileFollowsCount:
                                    nextState.data.activeProfileStatsLoading || nextState.data.activeProfileStatsError
                                        ? follows.length
                                        : nextState.data.activeProfileFollowsCount,
                                activeProfileFollowersCount:
                                    nextState.data.activeProfileStatsLoading || nextState.data.activeProfileStatsError
                                        ? followers.length
                                        : nextState.data.activeProfileFollowersCount,
                            },
                        };
                    });
                } catch (error) {
                    if (activeProfileLoadIdRef.current !== loadId) {
                        return;
                    }

                    const message = error instanceof Error ? error.message : 'No se pudo cargar red social del perfil';
                    setState((nextState) => {
                        if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                            return nextState;
                        }

                        return {
                            ...nextState,
                            data: {
                                ...nextState.data,
                                activeProfileNetworkLoading: false,
                                activeProfileNetworkError: message,
                            },
                        };
                    });
                }
            })();
        })();
    }, [state.status, state.data.activeProfilePubkey]);

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
            const configuredRelays = (() => {
                const loaded = loadRelaySettings().relays;
                return loaded.length > 0 ? loaded : getBootstrapRelays();
            })();
            const client = createClient(configuredRelays);
            const graph = await fetchFollowsByNpubFn(npub, client);
            const follows = dedupe(graph.follows);
            let suggestedRelays: string[] = [];
            try {
                const relayListEvent = await client.fetchLatestReplaceableEvent(graph.ownerPubkey, 10002);
                suggestedRelays = relayListFromKind10002Event(relayListEvent);
            } catch {
                suggestedRelays = [];
            }

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
                    ownerBuildingIndex: resolveOwnerBuildingIndex(graph.ownerPubkey, buildings.length),
                    follows,
                    profiles,
                    followers: [],
                    followerProfiles: {},
                    followersLoading: true,
                    assignments,
                    buildingsCount: buildings.length,
                    relayHints: graph.relayHints,
                    suggestedRelays,
                    ...createEmptyActiveProfileState(),
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
                    const followersClient = createClient(mergeRelaySets(configuredRelays, graph.relayHints));
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

        activeProfileLoadIdRef.current += 1;

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
                ...createEmptyActiveProfileState(),
            },
        }));
    };

    const closeActiveProfileModal = (): void => {
        activeProfileLoadIdRef.current += 1;
        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                ...createEmptyActiveProfileState(),
            },
        }));
    };

    const loadMoreActiveProfilePosts = async (): Promise<void> => {
        const current = latestStateRef.current;
        if (!hasLoadedOverlayData(current.status) || !current.data.activeProfilePubkey) {
            return;
        }

        if (current.data.activeProfilePostsLoading || !current.data.activeProfilePostsHasMore) {
            return;
        }

        const pubkey = current.data.activeProfilePubkey;
        const until = current.data.activeProfilePostsCursor;
        if (until === undefined) {
            return;
        }

        const loadId = activeProfileLoadIdRef.current;
        setState((nextState) => {
            if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                return nextState;
            }

            return {
                ...nextState,
                data: {
                    ...nextState.data,
                    activeProfilePostsLoading: true,
                    activeProfilePostsError: undefined,
                },
            };
        });

        try {
            const client = createClient(resolveOverlayRelays(current.data.relayHints));
            const nextBatch = await fetchLatestPostsByPubkeyFn({
                pubkey,
                client,
                limit: ACTIVE_PROFILE_POST_LIMIT,
                until,
            });

            if (activeProfileLoadIdRef.current !== loadId) {
                return;
            }

            setState((nextState) => {
                if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                    return nextState;
                }

                const existingIds = new Set(nextState.data.activeProfilePosts.map((post) => post.id));
                const mergedPosts = [
                    ...nextState.data.activeProfilePosts,
                    ...nextBatch.posts.filter((post) => !existingIds.has(post.id)),
                ];

                return {
                    ...nextState,
                    data: {
                        ...nextState.data,
                        activeProfilePosts: mergedPosts,
                        activeProfilePostsCursor: nextBatch.nextUntil,
                        activeProfilePostsHasMore: nextBatch.hasMore,
                        activeProfilePostsLoading: false,
                        activeProfilePostsError: undefined,
                    },
                };
            });
        } catch (error) {
            if (activeProfileLoadIdRef.current !== loadId) {
                return;
            }

            const message = error instanceof Error ? error.message : 'No se pudieron cargar mas publicaciones';
            setState((nextState) => {
                if (!hasLoadedOverlayData(nextState.status) || nextState.data.activeProfilePubkey !== pubkey) {
                    return nextState;
                }

                return {
                    ...nextState,
                    data: {
                        ...nextState.data,
                        activeProfilePostsLoading: false,
                        activeProfilePostsError: message,
                    },
                };
            });
        }
    };

    const assignedCount = useMemo(() => Object.keys(state.data.assignments.byBuildingIndex).length, [state.data.assignments]);

    return {
        status: state.status,
        error: state.error,
        ownerPubkey: state.data.ownerPubkey,
        ownerProfile: state.data.ownerProfile,
        ownerBuildingIndex: state.data.ownerBuildingIndex,
        follows: state.data.follows,
        profiles: state.data.profiles,
        followers: state.data.followers,
        followerProfiles: state.data.followerProfiles,
        followersLoading: state.data.followersLoading,
        selectedPubkey: state.data.selectedPubkey,
        suggestedRelays: state.data.suggestedRelays,
        activeProfilePubkey: state.data.activeProfilePubkey,
        activeProfile: state.data.activeProfilePubkey ? state.data.profiles[state.data.activeProfilePubkey] : undefined,
        activeProfilePosts: state.data.activeProfilePosts,
        activeProfilePostsLoading: state.data.activeProfilePostsLoading,
        activeProfilePostsError: state.data.activeProfilePostsError,
        activeProfilePostsHasMore: state.data.activeProfilePostsHasMore,
        activeProfileFollowsCount: state.data.activeProfileFollowsCount,
        activeProfileFollowersCount: state.data.activeProfileFollowersCount,
        activeProfileStatsLoading: state.data.activeProfileStatsLoading,
        activeProfileStatsError: state.data.activeProfileStatsError,
        activeProfileFollows: state.data.activeProfileFollows,
        activeProfileFollowers: state.data.activeProfileFollowers,
        activeProfileNetworkProfiles: state.data.activeProfileNetworkProfiles,
        activeProfileNetworkLoading: state.data.activeProfileNetworkLoading,
        activeProfileNetworkError: state.data.activeProfileNetworkError,
        followsCount: state.data.follows.length,
        assignedCount,
        occupancyByBuildingIndex: state.data.assignments.byBuildingIndex,
        submitNpub,
        selectFollowing,
        closeActiveProfileModal,
        loadMoreActiveProfilePosts,
    };
}
