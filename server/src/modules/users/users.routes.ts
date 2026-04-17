import type { FastifyPluginAsync } from 'fastify';

import {
  type UsersSearchQuery,
  usersSearchQuerySchema,
  usersSearchResponseSchema,
} from './users.schemas';
import { createUsersService, type UsersService } from './users.service';

export interface UsersRoutesOptions {
  service?: UsersService;
}

export const usersRoutes: FastifyPluginAsync<UsersRoutesOptions> = async (app, options) => {
  const service = options.service ?? createUsersService();

  app.get<{
    Querystring: UsersSearchQuery;
  }>(
    '/users/search',
    {
      schema: {
        querystring: usersSearchQuerySchema,
        response: {
          200: usersSearchResponseSchema,
        },
      },
    },
    async (request) => {
      return service.searchUsers(request.query);
    },
  );
};
