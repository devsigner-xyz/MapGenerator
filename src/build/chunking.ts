function isNodeModuleId(id: string): boolean {
    return id.includes('/node_modules/');
}

function isNostrDependency(id: string): boolean {
    return id.includes('/@nostr-dev-kit/') || id.includes('/nostr-tools/');
}

function isThreeStlDependency(id: string): boolean {
    return id.includes('/three/')
        || id.includes('/three-csg-ts/')
        || id.includes('/threejs-export-stl/')
        || id.includes('/jsts/');
}

export function resolveManualChunk(id: string): string | undefined {
    if (!isNodeModuleId(id) && !id.includes('/src/nostr-overlay/')) {
        return undefined;
    }

    if (isNostrDependency(id)) {
        return 'nostr';
    }

    if (isThreeStlDependency(id)) {
        return 'three-stl';
    }

    if (id.includes('/src/nostr-overlay/')) {
        return 'overlay';
    }

    return undefined;
}
