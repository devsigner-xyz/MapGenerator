import type { EasterEggId } from '../../ts/ui/easter_eggs';

export interface EasterEggMission {
    id: EasterEggId;
    label: string;
}

export const EASTER_EGG_MISSIONS: EasterEggMission[] = [
    {
        id: 'bitcoin_whitepaper',
        label: 'Encuentra Bitcoin whitepaper',
    },
    {
        id: 'crypto_anarchist_manifesto',
        label: 'Encuentra manifiesto cripto anarquista',
    },
    {
        id: 'cyberspace_independence',
        label: 'Encuentra declaración de independencia del ciberespacio',
    },
];
