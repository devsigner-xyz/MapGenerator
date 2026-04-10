import cryptoAnarchistManifestoText from './content/crypto-anarchist-manifesto.txt?raw';
import declarationOfCyberspaceText from './content/declaration-of-independence-of-cyberspace.txt?raw';
import { EASTER_EGG_IDS, type EasterEggId } from '../../ts/ui/easter_eggs';

interface EasterEggEntryBase {
    id: EasterEggId;
    title: string;
    sourceUrl: string;
}

export interface PdfEasterEggEntry extends EasterEggEntryBase {
    kind: 'pdf';
    pdfPath: string;
    downloadFileName: string;
}

export interface TextEasterEggEntry extends EasterEggEntryBase {
    kind: 'text';
    text: string;
}

export type EasterEggEntry = PdfEasterEggEntry | TextEasterEggEntry;

export { EASTER_EGG_IDS };

export const EASTER_EGG_CATALOG: Record<EasterEggId, EasterEggEntry> = {
    bitcoin_whitepaper: {
        id: 'bitcoin_whitepaper',
        kind: 'pdf',
        title: 'Bitcoin: A Peer-to-Peer Electronic Cash System',
        sourceUrl: 'https://bitcoin.org/bitcoin.pdf',
        pdfPath: '/easter-eggs/bitcoin.pdf',
        downloadFileName: 'bitcoin.pdf',
    },
    crypto_anarchist_manifesto: {
        id: 'crypto_anarchist_manifesto',
        kind: 'text',
        title: 'The Crypto Anarchist Manifesto',
        sourceUrl: 'https://nakamotoinstitute.org/library/crypto-anarchist-manifesto/',
        text: cryptoAnarchistManifestoText,
    },
    cyberspace_independence: {
        id: 'cyberspace_independence',
        kind: 'text',
        title: 'A Declaration of the Independence of Cyberspace',
        sourceUrl: 'https://en.wikisource.org/wiki/A_Declaration_of_the_Independence_of_Cyberspace',
        text: declarationOfCyberspaceText,
    },
};

export function getEasterEggEntry(id: EasterEggId): EasterEggEntry {
    return EASTER_EGG_CATALOG[id];
}
