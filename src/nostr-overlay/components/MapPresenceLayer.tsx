import { useEffect, useMemo, useState } from 'react';
import type { NostrProfile } from '../../nostr/types';
import type { MapBridge, MapBuildingSlot } from '../map-bridge';

interface MapPresenceLayerProps {
    mapBridge: MapBridge | null;
    occupancyByBuildingIndex: Record<number, string>;
    profiles: Record<string, NostrProfile>;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    ownerBuildingIndex?: number;
    occupiedLabelsZoomLevel: number;
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return profile?.displayName ?? profile?.name ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function resolveInitials(pubkey: string, profile?: NostrProfile): string {
    return resolveName(pubkey, profile).slice(0, 2).toUpperCase();
}

export function MapPresenceLayer({
    mapBridge,
    occupancyByBuildingIndex,
    profiles,
    ownerPubkey,
    ownerProfile,
    ownerBuildingIndex,
    occupiedLabelsZoomLevel,
}: MapPresenceLayerProps) {
    const [buildings, setBuildings] = useState<MapBuildingSlot[]>([]);
    const [zoom, setZoom] = useState(0);
    const [insetLeft, setInsetLeft] = useState(0);
    const [, setViewVersion] = useState(0);

    useEffect(() => {
        if (!mapBridge) {
            setBuildings([]);
            setZoom(0);
            setInsetLeft(0);
            return;
        }

        const refreshBuildings = (): void => {
            setBuildings(mapBridge.listBuildings());
        };

        const refreshView = (): void => {
            setZoom(mapBridge.getZoom());
            setInsetLeft(mapBridge.getViewportInsetLeft());
            setViewVersion((current) => current + 1);
        };

        refreshBuildings();
        refreshView();

        const offMapGenerated = mapBridge.onMapGenerated(() => {
            refreshBuildings();
            refreshView();
        });
        const offViewChanged = mapBridge.onViewChanged(refreshView);

        return () => {
            offMapGenerated();
            offViewChanged();
        };
    }, [mapBridge]);

    const buildingsByIndex = useMemo(() => {
        const byIndex: Record<number, MapBuildingSlot> = {};
        for (const building of buildings) {
            byIndex[building.index] = building;
        }
        return byIndex;
    }, [buildings]);

    if (!mapBridge) {
        return null;
    }

    const showOccupiedLabels = zoom >= occupiedLabelsZoomLevel;
    const occupiedEntries = showOccupiedLabels
        ? Object.entries(occupancyByBuildingIndex)
        : [];

    const ownerBuilding = ownerBuildingIndex === undefined ? undefined : buildingsByIndex[ownerBuildingIndex];
    const ownerPosition = ownerBuilding
        ? mapBridge.worldToScreen(ownerBuilding.centroid)
        : null;

    return (
        <div className="nostr-map-presence-layer" aria-hidden="true">
            {occupiedEntries.map(([indexKey, pubkey]) => {
                const index = Number(indexKey);
                const building = buildingsByIndex[index];
                if (!building) {
                    return null;
                }

                const profile = profiles[pubkey];
                const position = mapBridge.worldToScreen(building.centroid);

                return (
                    <div
                        key={`${pubkey}-${index}`}
                        className="nostr-map-occupant-tag"
                        style={{
                            left: `${position.x + insetLeft}px`,
                            top: `${position.y}px`,
                        }}
                    >
                        {profile?.picture ? (
                            <img className="nostr-map-occupant-avatar" src={profile.picture} alt="" />
                        ) : (
                            <span className="nostr-map-occupant-avatar nostr-map-occupant-avatar-fallback">
                                {resolveInitials(pubkey, profile)}
                            </span>
                        )}

                        <span className="nostr-map-occupant-name">{resolveName(pubkey, profile)}</span>
                    </div>
                );
            })}

            {ownerPosition && ownerPubkey ? (
                <div
                    className="nostr-map-owner-tooltip"
                    style={{
                        left: `${ownerPosition.x + insetLeft}px`,
                        top: `${ownerPosition.y}px`,
                    }}
                >
                    <span className="nostr-map-owner-headline">
                        {ownerProfile?.picture ? (
                            <img className="nostr-map-owner-avatar" src={ownerProfile.picture} alt="" />
                        ) : (
                            <span className="nostr-map-owner-avatar nostr-map-owner-avatar-fallback">
                                {resolveInitials(ownerPubkey, ownerProfile)}
                            </span>
                        )}
                        <span className="nostr-map-owner-badge">You are here</span>
                    </span>
                    <span className="nostr-map-owner-name">{resolveName(ownerPubkey, ownerProfile)}</span>
                </div>
            ) : null}
        </div>
    );
}
