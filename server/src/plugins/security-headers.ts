import type { FastifyPluginAsync } from 'fastify';

const BASELINE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()',
};

export const securityHeadersPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
      if (!reply.hasHeader(name)) {
        reply.header(name, value);
      }
    }
  });
};

(securityHeadersPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
