export interface NotificationsQuery {
  ownerPubkey: string;
  limit: number;
  since: number;
}

export interface NotificationsStreamQuery {
  ownerPubkey: string;
  since?: number;
}

export interface NotificationEventDto {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  content: string;
  tags: string[][];
}

export interface NotificationItemDto {
  id: string;
  kind: number;
  actorPubkey: string;
  createdAt: number;
  targetEventId: string | null;
  targetPubkey: string | null;
  rawEvent: NotificationEventDto;
}

export interface NotificationsResponseDto {
  items: NotificationItemDto[];
  hasMore: boolean;
  nextSince: number | null;
}

const LOWER_HEX_64_PATTERN = '^[0-9a-f]{64}$';

export const notificationsQuerySchema = {
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

export const notificationsStreamQuerySchema = {
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

const notificationEventSchema = {
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

const notificationItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'kind',
    'actorPubkey',
    'createdAt',
    'targetEventId',
    'targetPubkey',
    'rawEvent',
  ],
  properties: {
    id: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    kind: {
      type: 'integer',
      minimum: 0,
    },
    actorPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    createdAt: {
      type: 'integer',
      minimum: 0,
    },
    targetEventId: {
      type: ['string', 'null'],
      pattern: LOWER_HEX_64_PATTERN,
    },
    targetPubkey: {
      type: ['string', 'null'],
      pattern: LOWER_HEX_64_PATTERN,
    },
    rawEvent: notificationEventSchema,
  },
} as const;

export const notificationsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'hasMore', 'nextSince'],
  properties: {
    items: {
      type: 'array',
      items: notificationItemSchema,
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
