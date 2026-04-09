import type { SessionCapabilities } from '../../session';

export interface Nip46Permission {
    method: string;
    constraint?: string;
}

function normalizePermissionToken(token: string): string {
    return token.trim();
}

export function parseNip46Permissions(tokens: string[]): Nip46Permission[] {
    return tokens
        .map((token) => normalizePermissionToken(token))
        .filter((token) => token.length > 0)
        .map((token) => {
            const separatorIndex = token.indexOf(':');
            if (separatorIndex === -1) {
                return {
                    method: token,
                    constraint: undefined,
                };
            }

            const method = token.slice(0, separatorIndex).trim();
            const constraint = token.slice(separatorIndex + 1).trim();
            return {
                method,
                constraint: constraint.length > 0 ? constraint : undefined,
            };
        });
}

export function isNip46CallAllowed(
    permissions: Nip46Permission[],
    method: string,
    constraint?: string
): boolean {
    if (permissions.length === 0) {
        return true;
    }

    return permissions.some((permission) => {
        if (permission.method !== method) {
            return false;
        }

        if (!permission.constraint) {
            return true;
        }

        return permission.constraint === constraint;
    });
}

export function capabilitiesFromNip46Permissions(tokens: string[]): SessionCapabilities {
    if (tokens.length === 0) {
        return {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip04', 'nip44'],
        };
    }

    const permissions = parseNip46Permissions(tokens);

    const hasSignEvent = permissions.some((permission) => permission.method === 'sign_event');
    const hasNip04Encrypt = permissions.some((permission) => permission.method === 'nip04_encrypt');
    const hasNip04Decrypt = permissions.some((permission) => permission.method === 'nip04_decrypt');
    const hasNip44Encrypt = permissions.some((permission) => permission.method === 'nip44_encrypt');
    const hasNip44Decrypt = permissions.some((permission) => permission.method === 'nip44_decrypt');

    const encryptionSchemes: Array<'nip04' | 'nip44'> = [];
    if (hasNip04Encrypt && hasNip04Decrypt) {
        encryptionSchemes.push('nip04');
    }
    if (hasNip44Encrypt && hasNip44Decrypt) {
        encryptionSchemes.push('nip44');
    }

    return {
        canSign: hasSignEvent,
        canEncrypt: encryptionSchemes.length > 0,
        encryptionSchemes,
    };
}
