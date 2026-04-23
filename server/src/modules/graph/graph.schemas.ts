import { SCOPED_READ_RELAY_PATTERN } from '../../relay/request-scoped-relays';

export interface GraphFollowsQuery {
  ownerPubkey: string;
  pubkey: string;
  scopedReadRelays?: string | string[];
}

export interface GraphFollowersQuery {
  ownerPubkey: string;
  pubkey: string;
  candidateAuthors?: string;
  scopedReadRelays?: string | string[];
}

export interface GraphFollowersBody {
  ownerPubkey: string;
  pubkey: string;
  candidateAuthors?: string[];
  scopedReadRelays?: string[];
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
    scopedReadRelays: {
      anyOf: [
        {
          type: 'string',
          pattern: SCOPED_READ_RELAY_PATTERN,
          maxLength: 2048,
        },
        {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'string',
            pattern: SCOPED_READ_RELAY_PATTERN,
            maxLength: 2048,
          },
        },
      ],
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
    scopedReadRelays: {
      anyOf: [
        {
          type: 'string',
          pattern: SCOPED_READ_RELAY_PATTERN,
          maxLength: 2048,
        },
        {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'string',
            pattern: SCOPED_READ_RELAY_PATTERN,
            maxLength: 2048,
          },
        },
      ],
    },
  },
} as const;

export const graphFollowersBodySchema = {
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
      type: 'array',
      maxItems: 2_000,
      items: {
        type: 'string',
        pattern: LOWER_HEX_64_PATTERN,
      },
    },
    scopedReadRelays: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'string',
        pattern: SCOPED_READ_RELAY_PATTERN,
        maxLength: 2048,
      },
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
