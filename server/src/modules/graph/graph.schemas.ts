export interface GraphFollowsQuery {
  ownerPubkey: string;
  pubkey: string;
}

export interface GraphFollowersQuery {
  ownerPubkey: string;
  pubkey: string;
  candidateAuthors?: string;
}

export interface GraphFollowsResponseDto {
  pubkey: string;
  follows: string[];
  relayHints: string[];
}

export interface GraphFollowersResponseDto {
  pubkey: string;
  followers: string[];
  complete: boolean;
}

const LOWER_HEX_64_PATTERN = '^[0-9a-f]{64}$';

export const graphFollowsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'pubkey'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
  },
} as const;

export const graphFollowersQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'pubkey'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    candidateAuthors: {
      type: 'string',
      maxLength: 50_000,
    },
  },
} as const;

export const graphFollowsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pubkey', 'follows', 'relayHints'],
  properties: {
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    follows: {
      type: 'array',
      items: {
        type: 'string',
        pattern: LOWER_HEX_64_PATTERN,
      },
    },
    relayHints: {
      type: 'array',
      items: {
        type: 'string',
        maxLength: 2048,
      },
    },
  },
} as const;

export const graphFollowersResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pubkey', 'followers', 'complete'],
  properties: {
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    followers: {
      type: 'array',
      items: {
        type: 'string',
        pattern: LOWER_HEX_64_PATTERN,
      },
    },
    complete: {
      type: 'boolean',
    },
  },
} as const;
