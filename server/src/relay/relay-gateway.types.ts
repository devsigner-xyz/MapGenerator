export interface RelayGatewayCacheOptions {
  ttlMs: number;
  maxEntries: number;
}

export interface RelayGatewayQueryInput<TParams> {
  key: string;
  params: TParams;
  timeoutMs?: number;
  cacheTtlMs?: number;
  bypassCache?: boolean;
  dedupe?: boolean;
  signal?: AbortSignal;
}

export interface RelayGatewayQueryContext {
  signal: AbortSignal;
}

export interface RelayGatewayOptions<TParams, TResult> {
  queryFn: (params: TParams, context: RelayGatewayQueryContext) => Promise<TResult>;
  defaultTimeoutMs?: number;
  cache?: RelayGatewayCacheOptions;
  now?: () => number;
}

export interface RelayGatewayError extends Error {
  code?: string;
  recoverable?: boolean;
  kind?: 'timeout' | 'upstream';
  cause?: unknown;
}

export interface RelayGateway<TParams, TResult> {
  query(input: RelayGatewayQueryInput<TParams>): Promise<TResult>;
  clearCache(): void;
}
