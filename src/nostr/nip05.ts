export interface ParsedNip05Identifier {
    name: string;
    domain: string;
    normalized: string;
    display: string;
}

export type Nip05ValidationStatus = 'verified' | 'unverified' | 'error';

export interface Nip05ValidationResult {
    status: Nip05ValidationStatus;
    identifier: string;
    displayIdentifier?: string;
    resolvedPubkey?: string;
    error?: string;
    checkedAt: number;
}

export function parseNip05Identifier(value: string | undefined): ParsedNip05Identifier | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) {
        return null;
    }

    const pieces = raw.split('@');
    if (pieces.length !== 2) {
        return null;
    }

    const rawName = pieces[0]?.trim();
    const rawDomain = pieces[1]?.trim().toLowerCase();
    if (!rawName || !rawDomain) {
        return null;
    }

    if (!/^[a-z0-9._-]+$/i.test(rawName)) {
        return null;
    }

    if (!/^[a-z0-9.-]+$/i.test(rawDomain) || !rawDomain.includes('.')) {
        return null;
    }

    const name = rawName.toLowerCase();
    const normalized = `${name}@${rawDomain}`;

    return {
        name,
        domain: rawDomain,
        normalized,
        display: name === '_' ? rawDomain : normalized,
    };
}

export function getNip05DisplayIdentifier(value: string | undefined): string | undefined {
    return parseNip05Identifier(value)?.display;
}
