export interface ContentPostsQuery {
  ownerPubkey: string;
  pubkey: string;
  limit: number;
  until?: number;
}

export interface ContentPostDto {
  id: string;
  pubkey: string;
  createdAt: number;
  content: string;
}

export interface ContentPostsResponseDto {
  posts: ContentPostDto[];
  nextUntil: number | null;
  hasMore: boolean;
}

export interface ProfileStatsQuery {
  ownerPubkey: string;
  pubkey: string;
  candidateAuthors?: string;
}

export interface ProfileStatsBody {
  ownerPubkey: string;
  pubkey: string;
  candidateAuthors?: string[];
}

export interface ProfileStatsResponseDto {
  followsCount: number;
  followersCount: number;
}

const LOWER_HEX_64_PATTERN = '^[0-9a-f]{64}$';

export const contentPostsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'pubkey', 'limit'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    until: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

const contentPostSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'pubkey', 'createdAt', 'content'],
  properties: {
    id: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    createdAt: {
      type: 'integer',
      minimum: 0,
    },
    content: {
      type: 'string',
    },
  },
} as const;

export const contentPostsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['posts', 'nextUntil', 'hasMore'],
  properties: {
    posts: {
      type: 'array',
      items: contentPostSchema,
    },
    nextUntil: {
      type: ['integer', 'null'],
      minimum: 0,
    },
    hasMore: {
      type: 'boolean',
    },
  },
} as const;

export const profileStatsQuerySchema = {
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

export const profileStatsBodySchema = {
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
  },
} as const;

export const profileStatsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['followsCount', 'followersCount'],
  properties: {
    followsCount: {
      type: 'integer',
      minimum: 0,
    },
    followersCount: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;
