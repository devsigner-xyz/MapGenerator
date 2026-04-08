import type { NostrProfile } from '../../nostr/types';
import type { MapBuildingSlot, WorldPoint } from '../map-bridge';

export interface PresenceLayerEntry {
    key: string;
    pubkey: string;
    index: number;
    centroid: WorldPoint;
    displayName?: string;
    initials: string;
    picture?: string;
}

export interface BuildPresenceLayerEntriesInput {
    occupancyByBuildingIndex: Record<number, string>;
    profiles: Record<string, NostrProfile>;
    buildingsByIndex: Record<number, MapBuildingSlot>;
    zoom: number;
    occupiedLabelsZoomLevel: number;
    alwaysVisiblePubkeys: string[];
}

function sanitizeLabel(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function resolveDisplayName(profile?: NostrProfile): string | undefined {
    return sanitizeLabel(profile?.displayName) ?? sanitizeLabel(profile?.name);
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return resolveDisplayName(profile) ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function resolveInitials(pubkey: string, profile?: NostrProfile): string {
    return resolveName(pubkey, profile).slice(0, 2).toUpperCase();
}

export function buildPresenceLayerEntries(input: BuildPresenceLayerEntriesInput): PresenceLayerEntry[] {
    const showOccupiedLabels = input.zoom >= input.occupiedLabelsZoomLevel;
    const alwaysVisiblePubkeys = new Set(input.alwaysVisiblePubkeys);
    const entries: PresenceLayerEntry[] = [];

    const occupancyEntries = Object.entries(input.occupancyByBuildingIndex)
        .map(([indexKey, pubkey]) => ({
            index: Number(indexKey),
            pubkey,
        }))
        .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0)
        .sort((left, right) => left.index - right.index);

    for (const occupancyEntry of occupancyEntries) {
        if (!showOccupiedLabels && !alwaysVisiblePubkeys.has(occupancyEntry.pubkey)) {
            continue;
        }

        const building = input.buildingsByIndex[occupancyEntry.index];
        if (!building) {
            continue;
        }

        const profile = input.profiles[occupancyEntry.pubkey];
        entries.push({
            key: `${occupancyEntry.pubkey}-${occupancyEntry.index}`,
            pubkey: occupancyEntry.pubkey,
            index: occupancyEntry.index,
            centroid: building.centroid,
            displayName: resolveDisplayName(profile),
            initials: resolveInitials(occupancyEntry.pubkey, profile),
            picture: profile?.picture,
        });
    }

    return entries;
}

export function isPointWithinViewport(input: {
    point: WorldPoint;
    viewportWidth: number;
    viewportHeight: number;
    marginPx?: number;
}): boolean {
    const margin = Math.max(0, input.marginPx ?? 0);

    return input.point.x >= -margin
        && input.point.y >= -margin
        && input.point.x <= (input.viewportWidth + margin)
        && input.point.y <= (input.viewportHeight + margin);
}
