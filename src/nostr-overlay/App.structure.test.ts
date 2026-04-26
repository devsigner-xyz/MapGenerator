import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(join(process.cwd(), 'src/nostr-overlay/App.tsx'), 'utf8');
const overlayRoutesSource = readFileSync(join(process.cwd(), 'src/nostr-overlay/routes/OverlayRoutes.tsx'), 'utf8');
const overlayDialogLayerSource = readFileSync(join(process.cwd(), 'src/nostr-overlay/shell/OverlayDialogLayer.tsx'), 'utf8');

const appExtractedModulePaths = [
    './shell/OverlayAppShell',
    './shell/use-overlay-route-state',
    './shell/OverlaySidebarLayer',
    './shell/OverlayDialogLayer',
    './shell/OverlayMapInteractionLayer',
    './hooks/useEasterEggDiscoveryController',
    './controllers/use-wallet-zap-controller',
    './app.selectors',
    './routes/OverlayRoutes',
];

const extractedRouteModulePaths = [
    './AgoraRouteContainer',
    './ChatsRouteContainer',
    './WalletRouteContainer',
    './NotificationsRouteContainer',
    './CityStatsRouteContainer',
    './UserSearchRouteContainer',
    './DiscoverRouteContainer',
    './SettingsRouteContainer',
];

const movedHelperNames = [
    'OverlayAppShell',
    'OverlaySidebarLayer',
    'OverlayDialogLayer',
    'ActiveProfileDialogContainer',
    'OverlayMapInteractionLayer',
    'OccupiedBuildingContextMenuState',
    'encodePubkeyAsNpub',
    'useOverlayRouteState',
    'normalizeHashtag',
    'activeAgoraHashtagFromLocation',
    'useMapBridgeController',
    'useEasterEggDiscoveryController',
    'useWalletZapController',
    'connectWebLnWallet',
    'connectNwcWallet',
    'executeZapIntent',
    'handleZapIntent',
    'fetchNwcInfo',
    'withNwcClient',
    'isWalletReadyForPayments',
    'applyOptimisticZapMetrics',
    'selectRelaySetKey',
    'selectDiscoveredMissionsCount',
    'selectPostEventIds',
    'selectEngagementWithFallback',
    'selectOptimisticZapBaseByEventId',
    'pruneCaughtUpOptimisticZapEntries',
    'addOptimisticZapEntry',
    'selectVerificationProfilesByPubkey',
    'selectRichContentProfilesByPubkey',
    'selectVerificationTargetPubkeys',
    'selectVerifiedBuildingIndexes',
    'selectChatConversationSummaries',
    'selectChatDetailMessages',
    'selectMapLoaderStageLabel',
    'OverlayRoutes',
    'AgoraRouteContainer',
    'ChatsRouteContainer',
    'WalletRouteContainer',
    'NotificationsRouteContainer',
    'CityStatsRouteContainer',
    'UserSearchRouteContainer',
    'DiscoverRouteContainer',
    'SettingsRouteContainer',
];

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function importedModulePaths(source: string): string[] {
    return [...source.matchAll(/\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?/g)]
        .map((match) => match[1])
        .filter((modulePath): modulePath is string => Boolean(modulePath));
}

function inlineDefinitionPatternsFor(helperName: string): RegExp[] {
    const escapedName = escapeRegExp(helperName);
    return [
        new RegExp(`\\bfunction\\s+${escapedName}\\s*\\(`),
        new RegExp(`\\b(?:const|let|var)\\s+${escapedName}\\s*(?::[^=]+)?=`),
    ];
}

describe('Nostr overlay App shell structure', () => {
    it('imports the extracted shell modules used to keep App focused on wiring', () => {
        expect(importedModulePaths(appSource)).toEqual(expect.arrayContaining(appExtractedModulePaths));
    });

    it('keeps extracted route containers behind OverlayRoutes', () => {
        expect(importedModulePaths(overlayRoutesSource)).toEqual(expect.arrayContaining(extractedRouteModulePaths));
    });

    it('keeps active profile dialog mapping behind the dialog layer', () => {
        expect(importedModulePaths(overlayDialogLayerSource)).toContain('./ActiveProfileDialogContainer');
    });

    it('does not redefine helpers that belong to extracted shell modules', () => {
        for (const helperName of movedHelperNames) {
            for (const pattern of inlineDefinitionPatternsFor(helperName)) {
                expect(appSource).not.toMatch(pattern);
            }
        }
    });

    it('delegates map interaction UI to the extracted map layer', () => {
        expect(appSource).toMatch(/<OverlayMapInteractionLayer\b/);
        expect(appSource).not.toMatch(/<MapZoomControls\b/);
        expect(appSource).not.toMatch(/<MapDisplayToggleControls\b/);
        expect(appSource).not.toMatch(/onOccupiedBuildingContextMenu/);
        expect(appSource).not.toMatch(/onSpecialBuildingClick/);
    });

    it('delegates sidebar and dialog UI to extracted layers', () => {
        expect(appSource).toMatch(/<OverlaySidebarLayer\b/);
        expect(appSource).toMatch(/<OverlayDialogLayer\b/);
        expect(appSource).not.toMatch(/<SocialSidebar\b/);
        expect(appSource).not.toMatch(/<OverlaySidebar\b/);
        expect(appSource).not.toMatch(/<OccupantProfileDialog\b/);
        expect(appSource).not.toMatch(/<SocialComposeDialog\b/);
        expect(appSource).not.toMatch(/<LoginGateScreen\b/);
        expect(appSource).not.toMatch(/<MapPresenceLayer\b/);
        expect(appSource).not.toMatch(/<UiSettingsDialog\b/);
    });

    it('does not own the route tree inline', () => {
        expect(appSource).not.toMatch(/\bimport\s+\{[^}]*\bRoutes\b/);
        expect(appSource).not.toMatch(/\bimport\s+\{[^}]*\bRoute\b/);
        expect(appSource).not.toMatch(/\b<Route\b/);
    });
});
