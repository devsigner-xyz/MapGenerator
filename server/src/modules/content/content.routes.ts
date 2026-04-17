import type { FastifyPluginAsync } from 'fastify';

import {
  contentPostsQuerySchema,
  contentPostsResponseSchema,
  profileStatsBodySchema,
  profileStatsQuerySchema,
  profileStatsResponseSchema,
  type ContentPostsQuery,
  type ProfileStatsBody,
  type ProfileStatsQuery,
} from './content.schemas';
import { createContentService, type ContentService } from './content.service';

export interface ContentRoutesOptions {
  service?: ContentService;
}

export const contentRoutes: FastifyPluginAsync<ContentRoutesOptions> = async (app, options) => {
  const service = options.service ?? createContentService();

  app.get<{
    Querystring: ContentPostsQuery;
  }>(
    '/content/posts',
    {
      config: {
        rateLimit: {
          max: 90,
          windowMs: 60_000,
        },
      },
      schema: {
        querystring: contentPostsQuerySchema,
        response: {
          200: contentPostsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getPosts(request.query);
    },
  );

  app.get<{
    Querystring: ProfileStatsQuery;
  }>(
    '/content/profile-stats',
    {
      config: {
        rateLimit: {
          max: 90,
          windowMs: 60_000,
        },
      },
      schema: {
        querystring: profileStatsQuerySchema,
        response: {
          200: profileStatsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getProfileStats(request.query);
    },
  );

  app.post<{
    Body: ProfileStatsBody;
  }>(
    '/content/profile-stats',
    {
      config: {
        rateLimit: {
          max: 90,
          windowMs: 60_000,
        },
      },
      schema: {
        body: profileStatsBodySchema,
        response: {
          200: profileStatsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getProfileStats({
        ownerPubkey: request.body.ownerPubkey,
        pubkey: request.body.pubkey,
        candidateAuthors: request.body.candidateAuthors?.join(','),
      });
    },
  );
};
