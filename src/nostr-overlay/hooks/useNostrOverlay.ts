import { useEffect, useMemo, useRef, useState } from 'react';
import { createAuthService } from '../../nostr/auth/auth-service';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import {
    isDirectMessagesEnabled,
    isEncryptionEnabled,
    isWriteEnabled,
    type AuthSessionState,
    type LoginMethod,
} from '../../nostr/auth/session';
import { assignPubkeysToBuildings, hashPubkeyToIndex, type AssignmentResult } from '../../nostr/domain/assignment';
import { buildOccupancyState } from '../../nostr/domain/occupancy';
import { fetchFollowersBestEffort } from '../../nostr/followers';
import { fetchFollowsByNpub, fetchFollowsByPubkey, parseFollowsFromKind3 } from '../../nostr/follows';
import { createLazyNdkClient } from '../../nostr/lazy-ndk-client';
import { fetchLatestPostsByPubkey, type NostrPostPreview } from '../../nostr/posts';
import { fetchProfileStats } from '../../nostr/profile-stats';
import { fetchProfiles } from '../../nostr/profiles';
import { searchUsers as searchUsersDomain } from '../../nostr/user-search';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import { getRelaySetByType, loadRelaySettings, type RelaySettingsByType } from '../../nostr/relay-settings';
import {
    dmInboxRelayListFromKind10050Event,
    getBootstrapRelays,
    mergeRelaySets,
    relayListFromKind10002Event,
    relaySuggestionsByTypeFromKind10002Event,
} from '../../nostr/relay-policy';
import type { SocialNotificationsService } from '../../nostr/social-notifications-service';
import type { NostrClient, NostrProfile } from '../../nostr/types';
import { createWriteGateway } from '../../nostr/write-gateway';
import { createRuntimeDirectMessagesService } from '../../nostr/dm-runtime-service';
import type { MapBridge } from '../map-bridge';
import { FEATURED_OCCUPANT_PUBKEYS } from '../domain/featured-occupants';
import { createFollowerBatcher } from './follower-batcher';
import { createDmReadStateStorage, useDirectMessages, type DirectMessagesService } from './useDirectMessages';

export type OverlayStatus =
    | 'idle'
    | 'loading_graph'
    | 'loading_profiles'
    | 'assigning_map'
    | 'loading_followers'
    | 'success'
    | 'error';

export type MapLoaderStage =
    | 'connecting_relay'
    | 'fetching_data'
    | 'building_map';

