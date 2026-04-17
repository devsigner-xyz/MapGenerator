import type {
  FastifyPluginAsync,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify';

import { verifyNostrHttpAuth } from '../nostr/http-auth-verify';

type StringRecord = Record<string, unknown>;

declare module 'fastify' {
  interface FastifyInstance {
    verifyOwnerAuth: preHandlerHookHandler;
  }
}

const isLowerHexPubkey = (value: string): boolean =>
  value.length === 64 && /^[0-9a-f]+$/.test(value);

const normalizePubkey = (value: string): string => value.trim().toLowerCase();

const toRecord = (value: unknown): StringRecord | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as StringRecord;
};

const pushOwnerCandidate = (source: StringRecord | null, out: string[]): void => {
  if (!source || !(Object.hasOwn(source, 'ownerPubkey'))) {
    return;
  }

  const value = source.ownerPubkey;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        out.push(item);
      }
    }
  }
};

const readOwnerPubkeys = (request: FastifyRequest): string[] => {
  const pubkeys: string[] = [];

  pushOwnerCandidate(toRecord(request.params), pubkeys);
  pushOwnerCandidate(toRecord(request.query), pubkeys);
  pushOwnerCandidate(toRecord(request.body), pubkeys);

  return pubkeys
    .map(normalizePubkey)
    .filter((pubkey, index, list) => pubkey.length > 0 && list.indexOf(pubkey) === index);
};

const buildHttpError = (
  statusCode: number,
  code: string,
  message: string,
): Error & { statusCode: number; code: string } => {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const AUTH_PROOF_REPLAY_TTL_SECONDS = 120;
const MAX_AUTH_PROOFS = 5_000;

export const ownerAuthPlugin: FastifyPluginAsync = async (app) => {
  const seenAuthProofs = new Map<string, number>();

  const sweepExpiredProofs = (nowSeconds: number): void => {
    for (const [key, expiresAt] of seenAuthProofs.entries()) {
      if (expiresAt <= nowSeconds) {
        seenAuthProofs.delete(key);
      }
    }
  };

  const trimProofs = (): void => {
    while (seenAuthProofs.size > MAX_AUTH_PROOFS) {
      const oldestKey = seenAuthProofs.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }

      seenAuthProofs.delete(oldestKey);
    }
  };

  app.decorate('verifyOwnerAuth', async (request) => {
    const authResult = verifyNostrHttpAuth(request);
    if (!authResult.ok) {
      throw buildHttpError(
        401,
        'OWNER_AUTH_INVALID',
        'Missing or invalid Nostr auth proof',
      );
    }

    const authenticatedPubkey = normalizePubkey(authResult.pubkey);
    if (!isLowerHexPubkey(authenticatedPubkey)) {
      throw buildHttpError(401, 'OWNER_AUTH_INVALID', 'Missing or invalid Nostr auth proof');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    sweepExpiredProofs(nowSeconds);

    const replayKey = `${authenticatedPubkey}:${authResult.event.id}`;
    if (seenAuthProofs.has(replayKey)) {
      throw buildHttpError(401, 'OWNER_AUTH_REPLAY', 'Nostr auth proof already used');
    }
    seenAuthProofs.set(replayKey, nowSeconds + AUTH_PROOF_REPLAY_TTL_SECONDS);
    trimProofs();

    const ownerPubkeys = readOwnerPubkeys(request);
    if (ownerPubkeys.length === 0) {
      throw buildHttpError(403, 'OWNER_PUBKEY_MISMATCH', 'ownerPubkey mismatch');
    }

    const hasMismatch = ownerPubkeys.some((ownerPubkey) => {
      if (!isLowerHexPubkey(ownerPubkey)) {
        return true;
      }

      return ownerPubkey !== authenticatedPubkey;
    });

    if (hasMismatch) {
      throw buildHttpError(403, 'OWNER_PUBKEY_MISMATCH', 'ownerPubkey mismatch');
    }

    const context = request.context as {
      requestId: string;
      authenticatedPubkey?: string;
    };
    context.authenticatedPubkey = authenticatedPubkey;
  });
};

(ownerAuthPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
