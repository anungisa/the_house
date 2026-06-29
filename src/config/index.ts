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

/**
 * Edge identity mode for the HTTP boundary.
 *  - `demo`: LOCAL/DEMO ONLY. tenant/actor are taken from the request body (the caller is
 *    trusted to declare who they are). Never use outside local/demo.
 *  - `trusted_headers`: tenant/actor are derived from trusted request headers injected by a
 *    verifying edge (reverse proxy / gateway / identity provider). Body-supplied identity is
 *    rejected. This is NOT full token validation — it assumes a trusted upstream.
 */
export type AuthMode = 'demo' | 'trusted_headers';

export interface AuthConfig {
  readonly mode: AuthMode;
}

/**
 * Evidence payload/document storage backend.
 *  - `memory`: in-process store. LOCAL/DEMO/TEST ONLY. Requires no Azure config.
 *  - `azure_blob`: real Azure Blob Storage. Requires a connection string + container name.
 *
 * This is the PAYLOAD layer only. Governance evidence METADATA always lives in PostgreSQL
 * (governance.evidence_object) and is created solely by the Governance Kernel.
 */
export type EvidenceStorageProvider = 'memory' | 'azure_blob';

export interface EvidenceStorageConfig {
  readonly provider: EvidenceStorageProvider;
  /** Connection string for Azure Blob. Required only when provider is `azure_blob`. */
  readonly connectionString: string;
  /** Target container name. Required only when provider is `azure_blob`. */
  readonly containerName: string;
  /** When true, stored payloads are SHA-256 verified on read (defaults to true). */
  readonly requireHash: boolean;
}

/**
 * Settings for the outbox worker RUNTIME HOST (the interval loop that drains the outbox).
 * Distinct from {@link OutboxConfig}: those tune the worker's retry/backoff mechanics, these
 * tune the host that schedules {@link OutboxConfig}-driven batches.
 */
export interface OutboxWorkerRuntimeSettings {
  /** Whether the worker host should start. The script exits early when false. */
  readonly enabled: boolean;
  /** Delay between batch ticks (ms) in continuous mode. */
  readonly intervalMs: number;
  /** Max rows claimed per batch. */
  readonly batchSize: number;
  /** Stable worker identity used for outbox row leasing. */
  readonly workerId: string;
  /** Lease duration (seconds) applied to claimed rows. */
  readonly lockSeconds: number;
  /** Process exactly one batch then shut down (useful for cron/smoke runs). */
  readonly runOnce: boolean;
}

export interface AppConfig {
  readonly appEnv: AppEnv;
  readonly appRegion: string;
  readonly logLevel: LogLevel;
  readonly databaseUrl: string;
  readonly serviceBus: ServiceBusConfig;
  readonly outbox: OutboxConfig;
  readonly api: ApiConfig;
  readonly outboxWorker: OutboxWorkerRuntimeSettings;
  readonly auth: AuthConfig;
  readonly evidenceStorage: EvidenceStorageConfig;
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

function readPositiveInt(key: string, fallback: number): number {
  const value = readInt(key, fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${key} must be a positive integer (got "${value}").`);
  }
  return value;
}

/**
 * Read a required-non-empty identifier with a default. An ABSENT variable falls back to the
 * default; a PRESENT-but-empty/whitespace value fails closed (a blank worker id would break
 * outbox leasing).
 */
function readNonEmpty(key: string, fallback: string): string {
  const present = process.env[key];
  if (present === undefined) return fallback;
  const trimmed = present.trim();
  if (trimmed === '') {
    throw new Error(`Environment variable ${key} must be non-empty.`);
  }
  return trimmed;
}

/** Resolve and validate the outbox worker runtime-host settings. */
function readOutboxWorkerSettings(): OutboxWorkerRuntimeSettings {
  return {
    enabled: readBool('OUTBOX_WORKER_ENABLED', true),
    intervalMs: readPositiveInt('OUTBOX_WORKER_INTERVAL_MS', 5000),
    batchSize: readPositiveInt('OUTBOX_WORKER_BATCH_SIZE', 25),
    workerId: readNonEmpty('OUTBOX_WORKER_ID', 'local-outbox-worker'),
    lockSeconds: readPositiveInt('OUTBOX_WORKER_LOCK_SECONDS', 60),
    runOnce: readBool('OUTBOX_WORKER_RUN_ONCE', false),
  };
}

/**
 * Resolve and validate the HTTP edge identity mode. Defaults to `demo` (local/demo only).
 * An unknown AUTH_MODE fails closed at config load so a misconfigured edge can never fall
 * back to trusting request bodies in production.
 */
function readAuthConfig(): AuthConfig {
  const raw = readString('AUTH_MODE') ?? 'demo';
  if (raw !== 'demo' && raw !== 'trusted_headers') {
    throw new Error(`Invalid AUTH_MODE: "${raw}" (expected 'demo' or 'trusted_headers').`);
  }
  return { mode: raw };
}

/**
 * Resolve and validate evidence payload storage configuration. Fails closed only when the
 * `azure_blob` provider is selected: the default `memory` provider requires no Azure config
 * and never blocks local/test runtimes. An unknown provider fails closed.
 */
function readEvidenceStorageConfig(): EvidenceStorageConfig {
  const raw = readString('EVIDENCE_STORAGE_PROVIDER') ?? 'memory';
  if (raw !== 'memory' && raw !== 'azure_blob') {
    throw new Error(
      `Invalid EVIDENCE_STORAGE_PROVIDER: "${raw}" (expected 'memory' or 'azure_blob').`,
    );
  }
  const provider: EvidenceStorageProvider = raw;
  const connectionString = readString('EVIDENCE_BLOB_CONNECTION_STRING') ?? '';
  const containerName = readString('EVIDENCE_BLOB_CONTAINER_NAME') ?? '';
  const requireHash = readBool('EVIDENCE_STORAGE_REQUIRE_HASH', true);

  if (provider === 'azure_blob') {
    if (connectionString === '') {
      throw new Error(
        'EVIDENCE_BLOB_CONNECTION_STRING is required when EVIDENCE_STORAGE_PROVIDER=azure_blob.',
      );
    }
    if (containerName === '') {
      throw new Error(
        'EVIDENCE_BLOB_CONTAINER_NAME is required when EVIDENCE_STORAGE_PROVIDER=azure_blob.',
      );
    }
  }

  return { provider, connectionString, containerName, requireHash };
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
    outboxWorker: readOutboxWorkerSettings(),
    auth: readAuthConfig(),
    evidenceStorage: readEvidenceStorageConfig(),
  };
}
