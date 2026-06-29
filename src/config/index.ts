/**
 * Typed application configuration loader (scaffold).
 *
 * Responsibilities:
 *  - Load environment variables (via dotenv for local dev) into a typed, validated shape.
 *  - Fail clearly in production-like environments when required values are missing.
 *  - Provide safe defaults for local/test only.
 *
 * This is intentionally minimal. No live Azure or database connections are created here.
 */

import { config as loadDotenv } from 'dotenv';

loadDotenv();

export type AppEnv = 'local' | 'test' | 'development' | 'staging' | 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface OutboxConfig {
  readonly batchSize: number;
  readonly lockSeconds: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxRetries: number;
}

/** Where the outbox publisher sends messages. v1 defaults to a single queue. */
export type ServiceBusPublishTarget = 'queue' | 'topic';

export interface ServiceBusConfig {
  /**
   * Master switch for real Azure Service Bus publishing. Defaults to `false` so local
   * and test runtimes NEVER require a broker or a connection string. When `false` the
   * publisher factory returns the no-op publisher and no Service Bus config is required.
   * NOTE: Service Bus sessions are NOT used in v1.
   */
  readonly enabled: boolean;
  /** Connection string for Azure Service Bus. Required only when `enabled` is true. */
  readonly connectionString: string;
  /** Target entity kind. Required to be 'queue' or 'topic' when `enabled` is true. */
  readonly publishTarget: ServiceBusPublishTarget;
  /** Queue name. Required when `enabled` and `publishTarget` is 'queue'. */
  readonly queueName: string;
  /** Topic name. Required when `enabled` and `publishTarget` is 'topic'. */
  readonly topicName: string;
}

export interface ApiConfig {
  /** Bind address for the local/demo HTTP runtime. Defaults to loopback only. */
  readonly host: string;
  /** TCP port for the local/demo HTTP runtime. */
  readonly port: number;
}

export interface AppConfig {
  readonly appEnv: AppEnv;
  readonly appRegion: string;
  readonly logLevel: LogLevel;
  readonly databaseUrl: string;
  readonly serviceBus: ServiceBusConfig;
  readonly outbox: OutboxConfig;
  readonly api: ApiConfig;
}

/** Environments where missing required configuration must fail closed. */
const PRODUCTION_LIKE: ReadonlySet<AppEnv> = new Set<AppEnv>([
  'development',
  'staging',
  'production',
]);

function readString(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readInt(key: string, fallback: number): number {
  const raw = readString(key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for environment variable ${key}: "${raw}"`);
  }
  return parsed;
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = readString(key);
  if (raw === undefined) return fallback;
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new Error(`Invalid boolean for environment variable ${key}: "${raw}"`);
}

/**
 * Resolve and validate Service Bus configuration. Fails closed only when publishing is
 * explicitly enabled: a disabled config (the default) requires no connection string and
 * never blocks local/test runtimes.
 */
function readServiceBusConfig(): ServiceBusConfig {
  const enabled = readBool('SERVICE_BUS_ENABLED', false);
  const connectionString = readString('SERVICE_BUS_CONNECTION_STRING') ?? '';
  const queueName = readString('SERVICE_BUS_QUEUE_NAME') ?? '';
  const topicName = readString('SERVICE_BUS_TOPIC_NAME') ?? '';
  const targetRaw = readString('SERVICE_BUS_PUBLISH_TARGET') ?? 'queue';
  if (targetRaw !== 'queue' && targetRaw !== 'topic') {
    throw new Error(`Invalid SERVICE_BUS_PUBLISH_TARGET: "${targetRaw}" (expected 'queue' or 'topic').`);
  }
  const publishTarget: ServiceBusPublishTarget = targetRaw;

  if (enabled) {
    if (connectionString === '') {
      throw new Error('SERVICE_BUS_CONNECTION_STRING is required when SERVICE_BUS_ENABLED=true.');
    }
    if (publishTarget === 'queue' && queueName === '') {
      throw new Error('SERVICE_BUS_QUEUE_NAME is required when SERVICE_BUS_PUBLISH_TARGET=queue.');
    }
    if (publishTarget === 'topic' && topicName === '') {
      throw new Error('SERVICE_BUS_TOPIC_NAME is required when SERVICE_BUS_PUBLISH_TARGET=topic.');
    }
  }

  return { enabled, connectionString, publishTarget, queueName, topicName };
}

function readAppEnv(): AppEnv {
  const raw = (readString('APP_ENV') ?? 'local') as AppEnv;
  const allowed: ReadonlySet<string> = new Set([
    'local',
    'test',
    'development',
    'staging',
    'production',
  ]);
  if (!allowed.has(raw)) {
    throw new Error(`Invalid APP_ENV: "${raw}"`);
  }
  return raw;
}

function readLogLevel(): LogLevel {
  const raw = (readString('LOG_LEVEL') ?? 'info') as LogLevel;
  const allowed: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);
  if (!allowed.has(raw)) {
    throw new Error(`Invalid LOG_LEVEL: "${raw}"`);
  }
  return raw;
}

/**
 * Load and validate application configuration.
 *
 * In production-like environments, required values (e.g. DATABASE_URL) must be present
 * or this throws. In local/test, safe defaults are permitted.
 */
export function loadConfig(): AppConfig {
  const appEnv = readAppEnv();
  const isProductionLike = PRODUCTION_LIKE.has(appEnv);

  const databaseUrl = readString('DATABASE_URL');
  if (isProductionLike && databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required in production-like environments.');
  }

  return {
    appEnv,
    appRegion: readString('APP_REGION') ?? 'canada',
    logLevel: readLogLevel(),
    databaseUrl: databaseUrl ?? '',
    serviceBus: readServiceBusConfig(),
    outbox: {
      batchSize: readInt('OUTBOX_BATCH_SIZE', 25),
      lockSeconds: readInt('OUTBOX_LOCK_SECONDS', 120),
      baseDelayMs: readInt('OUTBOX_BASE_DELAY_MS', 1000),
      maxDelayMs: readInt('OUTBOX_MAX_DELAY_MS', 300_000),
      maxRetries: readInt('OUTBOX_MAX_RETRIES', 10),
    },
    api: {
      // Loopback-only by default: this runtime is local/demo and ships no edge auth.
      host: readString('API_HOST') ?? '127.0.0.1',
      port: readInt('API_PORT', 3000),
    },
  };
}
