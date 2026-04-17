import type { SignedNostrEvent } from '../../nostr/event-verify';

export const relayScopes = ['social', 'dm'] as const;

export type RelayScope = (typeof relayScopes)[number];

export interface PublishForwardRequestDto {
  event: SignedNostrEvent;
  relayScope: RelayScope;
  relays: string[];
}

export interface PublishForwardFailure {
  relay: string;
  reason: string;
}

export interface PublishForwardResponseDto {
  ackedRelays: string[];
  failedRelays: PublishForwardFailure[];
  timeoutRelays: string[];
}

export const publishForwardBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['event', 'relayScope', 'relays'],
  properties: {
    event: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig'],
      properties: {
        id: {
          type: 'string',
          pattern: '^[0-9a-f]{64}$',
          minLength: 64,
          maxLength: 64,
        },
        pubkey: {
          type: 'string',
          pattern: '^[0-9a-f]{64}$',
          minLength: 64,
          maxLength: 64,
        },
        created_at: {
          type: 'integer',
          minimum: 0,
        },
        kind: {
          type: 'integer',
          minimum: 0,
        },
        tags: {
          type: 'array',
          maxItems: 128,
          items: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'string',
              maxLength: 512,
            },
          },
        },
        content: {
          type: 'string',
          maxLength: 32768,
        },
        sig: {
          type: 'string',
          pattern: '^[0-9a-f]{128}$',
          minLength: 128,
          maxLength: 128,
        },
      },
    },
    relayScope: {
      type: 'string',
      enum: relayScopes,
    },
    relays: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 2048,
      },
    },
  },
} as const;

export const publishForwardResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ackedRelays', 'failedRelays', 'timeoutRelays'],
  properties: {
    ackedRelays: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    failedRelays: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['relay', 'reason'],
        properties: {
          relay: {
            type: 'string',
          },
          reason: {
            type: 'string',
          },
        },
      },
    },
    timeoutRelays: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
} as const;
