import type { EasterEggId } from '../../ts/ui/easter_eggs';
import type { AppMessageKey } from '../../i18n/catalog';

export interface EasterEggMission {
    id: EasterEggId;
    titleKey: AppMessageKey;
    subtitleKey: AppMessageKey;
}

export const EASTER_EGG_MISSIONS: EasterEggMission[] = [
    {
        id: 'bitcoin_whitepaper',
        titleKey: 'discover.mission.bitcoinWhitepaper.title',
        subtitleKey: 'discover.mission.bitcoinWhitepaper.subtitle',
    },
    {
        id: 'crypto_anarchist_manifesto',
        titleKey: 'discover.mission.cryptoAnarchistManifesto.title',
        subtitleKey: 'discover.mission.cryptoAnarchistManifesto.subtitle',
    },
    {
        id: 'cyberspace_independence',
        titleKey: 'discover.mission.cyberspaceIndependence.title',
        subtitleKey: 'discover.mission.cyberspaceIndependence.subtitle',
    },
];
