import type { MapGenerationOptions } from '../../map-generation-options';

export interface MapFirstStartupOptions {
    closeTensorFolder: () => void;
    generateMap: (options?: MapGenerationOptions) => Promise<void> | void;
    shouldGenerateMap?: boolean;
    initialGenerationOptions?: MapGenerationOptions;
}

export async function applyMapFirstStartup(options: MapFirstStartupOptions): Promise<void> {
    options.closeTensorFolder();
    if (options.shouldGenerateMap === false) {
        return;
    }

    await Promise.resolve(
        options.initialGenerationOptions === undefined
            ? options.generateMap()
            : options.generateMap(options.initialGenerationOptions)
    );
}

export function shouldShowTensorField(tensorFolderClosed: boolean): boolean {
    return !tensorFolderClosed;
}
