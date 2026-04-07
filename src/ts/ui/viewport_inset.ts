interface ViewportInsetRegenerationInput {
    tensorFieldVisible: boolean;
    roadsEmpty: boolean;
}

export function shouldRegenerateMapOnViewportInsetChange(_input: ViewportInsetRegenerationInput): boolean {
    return false;
}
