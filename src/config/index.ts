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
import { URL } from 'node:url';

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
 *  - `entra_jwt`: tenant/actor are derived from a validated `Authorization: Bearer <token>`
 *    JWT (signature/issuer/audience/expiry verified against a JWKS). This is the trusted
 *    identity boundary: neither request body nor `x-house-*` headers are trusted for identity.
 */
export type AuthMode = 'demo' | 'trusted_headers' | 'entra_jwt';

/**
 * Microsoft Entra (JWT) validation configuration. Required only when AUTH_MODE=entra_jwt.
 * Claim NAMES are configurable (NSO-generic, no sport-specific names) and default to the
 * standard Entra claims. `jwksUri` is a public endpoint, NOT a secret; tokens are never
 * logged.
 */
export interface EntraJwtConfig {
  /** Optional Entra directory (tenant) id — informational/diagnostic only. */
  readonly tenantId: string;
  /** Expected token issuer (`iss`). Required. */
  readonly issuer: string;
  /** Expected token audience (`aud`). Required. */
  readonly audience: string;
  /** JWKS endpoint used to resolve signing keys. Required. Public (not a secret). */
  readonly jwksUri: string;
  /** Claim carrying role keys (default `roles`). */
  readonly roleClaim: string;
  /** Claim carrying permission/scope keys (default `scp`). */
  readonly permissionClaim: string;
  /** Claim carrying the actor user id (default `oid`). */
  readonly userIdClaim: string;
  /** Claim carrying the House tenant id (default `tid`). */
  readonly tenantIdClaim: string;
  /** Optional claim carrying a generic organization id. */
  readonly organizationIdClaim?: string;
  /** Optional claim carrying a generic organization-unit id. */
  readonly organizationUnitIdClaim?: string;
}

export interface AuthConfig {
  readonly mode: AuthMode;
  /** Present (and validated) only when `mode === 'entra_jwt'`. */
  readonly entra?: EntraJwtConfig;
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
  /**
   * Maximum accepted evidence upload size in bytes (defaults to 10 MiB). Applies to the
   * HTTP upload endpoint regardless of provider; it does NOT require any Azure config.
   */
  readonly uploadMaxBytes: number;
}

/**
 * Evidence malware scanning mode (the ingestion gate that inspects payload bytes BEFORE
 * storage).
 *  - `disabled`  : no scanning is performed. The no-op scanner returns `skipped`. Default;
 *    keeps local/demo runtimes working with no antivirus engine.
 *  - `signature` : a deterministic, in-process signature matcher inspects the bytes. No
 *    external process, network call, or third-party AV SDK is used.
 */
export type EvidenceMalwareScanMode = 'disabled' | 'signature';

export interface EvidenceMalwareScanningConfig {
  readonly mode: EvidenceMalwareScanMode;
  /**
   * When true, an upload fails closed unless the scan returns `clean`. A `skipped`/`error`
   * scan rejects the upload. When false, scanning is best-effort: only a positive `infected`
   * result rejects the upload.
   */
  readonly required: boolean;
  /**
   * When true, the signature scanner loads the harmless EICAR test signature so the pipeline
   * can be exercised without real malware. LOCAL/DEMO/TEST ONLY; defaults to false.
   */
  readonly testSignaturesEnabled: boolean;
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
  readonly evidenceMalwareScanning: EvidenceMalwareScanningConfig;
}

/** Environments where missing required configuration must fail closed. */
const PRODUCTION_LIKE: ReadonlySet<AppEnv> = new Set<AppEnv>([
  'development',
  'staging',
  'production',
]);

/**
 * True for environments that must fail closed on missing required config (development,
 * staging, production). Local/test are NOT production-like. Exported so operational
 * diagnostics can warn about local/demo-unsafe combinations without duplicating the set.
 */
export function isProductionLikeEnv(env: AppEnv): boolean {
  return PRODUCTION_LIKE.has(env);
}

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
  if (raw !== 'demo' && raw !== 'trusted_headers' && raw !== 'entra_jwt') {
    throw new Error(
      `Invalid AUTH_MODE: "${raw}" (expected 'demo', 'trusted_headers', or 'entra_jwt').`,
    );
  }
  const mode: AuthMode = raw;
  if (mode !== 'entra_jwt') {
    return { mode };
  }
  return { mode, entra: readEntraJwtConfig() };
}

