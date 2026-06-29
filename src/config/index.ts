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

export interface ServiceBusConfig {
  /**
   * Connection string for Azure Service Bus. Empty in the scaffold; the outbox
   * publisher is a no-op skeleton until a real publisher is wired in a later pass.
   * NOTE: Service Bus sessions are NOT used in v1.
   */
  readonly connectionString: string;
  readonly outboxTopic: string;
  readonly outboxQueue: string;
}

export interface AppConfig {
  readonly appEnv: AppEnv;
  readonly appRegion: string;
  readonly logLevel: LogLevel;
  readonly databaseUrl: string;
  readonly serviceBus: ServiceBusConfig;
  readonly outbox: OutboxConfig;
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
    serviceBus: {
      // Intentionally not required in the scaffold; the publisher is a skeleton.
      connectionString: readString('AZURE_SERVICE_BUS_CONNECTION_STRING') ?? '',
      outboxTopic: readString('AZURE_SERVICE_BUS_OUTBOX_TOPIC') ?? '',
      outboxQueue: readString('AZURE_SERVICE_BUS_OUTBOX_QUEUE') ?? '',
    },
    outbox: {
      batchSize: readInt('OUTBOX_BATCH_SIZE', 25),
      lockSeconds: readInt('OUTBOX_LOCK_SECONDS', 120),
      baseDelayMs: readInt('OUTBOX_BASE_DELAY_MS', 1000),
      maxDelayMs: readInt('OUTBOX_MAX_DELAY_MS', 300_000),
      maxRetries: readInt('OUTBOX_MAX_RETRIES', 10),
    },
  };
}
