export interface DmInboxQuery {
  ownerPubkey: string;
  limit: number;
  since: number;
}

export interface DmConversationQuery {
  ownerPubkey: string;
  peerPubkey: string;
  limit: number;
  since: number;
}

export interface DmStreamQuery {
  ownerPubkey: string;
  since?: number;
}

export interface DmEventDto {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  content: string;
  tags: string[][];
}

export interface DmEventsResponseDto {
  items: DmEventDto[];
  hasMore: boolean;
  nextSince: number | null;
}

const LOWER_HEX_64_PATTERN = '^[0-9a-f]{64}$';

export const dmInboxQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'limit', 'since'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    since: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const dmConversationQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'peerPubkey', 'limit', 'since'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    peerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    since: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const dmStreamQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    since: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const dmEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'pubkey', 'kind', 'createdAt', 'content', 'tags'],
  properties: {
    id: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    kind: {
      type: 'integer',
      minimum: 0,
    },
    createdAt: {
      type: 'integer',
      minimum: 0,
    },
    content: {
      type: 'string',
    },
    tags: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
  },
} as const;

export const dmEventsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'hasMore', 'nextSince'],
  properties: {
    items: {
      type: 'array',
      items: dmEventSchema,
    },
    hasMore: {
      type: 'boolean',
    },
    nextSince: {
      type: ['integer', 'null'],
      minimum: 0,
    },
  },
} as const;
