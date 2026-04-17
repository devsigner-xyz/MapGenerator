import type { FastifyPluginAsync } from 'fastify';

import {
  graphFollowersBodySchema,
  graphFollowersQuerySchema,
  graphFollowersResponseSchema,
  graphFollowsQuerySchema,
  graphFollowsResponseSchema,
  type GraphFollowersBody,
  type GraphFollowersQuery,
  type GraphFollowsQuery,
} from './graph.schemas';
import { createGraphService, type GraphService } from './graph.service';

export interface GraphRoutesOptions {
  service?: GraphService;
}

export const graphRoutes: FastifyPluginAsync<GraphRoutesOptions> = async (app, options) => {
  const service = options.service ?? createGraphService();

  app.get<{
    Querystring: GraphFollowsQuery;
  }>(
    '/graph/follows',
    {
      config: {
        rateLimit: {
          max: 90,
          windowMs: 60_000,
        },
      },
      schema: {
        querystring: graphFollowsQuerySchema,
        response: {
          200: graphFollowsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getFollows(request.query);
    },
  );

  app.get<{
    Querystring: GraphFollowersQuery;
  }>(
    '/graph/followers',
    {
      config: {
        rateLimit: {
          max: 90,
          windowMs: 60_000,
        },
      },
      schema: {
        querystring: graphFollowersQuerySchema,
        response: {
          200: graphFollowersResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getFollowers(request.query);
    },
  );

  app.post<{
    Body: GraphFollowersBody;
  }>(
    '/graph/followers',
    {
      config: {
        rateLimit: {
          max: 90,
          windowMs: 60_000,
        },
      },
      schema: {
        body: graphFollowersBodySchema,
        response: {
          200: graphFollowersResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getFollowers({
        ownerPubkey: request.body.ownerPubkey,
        pubkey: request.body.pubkey,
        candidateAuthors: request.body.candidateAuthors?.join(','),
      });
    },
  );
};
