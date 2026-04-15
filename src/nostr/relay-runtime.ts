import { getBootstrapRelays, mergeRelaySets } from './relay-policy';
import { getRelaySetByType, loadRelaySettings, type RelaySettingsState } from './relay-settings';

export interface ConservativeRelayResolution {
    primary: string[];
    fallback: string[];
}

interface LoadSettingsInput {
    ownerPubkey?: string;
}

interface ResolveConservativeSocialRelaySetsInput {
    ownerPubkey?: string;
    loadSettings?: (input?: LoadSettingsInput) => RelaySettingsState;
    bootstrapRelays?: string[];
    additionalReadRelays?: string[];
}

export function normalizeRelaySet(relays: string[]): string[] {
    return mergeRelaySets(relays).sort((left, right) => left.localeCompare(right));
}

export function buildRelaySetKey(relays: string[]): string {
    return normalizeRelaySet(relays).join('|');
}

export function hasSameRelaySet(left: string[], right: string[]): boolean {
    return buildRelaySetKey(left) === buildRelaySetKey(right);
}

function resolvePrimarySocialRelays(state: RelaySettingsState, additionalReadRelays: string[] = []): string[] {
    const protocolRelays = mergeRelaySets(
        getRelaySetByType(state, 'nip65Both'),
        getRelaySetByType(state, 'nip65Read')
    );
    const primaryRelays = protocolRelays.length > 0 ? protocolRelays : state.relays;
    const mergedPrimary = mergeRelaySets(primaryRelays, additionalReadRelays);
    return normalizeRelaySet(mergedPrimary);
}

export function resolveConservativeSocialRelaySets(
    input: ResolveConservativeSocialRelaySetsInput = {}
): ConservativeRelayResolution {
    const loadSettings = input.loadSettings ?? loadRelaySettings;
    const bootstrapRelays = normalizeRelaySet(input.bootstrapRelays ?? getBootstrapRelays());
    const state = loadSettings({ ownerPubkey: input.ownerPubkey });
    const primaryCandidate = resolvePrimarySocialRelays(state, input.additionalReadRelays ?? []);
    const primary = primaryCandidate.length > 0 ? primaryCandidate : bootstrapRelays;
    const fallback = hasSameRelaySet(primary, bootstrapRelays) ? [] : bootstrapRelays;

    return {
        primary,
        fallback,
    };
}
