import type { FastifyError, FastifyPluginAsync } from 'fastify';

import {
  sanitizeRequestBody,
  sanitizeRequestHeaders,
  sanitizeRequestQuery,
} from './request-context';

type ValidationDetail = {
  path: string;
  message: string;
  keyword?: string;
};

const toValidationDetails = (
  error: FastifyError,
): ValidationDetail[] | undefined => {
  if (!error.validation || error.validation.length === 0) {
    return undefined;
  }

  return error.validation.map((issue) => {
    const missingProperty =
      typeof issue.params === 'object' &&
      issue.params !== null &&
      'missingProperty' in issue.params &&
      typeof issue.params.missingProperty === 'string'
        ? issue.params.missingProperty
        : undefined;

    const path =
      issue.instancePath && issue.instancePath.length > 0
        ? issue.instancePath
        : missingProperty
          ? `/${missingProperty}`
          : '/';

    return {
      path,
      message: issue.message ?? 'Invalid value',
      keyword: issue.keyword,
    };
  });
};

const mapCodeFromStatus = (statusCode: number): string => {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
  }
};

const resolveStatusCode = (error: FastifyError): number => {
  if (error.validation) {
    return 400;
  }

  if (
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
  ) {
    return error.statusCode;
  }

  return 500;
};

const sanitizePath = (url: string): string => {
  const [path] = url.split('?');
  return path.length > 0 ? path : '/';
};

export const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    const fastifyError = error as FastifyError;
    const statusCode = resolveStatusCode(fastifyError);

    if (fastifyError.validation) {
      request.log.warn({
        event: 'request.validation_failed',
        requestId: request.id,
        method: request.method,
        path: sanitizePath(request.url),
        statusCode: 400,
        issues: fastifyError.validation.length,
        query: sanitizeRequestQuery(request.query),
        body: sanitizeRequestBody(request.body),
        headers: sanitizeRequestHeaders(request.headers),
      });

      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: toValidationDetails(fastifyError),
          requestId: request.id,
        },
      });
      return;
    }

    const code = mapCodeFromStatus(statusCode);
    const message =
      statusCode >= 500
        ? 'Internal server error'
        : fastifyError.message || 'Request failed';

    const logPayload = {
      event: statusCode >= 500 ? 'request.failed' : 'request.rejected',
      requestId: request.id,
      method: request.method,
      path: sanitizePath(request.url),
      statusCode,
      code,
      errorCode: fastifyError.code,
      query: sanitizeRequestQuery(request.query),
      body: sanitizeRequestBody(request.body),
      headers: sanitizeRequestHeaders(request.headers),
    };

    if (statusCode >= 500) {
      request.log.error({
        ...logPayload,
        errorMessage: fastifyError.message,
      });
    } else {
      request.log.warn(logPayload);
    }

    reply.status(statusCode).send({
      error: {
        code,
        message,
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id,
      },
    });
  });
};

(errorHandlerPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
