export interface Nip05BatchCheckDto {
  pubkey: string;
  nip05: string;
}

export type Nip05VerificationStatus = 'verified' | 'unverified' | 'error';

export interface Nip05BatchResultDto {
  pubkey: string;
  nip05: string;
  status: Nip05VerificationStatus;
  identifier: string;
  displayIdentifier?: string;
  resolvedPubkey?: string;
  error?: string;
  checkedAt: number;
}

export interface Nip05VerifyBatchRequestDto {
  ownerPubkey: string;
  checks: Nip05BatchCheckDto[];
  timeoutMs?: number;
}

export interface Nip05VerifyBatchResponseDto {
  results: Nip05BatchResultDto[];
}

export interface ProfilesResolveRequestDto {
  ownerPubkey: string;
  pubkeys: string[];
}

export interface IdentityProfileDto {
  pubkey: string;
  createdAt: number;
  name?: string;
  displayName?: string;
  about?: string;
  nip05?: string;
  picture?: string;
  banner?: string;
  lud16?: string;
}

export interface ProfilesResolveResponseDto {
  profiles: Record<string, IdentityProfileDto>;
}

const LOWER_HEX_64_PATTERN = '^[0-9a-f]{64}$';

const nip05BatchCheckSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pubkey', 'nip05'],
  properties: {
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    nip05: {
      type: 'string',
      minLength: 1,
      maxLength: 320,
      pattern: '.*\\S.*',
    },
  },
} as const;

export const nip05VerifyBatchRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'checks'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    checks: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: nip05BatchCheckSchema,
    },
    timeoutMs: {
      type: 'integer',
      minimum: 250,
      maximum: 10_000,
    },
  },
} as const;

const nip05BatchResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pubkey', 'nip05', 'status', 'identifier', 'checkedAt'],
  properties: {
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    nip05: {
      type: 'string',
      maxLength: 320,
    },
    status: {
      type: 'string',
      enum: ['verified', 'unverified', 'error'],
    },
    identifier: {
      type: 'string',
      maxLength: 320,
    },
    displayIdentifier: {
      type: 'string',
      maxLength: 320,
    },
    resolvedPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    error: {
      type: 'string',
      maxLength: 512,
    },
    checkedAt: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const nip05VerifyBatchResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: nip05BatchResultSchema,
    },
  },
} as const;

export const profilesResolveRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'pubkeys'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    pubkeys: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: {
        type: 'string',
        pattern: LOWER_HEX_64_PATTERN,
      },
    },
  },
} as const;

const identityProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pubkey', 'createdAt'],
  properties: {
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    createdAt: {
      type: 'integer',
      minimum: 0,
    },
    name: {
      type: 'string',
      maxLength: 128,
    },
    displayName: {
      type: 'string',
      maxLength: 128,
    },
    about: {
      type: 'string',
      maxLength: 2048,
    },
    nip05: {
      type: 'string',
      maxLength: 320,
    },
    picture: {
      type: 'string',
      maxLength: 2048,
    },
    banner: {
      type: 'string',
      maxLength: 2048,
    },
    lud16: {
      type: 'string',
      maxLength: 320,
    },
  },
} as const;

export const profilesResolveResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['profiles'],
  properties: {
    profiles: {
      type: 'object',
      patternProperties: {
        [LOWER_HEX_64_PATTERN]: identityProfileSchema,
      },
      additionalProperties: false,
    },
  },
} as const;
