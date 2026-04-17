import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { verifyEvent } from 'nostr-tools';

const NIP98_EVENT_KIND = 27_235;
const AUTH_SCHEME = 'Nostr';
const MAX_PROOF_LENGTH = 16_384;
const MAX_CLOCK_SKEW_SECONDS = 60;
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MIN_NONCE_LENGTH = 8;

type NostrAuthEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type VerifyNostrHttpAuthResult =
  | {
      ok: true;
      pubkey: string;
      event: NostrAuthEvent;
    }
  | {
      ok: false;
      reason: string;
    };

const isLowerHex = (value: string, length: number): boolean =>
  value.length === length && /^[0-9a-f]+$/.test(value);

const tryParseAuthHeader = (
  authorizationHeader: string | string[] | undefined,
): string | null => {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, proof] = authorizationHeader.trim().split(/\s+/, 2);
  if (scheme !== AUTH_SCHEME || !proof) {
    return null;
  }

  return proof;
};

const decodeProof = (proof: string): string | null => {
  if (proof.length === 0 || proof.length > MAX_PROOF_LENGTH) {
    return null;
  }

  if (!/^[A-Za-z0-9+/=_-]+$/.test(proof)) {
    return null;
  }

  const normalized = proof.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;

  try {
    return Buffer.from(`${normalized}${'='.repeat(padding)}`, 'base64').toString(
      'utf8',
    );
  } catch {
    return null;
  }
};

const tryParseEvent = (json: string): NostrAuthEvent | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const event = parsed as Partial<NostrAuthEvent>;

  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.created_at !== 'number' ||
    typeof event.kind !== 'number' ||
    !Array.isArray(event.tags) ||
    typeof event.content !== 'string' ||
    typeof event.sig !== 'string'
  ) {
    return null;
  }

  if (
    !isLowerHex(event.id, 64) ||
    !isLowerHex(event.pubkey, 64) ||
    !isLowerHex(event.sig, 128)
  ) {
    return null;
  }

  if (
    !event.tags.every(
      (tag) =>
        Array.isArray(tag) &&
        tag.length >= 2 &&
        tag.every((item) => typeof item === 'string'),
    )
  ) {
    return null;
  }

  return event as NostrAuthEvent;
};

const firstTagValue = (event: NostrAuthEvent, tagName: string): string | null => {
  const tag = event.tags.find((candidate) => candidate[0] === tagName);
  if (!tag || typeof tag[1] !== 'string') {
    return null;
  }

  return tag[1];
};

const isWithinClockSkew = (eventCreatedAt: number): boolean => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - eventCreatedAt) <= MAX_CLOCK_SKEW_SECONDS;
};

const resolveAbsoluteRequestUrl = (request: FastifyRequest): string | null => {
  const host = request.host ?? request.headers.host;
  if (!host) {
    return null;
  }

  const protocol = request.protocol;

  if (protocol !== 'http' && protocol !== 'https') {
    return null;
  }

  return `${protocol}://${host}${request.url}`;
};

const isAbsoluteHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const toRequestPayloadString = (body: unknown): string | null => {
  if (body === undefined || body === null) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('utf8');
  }

  try {
    return JSON.stringify(body);
  } catch {
    return null;
  }
};

const computePayloadHash = (payload: string): string => {
  return createHash('sha256').update(payload).digest('hex');
};

export const verifyNostrHttpAuth = (
  request: FastifyRequest,
): VerifyNostrHttpAuthResult => {
  const proof = tryParseAuthHeader(request.headers.authorization);
  if (!proof) {
    return { ok: false, reason: 'Missing Nostr Authorization header' };
  }

  const decodedProof = decodeProof(proof);
  if (!decodedProof) {
    return { ok: false, reason: 'Invalid proof encoding' };
  }

  const event = tryParseEvent(decodedProof);
  if (!event) {
    return { ok: false, reason: 'Invalid event payload' };
  }

  if (event.kind !== NIP98_EVENT_KIND) {
    return { ok: false, reason: 'Invalid auth event kind' };
  }

  if (event.content !== '') {
    return { ok: false, reason: 'Invalid auth event content' };
  }

  if (!isWithinClockSkew(event.created_at)) {
    return { ok: false, reason: 'Auth event expired' };
  }

  const methodTag = firstTagValue(event, 'method');
  if (!methodTag || methodTag.toUpperCase() !== request.method.toUpperCase()) {
    return { ok: false, reason: 'Method tag does not match request' };
  }

  const nonceTag = firstTagValue(event, 'nonce');
  if (!nonceTag || nonceTag.trim().length < MIN_NONCE_LENGTH) {
    return { ok: false, reason: 'Missing or invalid nonce tag' };
  }

  const urlTag = firstTagValue(event, 'u');
  if (!urlTag || !isAbsoluteHttpUrl(urlTag)) {
    return { ok: false, reason: 'URL tag must be an absolute HTTP URL' };
  }

  const absoluteRequestUrl = resolveAbsoluteRequestUrl(request);
  if (!absoluteRequestUrl || urlTag !== absoluteRequestUrl) {
    return { ok: false, reason: 'URL tag does not match request' };
  }

  const requestMethod = request.method.toUpperCase();
  if (METHODS_WITH_BODY.has(requestMethod)) {
    const payloadTag = firstTagValue(event, 'payload');
    const payload = toRequestPayloadString(request.body);
    if (!payloadTag || payload === null || payload === undefined) {
      return { ok: false, reason: 'Missing payload hash for body request' };
    }

    if (computePayloadHash(payload) !== payloadTag) {
      return { ok: false, reason: 'Payload hash does not match request body' };
    }
  }

  if (!verifyEvent(event)) {
    return { ok: false, reason: 'Invalid event signature' };
  }

  return {
    ok: true,
    pubkey: event.pubkey,
    event,
  };
};