/** Parse and validate an absolute http(s) URL; fail closed on malformed input. */
function readRequiredUrl(key: string): string {
  const value = readString(key);
  if (value === undefined) {
    throw new Error(`${key} is required when AUTH_MODE=entra_jwt.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${key}: "${value}" is not a valid URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Invalid ${key}: "${value}" must be an http(s) URL.`);
  }
  return value;
}

/**
 * Resolve and validate Microsoft Entra (JWT) configuration. Called only when
 * AUTH_MODE=entra_jwt. Fails closed when issuer/audience/JWKS URI are missing or malformed.
 * Claim names default to the standard Entra claims; none are secrets.
 */
function readEntraJwtConfig(): EntraJwtConfig {
  const issuer = readRequiredUrl('ENTRA_ISSUER');
  const audience = readString('ENTRA_AUDIENCE');
  if (audience === undefined) {
    throw new Error('ENTRA_AUDIENCE is required when AUTH_MODE=entra_jwt.');
  }
  const jwksUri = readRequiredUrl('ENTRA_JWKS_URI');

  const userIdClaim = readString('ENTRA_USER_ID_CLAIM') ?? 'oid';
  const tenantIdClaim = readString('ENTRA_TENANT_ID_CLAIM') ?? 'tid';
  // The claim NAMES carrying identity must be configured (defaults applied above).
  if (userIdClaim === '') {
    throw new Error('ENTRA_USER_ID_CLAIM must name the claim carrying the actor user id.');
  }
  if (tenantIdClaim === '') {
    throw new Error('ENTRA_TENANT_ID_CLAIM must name the claim carrying the tenant id.');
  }

  const organizationIdClaim = readString('ENTRA_ORGANIZATION_ID_CLAIM');
  const organizationUnitIdClaim = readString('ENTRA_ORGANIZATION_UNIT_ID_CLAIM');

  return {
    tenantId: readString('ENTRA_TENANT_ID') ?? '',
    issuer,
    audience,
    jwksUri,
    roleClaim: readString('ENTRA_ROLE_CLAIM') ?? 'roles',
    permissionClaim: readString('ENTRA_PERMISSION_CLAIM') ?? 'scp',
    userIdClaim,
    tenantIdClaim,
    ...(organizationIdClaim !== undefined ? { organizationIdClaim } : {}),
    ...(organizationUnitIdClaim !== undefined ? { organizationUnitIdClaim } : {}),
  };
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
  const uploadMaxBytes = readPositiveInt('EVIDENCE_UPLOAD_MAX_BYTES', 10_485_760);

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

  return { provider, connectionString, containerName, requireHash, uploadMaxBytes };
}

/**
 * Resolve and validate evidence malware scanning configuration. Defaults to `disabled` so
 * local/demo/test runtimes never require a scanner. An unknown mode fails closed. A
 * `disabled` mode combined with `required=true` is contradictory and fails closed at load:
 * a deployment that requires scanning must also configure a scanner.
 */
function readEvidenceMalwareScanningConfig(): EvidenceMalwareScanningConfig {
  const raw = readString('EVIDENCE_MALWARE_SCANNING_MODE') ?? 'disabled';
  if (raw !== 'disabled' && raw !== 'signature') {
    throw new Error(
      `Invalid EVIDENCE_MALWARE_SCANNING_MODE: "${raw}" (expected 'disabled' or 'signature').`,
    );
  }
  const mode: EvidenceMalwareScanMode = raw;
  const required = readBool('EVIDENCE_MALWARE_SCANNING_REQUIRED', false);
  const testSignaturesEnabled = readBool('EVIDENCE_MALWARE_TEST_SIGNATURES_ENABLED', false);

  if (mode === 'disabled' && required) {
    throw new Error(
      'EVIDENCE_MALWARE_SCANNING_REQUIRED=true requires EVIDENCE_MALWARE_SCANNING_MODE to be a ' +
        'real scanner (e.g. signature), not disabled.',
    );
  }

  return { mode, required, testSignaturesEnabled };
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
    evidenceMalwareScanning: readEvidenceMalwareScanningConfig(),
  };
}
