import type { FastifyPluginAsync } from 'fastify';

import {
  nip05VerifyBatchRequestSchema,
  nip05VerifyBatchResponseSchema,
  profilesResolveRequestSchema,
  profilesResolveResponseSchema,
  type Nip05VerifyBatchRequestDto,
  type ProfilesResolveRequestDto,
} from './identity.schemas';
import { createIdentityService, type IdentityService } from './identity.service';

export interface IdentityRoutesOptions {
  service?: IdentityService;
}

export const identityRoutes: FastifyPluginAsync<IdentityRoutesOptions> = async (app, options) => {
  const service = options.service ?? createIdentityService();

  app.post<{
    Body: Nip05VerifyBatchRequestDto;
  }>(
    '/identity/nip05/verify-batch',
    {
      config: {
        rateLimit: {
          max: 30,
          windowMs: 60_000,
        },
      },
      schema: {
        body: nip05VerifyBatchRequestSchema,
        response: {
          200: nip05VerifyBatchResponseSchema,
        },
      },
    },
    async (request) => {
      return service.verifyNip05Batch(request.body);
    },
  );

  app.post<{
    Body: ProfilesResolveRequestDto;
  }>(
    '/identity/profiles/resolve',
    {
      config: {
        rateLimit: {
          max: 40,
          windowMs: 60_000,
        },
      },
      schema: {
        body: profilesResolveRequestSchema,
        response: {
          200: profilesResolveResponseSchema,
        },
      },
    },
    async (request) => {
      return service.resolveProfiles(request.body);
    },
  );
};
