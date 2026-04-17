import type { FastifyPluginAsync } from 'fastify';

import {
  notificationsQuerySchema,
  notificationsResponseSchema,
  notificationsStreamQuerySchema,
  type NotificationsQuery,
  type NotificationsStreamQuery,
} from './notifications.schemas';
import {
  createNotificationsService,
  type NotificationsService,
} from './notifications.service';

export interface NotificationsRoutesOptions {
  service?: NotificationsService;
}

export const notificationsRoutes: FastifyPluginAsync<NotificationsRoutesOptions> = async (
  app,
  options,
) => {
  const service = options.service ?? createNotificationsService();

  app.get<{
    Querystring: NotificationsQuery;
  }>(
    '/notifications',
    {
      preHandler: app.verifyOwnerAuth,
      schema: {
        querystring: notificationsQuerySchema,
        response: {
          200: notificationsResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getNotifications(request.query);
    },
  );

  app.get<{
    Querystring: NotificationsStreamQuery;
  }>(
    '/notifications/stream',
    {
      preHandler: app.verifyOwnerAuth,
      schema: {
        querystring: notificationsStreamQuerySchema,
      },
    },
    async (request, reply) => {
      const abortController = new AbortController();
      const abortStream = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };

      request.raw.on('aborted', abortStream);
      request.raw.on('close', abortStream);
      reply.raw.on('close', abortStream);
      reply.raw.on('error', abortStream);

      reply.hijack();
      reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
      reply.raw.setHeader('connection', 'keep-alive');
      reply.raw.setHeader('x-accel-buffering', 'no');

      reply.raw.write(': connected\n\n');

      try {
        for await (const item of service.streamNotifications(request.query, abortController.signal)) {
          if (request.raw.aborted || reply.raw.writableEnded) {
            abortStream();
            break;
          }

          const payload = JSON.stringify({
            type: 'notification',
            item,
          });

          reply.raw.write(`id: ${item.id}\n`);
          reply.raw.write('event: notification\n');
          reply.raw.write(`data: ${payload}\n\n`);
        }
      } catch (error) {
        const disconnected = abortController.signal.aborted || request.raw.aborted;

        if (!disconnected && !reply.raw.writableEnded) {
          app.log.error(error, 'notifications stream failed');
          reply.raw.write('event: error\n');
          reply.raw.write('data: {"type":"error","message":"stream failed"}\n\n');
        }
      } finally {
        abortStream();
        request.raw.off('aborted', abortStream);
        request.raw.off('close', abortStream);
        reply.raw.off('close', abortStream);
        reply.raw.off('error', abortStream);
      }

      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    },
  );
};
