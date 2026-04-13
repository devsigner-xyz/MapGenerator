import { useQuery } from '@tanstack/react-query';
import type { NostrProfile } from '../../nostr/types';
import { nostrOverlayQueryKeys } from './keys';

export interface SearchUsersResult {
    pubkeys: string[];
    profiles: Record<string, NostrProfile>;
}

interface UseUserSearchQueryInput {
    term: string;
    enabled: boolean;
    onSearch: (query: string) => Promise<SearchUsersResult>;
}

interface UserSearchQueryState {
    normalizedTerm: string;
    hasQuery: boolean;
    result: SearchUsersResult;
    isLoading: boolean;
    error: string | null;
}

const EMPTY_RESULT: SearchUsersResult = {
    pubkeys: [],
    profiles: {},
};

function normalizeTerm(term: string): string {
    return term.trim();
}

export function useUserSearchQuery(input: UseUserSearchQueryInput): UserSearchQueryState {
    const normalizedTerm = normalizeTerm(input.term);
    const hasQuery = normalizedTerm.length > 0;

    const query = useQuery<SearchUsersResult, Error, SearchUsersResult, ReturnType<typeof nostrOverlayQueryKeys.userSearch>>({
        queryKey: nostrOverlayQueryKeys.userSearch({ term: normalizedTerm }),
        queryFn: async () => {
            if (!hasQuery) {
                return EMPTY_RESULT;
            }

            return input.onSearch(normalizedTerm);
        },
        enabled: input.enabled && hasQuery,
    });

    return {
        normalizedTerm,
        hasQuery,
        result: query.data ?? EMPTY_RESULT,
        isLoading: hasQuery && query.isPending,
        error: hasQuery && query.error ? 'No se pudo buscar usuarios.' : null,
    };
}