interface OverlayData {
    authSession?: AuthSessionState;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    ownerBuildingIndex?: number;
    follows: string[];
    featuredPubkeys: string[];
    profiles: Record<string, NostrProfile>;
    followers: string[];
    followerProfiles: Record<string, NostrProfile>;
    followersLoading: boolean;
    assignments: AssignmentResult;
    buildingsCount: number;
    parkCount: number;
    selectedPubkey?: string;
    relayHints: string[];
    suggestedRelays: string[];
    suggestedRelaysByType: RelaySettingsByType;
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
    fetchFollowsByPubkeyFn?: typeof fetchFollowsByPubkey;
    fetchProfilesFn?: typeof fetchProfiles;
    searchUsersFn?: typeof searchUsersDomain;
    fetchFollowersBestEffortFn?: typeof fetchFollowersBestEffort;
    fetchLatestPostsByPubkeyFn?: typeof fetchLatestPostsByPubkey;
    fetchProfileStatsFn?: typeof fetchProfileStats;
    directMessagesService?: DirectMessagesService;
    socialNotificationsService?: SocialNotificationsService;
    socialFeedService?: SocialFeedService;
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
        authSession: undefined,
        ownerBuildingIndex: undefined,
        follows: [],
        featuredPubkeys: FEATURED_OCCUPANT_PUBKEYS,
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
        parkCount: 0,
        relayHints: [],
        suggestedRelays: [],
        suggestedRelaysByType: {
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
        },
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

function hasSameRelaySet(left: string[], right: string[]): boolean {
    const leftSet = new Set(mergeRelaySets(left));
    const rightSet = new Set(mergeRelaySets(right));

    if (leftSet.size !== rightSet.size) {
        return false;
    }

    for (const relay of leftSet) {
        if (!rightSet.has(relay)) {
            return false;
        }
    }

    return true;
}

function hasLoadedOverlayData(status: OverlayStatus): boolean {
    return status === 'loading_followers' || status === 'success';
}

export function useNostrOverlay({ mapBridge, services }: UseNostrOverlayOptions) {
    const ACTIVE_PROFILE_POST_LIMIT = 10;
    const OCCUPANCY_BATCH_SIZE = 8;
    const OCCUPANCY_BATCH_DELAY_MS = 22;
    const createClient = services?.createClient || ((relays: string[] = []) => createLazyNdkClient({ relays }));
    const fetchFollowsByNpubFn = services?.fetchFollowsByNpubFn || fetchFollowsByNpub;
    const fetchFollowsByPubkeyFn = services?.fetchFollowsByPubkeyFn || fetchFollowsByPubkey;
    const fetchProfilesFn = services?.fetchProfilesFn || fetchProfiles;
    const searchUsersFn = services?.searchUsersFn || searchUsersDomain;
    const fetchFollowersBestEffortFn = services?.fetchFollowersBestEffortFn || fetchFollowersBestEffort;
    const fetchLatestPostsByPubkeyFn = services?.fetchLatestPostsByPubkeyFn || fetchLatestPostsByPubkey;
    const fetchProfileStatsFn = services?.fetchProfileStatsFn || fetchProfileStats;
    const authService = useMemo(() => createAuthService(), []);
    const writeGateway = useMemo(
        () =>
            createWriteGateway({
                getSession: () => authService.getSession(),
                getProvider: () => authService.getActiveProvider(),
            }),
        [authService]
    );

    const [state, setState] = useState<OverlayState>({
        status: 'idle',
        data: createInitialData(),
    });
    const [mapLoaderStage, setMapLoaderStage] = useState<MapLoaderStage | null>(null);
    const requestIdRef = useRef(0);
    const activeProfileLoadIdRef = useRef(0);
    const latestStateRef = useRef(state);
    const occupancyAnimationTokenRef = useRef(0);
    const skipNextMapGeneratedRef = useRef(false);
    const didRestoreSessionRef = useRef(false);
    const runtimeDmRelays = useMemo(() => {
        const loadedSettings = loadRelaySettings();
        const configuredDmInboxRelays = getRelaySetByType(loadedSettings, 'dmInbox');
        const configuredNip65ReadRelays = getRelaySetByType(loadedSettings, 'nip65Read');
        const configuredNip65BothRelays = getRelaySetByType(loadedSettings, 'nip65Both');
        const protocolFallback = mergeRelaySets(configuredNip65ReadRelays, configuredNip65BothRelays);
        const configuredRelays = configuredDmInboxRelays.length > 0
            ? configuredDmInboxRelays
            : protocolFallback.length > 0
                ? protocolFallback
                : loadedSettings.relays.length > 0
                ? loadedSettings.relays
                : getBootstrapRelays();

        return mergeRelaySets(
            configuredRelays,
            state.data.relayHints,
            state.data.suggestedRelaysByType.nip65Both,
            state.data.suggestedRelaysByType.nip65Read,
            state.data.suggestedRelaysByType.dmInbox
        );
    }, [state.data.relayHints, state.data.suggestedRelaysByType]);
    const runtimeDmOutboxRelays = useMemo(() => {
        const loadedSettings = loadRelaySettings();
        const configuredNip65WriteRelays = getRelaySetByType(loadedSettings, 'nip65Write');
        const configuredNip65BothRelays = getRelaySetByType(loadedSettings, 'nip65Both');
        const configuredRelaysByProtocol = mergeRelaySets(configuredNip65WriteRelays, configuredNip65BothRelays);
        const configuredRelays = configuredRelaysByProtocol.length > 0
            ? configuredRelaysByProtocol
            : loadedSettings.relays.length > 0
                ? loadedSettings.relays
                : getBootstrapRelays();

        return mergeRelaySets(
            configuredRelays,
            state.data.suggestedRelaysByType.nip65Both,
            state.data.suggestedRelaysByType.nip65Write
        );
    }, [state.data.suggestedRelaysByType]);
    const runtimeDmRelayKey = useMemo(
        () => `${runtimeDmRelays.join('|')}::${runtimeDmOutboxRelays.join('|')}`,
        [runtimeDmRelays, runtimeDmOutboxRelays]
    );
    const directMessagesService = useMemo(
        () => services?.directMessagesService ?? createRuntimeDirectMessagesService({
            writeGateway,
            resolveRelays: () => ({
                inbox: runtimeDmRelays,
                outbox: runtimeDmOutboxRelays,
            }),
        }),
        [services?.directMessagesService, writeGateway, runtimeDmRelayKey]
    );
    const dmReadStateStorage = useMemo(
        () =>
            createDmReadStateStorage({
                storage: window.localStorage,
                now: () => Math.floor(Date.now() / 1000),
                version: 'v1',
            }),
        []
    );
    const directMessages = useDirectMessages({
        ownerPubkey: state.data.ownerPubkey,
        dmService: directMessagesService,
        storage: dmReadStateStorage,
    });

    const cancelOccupancyAnimation = (): number => {
        occupancyAnimationTokenRef.current += 1;
        return occupancyAnimationTokenRef.current;
    };

    const applyOccupancyProgressively = async (input: {
        byBuildingIndex: Record<number, string>;
        selectedBuildingIndex?: number;
        shouldStop?: () => boolean;
    }): Promise<void> => {
        if (!mapBridge) {
            return;
        }

        const shouldStop = input.shouldStop || (() => false);
        const token = cancelOccupancyAnimation();
        const entries = Object.entries(input.byBuildingIndex)
            .map(([indexKey, pubkey]) => ({
                index: Number(indexKey),
                pubkey,
            }))
            .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0 && !!entry.pubkey)
            .sort((a, b) => a.index - b.index);

        const staged: Record<number, string> = {};
        mapBridge.applyOccupancy({
            byBuildingIndex: { ...staged },
            selectedBuildingIndex: undefined,
        });

        for (let i = 0; i < entries.length; i++) {
            if (token !== occupancyAnimationTokenRef.current || shouldStop()) {
                return;
            }

            const entry = entries[i];
            staged[entry.index] = entry.pubkey;

            const shouldFlush = i === entries.length - 1 || ((i + 1) % OCCUPANCY_BATCH_SIZE) === 0;
            if (!shouldFlush) {
                continue;
            }

            mapBridge.applyOccupancy({
                byBuildingIndex: { ...staged },
                selectedBuildingIndex: undefined,
            });

            if (i < entries.length - 1) {
                await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, OCCUPANCY_BATCH_DELAY_MS);
                });
            }
        }

        if (token !== occupancyAnimationTokenRef.current || shouldStop()) {
            return;
        }

        mapBridge.applyOccupancy({
            byBuildingIndex: { ...staged },
            selectedBuildingIndex: input.selectedBuildingIndex,
        });
    };

    const resolveOverlayRelays = (relayHints: string[]): string[] => {
        const configuredRelays = (() => {
            const loaded = loadRelaySettings();
            const protocolRelays = mergeRelaySets(
                getRelaySetByType(loaded, 'nip65Write'),
                getRelaySetByType(loaded, 'nip65Both'),
                getRelaySetByType(loaded, 'nip65Read')
            );
            const candidates = protocolRelays.length > 0 ? protocolRelays : loaded.relays;
            return candidates.length > 0 ? candidates : getBootstrapRelays();
        })();

        return mergeRelaySets(configuredRelays, relayHints);
    };

    useEffect(() => {
        latestStateRef.current = state;
    }, [state]);

    useEffect(() => {
        if (didRestoreSessionRef.current || !mapBridge) {
            return;
        }

        didRestoreSessionRef.current = true;
        void (async () => {
            const restored = await authService.restoreSession();
            if (!restored) {
                return;
            }

            setState((current) => ({
                ...current,
                data: {
                    ...current.data,
                    authSession: restored,
                },
            }));

            await loadOwnerGraph({
                session: restored,
                method: restored.method,
            });
        })();
    }, [authService, mapBridge]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onMapGenerated(() => {
            if (skipNextMapGeneratedRef.current) {
                skipNextMapGeneratedRef.current = false;
                return;
            }

            setState((current) => {
                if (!hasLoadedOverlayData(current.status) || !current.data.ownerPubkey) {
                    return current;
                }

                const buildings = mapBridge.listBuildings();
                const assignmentPubkeys = dedupe([...current.data.follows, ...current.data.featuredPubkeys]);
                const assignments = assignPubkeysToBuildings({
                    pubkeys: assignmentPubkeys,
                    priorityPubkeys: current.data.featuredPubkeys,
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
                        parkCount: mapBridge.getParkCount(),
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
            mapBridge.setDialogBuildingHighlight(undefined);
            return;
        }

        const highlightedIndex = state.data.activeProfileBuildingIndex ?? state.data.assignments.pubkeyToBuildingIndex[state.data.activeProfilePubkey];
        mapBridge.setDialogBuildingHighlight(highlightedIndex);
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

    const loadOwnerGraph = async (input: {
        session: AuthSessionState;
        method: LoginMethod;
        credential?: string;
    }): Promise<void> => {
        if (!mapBridge) {
            setMapLoaderStage(null);
            setState({
                status: 'error',
                error: 'No se pudo conectar la capa Nostr con el mapa',
                data: {
                    ...createInitialData(),
                    authSession: input.session,
                },
            });
            return;
        }

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;
        cancelOccupancyAnimation();
        setMapLoaderStage('connecting_relay');

        setState((current) => ({ ...current, status: 'loading_graph', error: undefined }));

        try {
            const configuredRelays = (() => {
                const loaded = loadRelaySettings();
                const protocolRelays = mergeRelaySets(
                    getRelaySetByType(loaded, 'nip65Write'),
                    getRelaySetByType(loaded, 'nip65Both'),
                    getRelaySetByType(loaded, 'nip65Read')
                );
                const candidates = protocolRelays.length > 0 ? protocolRelays : loaded.relays;
                return candidates.length > 0 ? candidates : getBootstrapRelays();
            })();

            const fetchGraphWithRelays = async (relays: string[]) => {
                const client = createClient(relays);
                const graph =
                    input.method === 'npub' && input.credential
                        ? await fetchFollowsByNpubFn(input.credential, client)
                        : await fetchFollowsByPubkeyFn(input.session.pubkey, client);

                return {
                    client,
                    graph,
                    relays,
                };
            };

            let graphClient: NostrClient;
            let graphRelays = configuredRelays;
            let graph: Awaited<ReturnType<typeof fetchFollowsByPubkeyFn>>;

            try {
                const primary = await fetchGraphWithRelays(configuredRelays);
                graphClient = primary.client;
                graph = primary.graph;
                graphRelays = primary.relays;
            } catch (primaryError) {
                const bootstrapRelays = getBootstrapRelays();
                if (hasSameRelaySet(configuredRelays, bootstrapRelays)) {
                    throw primaryError;
                }

                const fallback = await fetchGraphWithRelays(bootstrapRelays);
                graphClient = fallback.client;
                graph = fallback.graph;
                graphRelays = fallback.relays;
            }

            const follows = dedupe(graph.follows);
            const featuredPubkeys = FEATURED_OCCUPANT_PUBKEYS;
            const assignmentPubkeys = dedupe([...follows, ...featuredPubkeys]);
            let suggestedRelays: string[] = [];
            let suggestedRelaysByType: RelaySettingsByType = {
                nip65Both: [],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
            };
            try {
                const [relayListEvent, dmInboxRelayListEvent] = await Promise.all([
                    graphClient.fetchLatestReplaceableEvent(graph.ownerPubkey, 10002),
                    graphClient.fetchLatestReplaceableEvent(graph.ownerPubkey, 10050),
                ]);
                const nip65ByType = relaySuggestionsByTypeFromKind10002Event(relayListEvent);
                const dmInboxRelays = dmInboxRelayListFromKind10050Event(dmInboxRelayListEvent);
                suggestedRelaysByType = {
                    ...nip65ByType,
                    dmInbox: dmInboxRelays,
                };
                suggestedRelays = relayListFromKind10002Event(relayListEvent);
            } catch {
                suggestedRelays = [];
                suggestedRelaysByType = {
                    nip65Both: [],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                };
            }

            if (requestIdRef.current !== requestId) {
                return;
            }

            setState((current) => ({
                ...current,
                status: 'loading_profiles',
                error: undefined,
            }));
            setMapLoaderStage('fetching_data');

            const [ownerProfiles, profiles] = await Promise.all([
                fetchProfilesFn([graph.ownerPubkey], graphClient),
                fetchProfilesFn(assignmentPubkeys, graphClient),
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
            setMapLoaderStage('building_map');

            await mapBridge.ensureGenerated();
            const buildings = mapBridge.listBuildings();
            const assignments = assignPubkeysToBuildings({
                pubkeys: assignmentPubkeys,
                priorityPubkeys: featuredPubkeys,
                buildingsCount: buildings.length,
                seed: graph.ownerPubkey,
            });

            const occupancy = buildOccupancyState({
                buildingsCount: buildings.length,
                assignments: assignments.assignments,
            });

            await applyOccupancyProgressively({
                byBuildingIndex: occupancy.byBuildingIndex,
                selectedBuildingIndex: occupancy.selectedBuildingIndex,
                shouldStop: () => requestIdRef.current !== requestId,
            });

            if (requestIdRef.current !== requestId) {
                return;
            }

            setMapLoaderStage(null);

            setState({
                status: 'loading_followers',
                data: {
                    ownerPubkey: graph.ownerPubkey,
                    authSession: input.session,
                    ownerProfile,
                    ownerBuildingIndex: resolveOwnerBuildingIndex(graph.ownerPubkey, buildings.length),
                    follows,
                    featuredPubkeys,
                    profiles,
                    followers: [],
                    followerProfiles: {},
                    followersLoading: true,
                    assignments,
                    buildingsCount: buildings.length,
                    parkCount: mapBridge.getParkCount(),
                    relayHints: graph.relayHints,
                    suggestedRelays,
                    suggestedRelaysByType,
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

                    const fetchedProfiles = await fetchProfilesFn(newFollowers, graphClient);
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
                    const followersClient = createClient(mergeRelaySets(graphRelays, graph.relayHints));
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

            setMapLoaderStage(null);
            const message = error instanceof Error ? error.message : 'No se pudo cargar la red Nostr';
            setState({
                status: 'error',
                error: message,
                data: {
                    ...createInitialData(),
                    authSession: input.session,
                },
            });
        }
    };

    const startSession = async (method: LoginMethod, input: ProviderResolveInput): Promise<void> => {
        try {
            const session = await authService.startSession(method, input);
            setState((current) => ({
                ...current,
                data: {
                    ...current.data,
                    authSession: session,
                },
            }));

            await loadOwnerGraph({
                session,
                method,
                credential: input.credential,
            });
        } catch (error) {
            setMapLoaderStage(null);
            const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion en Nostr';
            setState((current) => ({
                ...current,
                status: 'error',
                error: message,
            }));
        }
    };

    const submitNpub = async (npub: string): Promise<void> => {
        await startSession('npub', { credential: npub });
    };

    const lockSession = async (): Promise<void> => {
        const locked = await authService.lockSession();
        if (!locked) {
            return;
        }

        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                authSession: locked,
            },
        }));
    };

    const unlockSession = async (passphrase: string): Promise<void> => {
        const unlocked = await authService.unlockSession(passphrase);
        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                authSession: unlocked,
            },
        }));

        await loadOwnerGraph({ session: unlocked, method: unlocked.method });
    };

    const logoutSession = async (): Promise<void> => {
        await authService.logout();
        cancelOccupancyAnimation();
        setMapLoaderStage(null);

        setState({
            status: 'idle',
            data: createInitialData(),
        });

        if (mapBridge) {
            mapBridge.applyOccupancy({
                byBuildingIndex: {},
                selectedBuildingIndex: undefined,
            });
            mapBridge.setDialogBuildingHighlight(undefined);
        }
    };

    const regenerateMap = async (): Promise<void> => {
        if (!mapBridge) {
            return;
        }

        const current = latestStateRef.current;
        cancelOccupancyAnimation();
        setMapLoaderStage('building_map');

        try {
            if (!hasLoadedOverlayData(current.status) || !current.data.ownerPubkey) {
                await mapBridge.regenerateMap();
                return;
            }

            skipNextMapGeneratedRef.current = true;
            await mapBridge.regenerateMap();

            const buildings = mapBridge.listBuildings();
            const assignmentPubkeys = dedupe([...current.data.follows, ...current.data.featuredPubkeys]);
            const assignments = assignPubkeysToBuildings({
                pubkeys: assignmentPubkeys,
                priorityPubkeys: current.data.featuredPubkeys,
                buildingsCount: buildings.length,
                seed: current.data.ownerPubkey,
            });

            const occupancy = buildOccupancyState({
                buildingsCount: buildings.length,
                assignments: assignments.assignments,
                selectedPubkey: current.data.selectedPubkey,
            });

            await applyOccupancyProgressively({
                byBuildingIndex: occupancy.byBuildingIndex,
                selectedBuildingIndex: occupancy.selectedBuildingIndex,
            });

            if (occupancy.selectedBuildingIndex !== undefined) {
                mapBridge.focusBuilding(occupancy.selectedBuildingIndex);
            }

            setState((nextState) => {
                if (!hasLoadedOverlayData(nextState.status) || nextState.data.ownerPubkey !== current.data.ownerPubkey) {
                    return nextState;
                }

                return {
                    ...nextState,
                    data: {
                        ...nextState.data,
                        buildingsCount: buildings.length,
                        parkCount: mapBridge.getParkCount(),
                        assignments,
                        ownerBuildingIndex: resolveOwnerBuildingIndex(nextState.data.ownerPubkey, buildings.length),
                    },
                };
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo regenerar el mapa';
            setState((nextState) => ({
                ...nextState,
                status: 'error',
                error: message,
            }));
        } finally {
            skipNextMapGeneratedRef.current = false;
            setMapLoaderStage(null);
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

    const openActiveProfile = (pubkey: string, buildingIndex?: number): void => {
        if (!mapBridge || !hasLoadedOverlayData(state.status) || !pubkey) {
            return;
        }

        activeProfileLoadIdRef.current += 1;

        const occupancy = buildOccupancyState({
            buildingsCount: state.data.buildingsCount,
            assignments: state.data.assignments.assignments,
            selectedPubkey: pubkey,
        });

        mapBridge.applyOccupancy({
            byBuildingIndex: occupancy.byBuildingIndex,
            selectedBuildingIndex: occupancy.selectedBuildingIndex,
        });

        const focusIndex = buildingIndex ?? occupancy.selectedBuildingIndex;
        if (focusIndex !== undefined) {
            mapBridge.focusBuilding(focusIndex);
        }

        setState((current) => ({
            ...current,
            data: {
                ...current.data,
                selectedPubkey: pubkey,
                ...createEmptyActiveProfileState(),
                activeProfilePubkey: pubkey,
                activeProfileBuildingIndex: buildingIndex ?? occupancy.selectedBuildingIndex,
            },
        }));
    };

    const searchUsers = async (query: string): Promise<{ pubkeys: string[]; profiles: Record<string, NostrProfile> }> => {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            return {
                pubkeys: [],
                profiles: {},
            };
        }

        const current = latestStateRef.current;
        const relays = resolveOverlayRelays(current.data.relayHints);
        const client = createClient(relays);
        const cacheKeyScope = relays.join('|');
        const result = await searchUsersFn({
            query: normalizedQuery,
            client,
            limit: 20,
            cacheKeyScope,
        });

        if (Object.keys(result.profiles).length > 0) {
            setState((nextState) => ({
                ...nextState,
                data: {
                    ...nextState.data,
                    profiles: {
                        ...nextState.data.profiles,
                        ...result.profiles,
                    },
                },
            }));
        }

        return result;
    };

    const closeActiveProfileDialog = (): void => {
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
        mapLoaderStage,
        error: state.error,
        authSession: state.data.authSession,
        canWrite: isWriteEnabled(state.data.authSession),
        canEncrypt: isEncryptionEnabled(state.data.authSession),
        canDirectMessages: isDirectMessagesEnabled(state.data.authSession),
        ownerPubkey: state.data.ownerPubkey,
        ownerProfile: state.data.ownerProfile,
        ownerBuildingIndex: state.data.ownerBuildingIndex,
        follows: state.data.follows,
        alwaysVisiblePubkeys: state.data.featuredPubkeys,
        profiles: state.data.profiles,
        followers: state.data.followers,
        followerProfiles: state.data.followerProfiles,
        followersLoading: state.data.followersLoading,
        selectedPubkey: state.data.selectedPubkey,
        suggestedRelays: state.data.suggestedRelays,
        suggestedRelaysByType: state.data.suggestedRelaysByType,
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
        followersCount: state.data.followers.length,
        buildingsCount: state.data.buildingsCount,
        parkCount: state.data.parkCount,
        unassignedCount: state.data.assignments.unassignedPubkeys.length,
        assignedCount,
        occupancyByBuildingIndex: state.data.assignments.byBuildingIndex,
        startSession,
        lockSession,
        unlockSession,
        logoutSession,
        writeGateway,
        directMessages,
        submitNpub,
        regenerateMap,
        searchUsers,
        selectFollowing,
        openActiveProfile,
        closeActiveProfileDialog,
        loadMoreActiveProfilePosts,
    };
}
