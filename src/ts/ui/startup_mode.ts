export interface MapFirstStartupOptions {
    closeTensorFolder: () => void;
    generateMap: () => Promise<void> | void;
}

export async function applyMapFirstStartup(options: MapFirstStartupOptions): Promise<void> {
    options.closeTensorFolder();
    await Promise.resolve(options.generateMap());
}

export function shouldShowTensorField(tensorFolderClosed: boolean): boolean {
    return !tensorFolderClosed;
}
