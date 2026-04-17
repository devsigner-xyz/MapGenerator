import type { FastifyPluginAsync } from 'fastify';

import {
  engagementBodySchema,
  engagementResponseSchema,
  type EngagementBody,
  followingFeedResponseSchema,
  followingFeedQuerySchema,
  type FollowingFeedQuery,
  threadResponseSchema,
  threadParamsSchema,
  threadQuerySchema,
  type ThreadParams,
  type ThreadQuery,
} from './social.schemas';
import { createSocialService, type SocialService } from './social.service';

export interface SocialRoutesOptions {
  service?: SocialService;
}

export const socialRoutes: FastifyPluginAsync<SocialRoutesOptions> = async (
  app,
  options,
) => {
  const service = options.service ?? createSocialService();

  app.get<{
    Querystring: FollowingFeedQuery;
  }>(
    '/social/feed/following',
    {
      schema: {
        querystring: followingFeedQuerySchema,
        response: {
          200: followingFeedResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getFollowingFeed(request.query);
    },
  );

  app.get<{
    Params: ThreadParams;
    Querystring: ThreadQuery;
  }>(
    '/social/thread/:rootEventId',
    {
      schema: {
        params: threadParamsSchema,
        querystring: threadQuerySchema,
        response: {
          200: threadResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getThread({
        rootEventId: request.params.rootEventId,
        limit: request.query.limit,
        until: request.query.until,
      });
    },
  );

  app.post<{
    Body: EngagementBody;
  }>(
    '/social/engagement',
    {
      schema: {
        body: engagementBodySchema,
        response: {
          200: engagementResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getEngagement(request.body);
    },
  );
};
