export interface MapFirstStartupOptions {
    closeTensorFolder: () => void;
    generateMap: () => Promise<void> | void;
    shouldGenerateMap?: boolean;
}

export async function applyMapFirstStartup(options: MapFirstStartupOptions): Promise<void> {
    options.closeTensorFolder();
    if (options.shouldGenerateMap === false) {
        return;
    }

    await Promise.resolve(options.generateMap());
}

export function shouldShowTensorField(tensorFolderClosed: boolean): boolean {
    return !tensorFolderClosed;
}
