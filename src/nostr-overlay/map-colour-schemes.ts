export const NOSTR_CITY_LIGHT_MAP_PRESET = 'Nostr City Light';
export const NOSTR_CITY_DARK_MAP_PRESET = 'Nostr City Dark';

export function resolveNostrCityMapPreset(theme: 'light' | 'dark'): string {
    return theme === 'dark' ? NOSTR_CITY_DARK_MAP_PRESET : NOSTR_CITY_LIGHT_MAP_PRESET;
}
