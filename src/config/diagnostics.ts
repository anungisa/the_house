/**
 * Operational config diagnostics (platform observability hardening).
 *
 * Produces a SAFE, redacted summary of the effective {@link AppConfig} plus advisory
 * warnings for local/demo-unsafe combinations in production-like environments. This is a
 * read-only diagnostic helper: it NEVER fails config load, NEVER prints raw secrets, and
 * NEVER contacts Azure/DB/AV. The summary is built from explicit non-secret fields (only
 * booleans/enum values for anything sensitive) and then passed through {@link redactSecrets}
 * as a defense-in-depth safety net.
 */

import { isProductionLikeEnv, loadConfig, type AppConfig } from './index.js';
import { redactSecrets } from '../shared/security/redaction.js';

export interface ConfigDiagnostics {
  /** Redacted, operational summary of the effective configuration (safe to log). */
  readonly summary: Readonly<Record<string, unknown>>;
  /** Advisory warnings for local/demo-unsafe combinations. Never blocks config load. */
  readonly warnings: readonly string[];
}

/**
 * Summarize the auth configuration WITHOUT printing secrets or tokens. For entra_jwt this
 * reports only non-sensitive presence booleans and configured claim NAMES — never the issuer
 * secrets, JWKS contents, bearer tokens, or claim values.
 */
function buildAuthSummary(config: AppConfig): Readonly<Record<string, unknown>> {
  const { auth } = config;
  if (auth.mode !== 'entra_jwt' || auth.entra === undefined) {
    return { mode: auth.mode };
  }
  const { entra } = auth;
  return {
    mode: auth.mode,
    entra: {
      issuerConfigured: entra.issuer !== '',
      audienceConfigured: entra.audience !== '',
      jwksConfigured: entra.jwksUri !== '',
      tenantIdConfigured: entra.tenantId !== '',
      claims: {
        userIdClaim: entra.userIdClaim,
        tenantIdClaim: entra.tenantIdClaim,
        roleClaim: entra.roleClaim,
        permissionClaim: entra.permissionClaim,
        ...(entra.organizationIdClaim !== undefined
          ? { organizationIdClaim: entra.organizationIdClaim }
          : {}),
        ...(entra.organizationUnitIdClaim !== undefined
          ? { organizationUnitIdClaim: entra.organizationUnitIdClaim }
          : {}),
      },
    },
  };
}

/**
 * Build a redacted operational summary and advisory warnings from an {@link AppConfig}.
 * Defaults to loading the process config when none is supplied.
 */
export function buildConfigDiagnostics(config: AppConfig = loadConfig()): ConfigDiagnostics {
  const productionLike = isProductionLikeEnv(config.appEnv);

  const summary: Record<string, unknown> = {
    appEnv: config.appEnv,
    appRegion: config.appRegion,
    logLevel: config.logLevel,
    productionLike,
    api: { host: config.api.host, port: config.api.port },
    auth: buildAuthSummary(config),
    database: { configured: config.databaseUrl !== '' },
    serviceBus: {
      enabled: config.serviceBus.enabled,
      publishTarget: config.serviceBus.publishTarget,
      queueName: config.serviceBus.queueName,
      topicName: config.serviceBus.topicName,
      connectionConfigured: config.serviceBus.connectionString !== '',
    },
    evidenceStorage: {
      provider: config.evidenceStorage.provider,
      containerName: config.evidenceStorage.containerName,
      requireHash: config.evidenceStorage.requireHash,
      uploadMaxBytes: config.evidenceStorage.uploadMaxBytes,
      connectionConfigured: config.evidenceStorage.connectionString !== '',
    },
    evidenceMalwareScanning: {
      mode: config.evidenceMalwareScanning.mode,
      required: config.evidenceMalwareScanning.required,
      testSignaturesEnabled: config.evidenceMalwareScanning.testSignaturesEnabled,
    },
    outbox: {
      batchSize: config.outbox.batchSize,
      lockSeconds: config.outbox.lockSeconds,
      baseDelayMs: config.outbox.baseDelayMs,
      maxDelayMs: config.outbox.maxDelayMs,
      maxRetries: config.outbox.maxRetries,
    },
    outboxWorker: {
      enabled: config.outboxWorker.enabled,
      intervalMs: config.outboxWorker.intervalMs,
      batchSize: config.outboxWorker.batchSize,
      workerId: config.outboxWorker.workerId,
      lockSeconds: config.outboxWorker.lockSeconds,
      runOnce: config.outboxWorker.runOnce,
    },
  };

  const warnings: string[] = [];

  if (config.auth.mode === 'demo' && productionLike) {
    warnings.push(
      'AUTH_MODE=demo is body-trusted and unsafe outside local/test: set AUTH_MODE=trusted_headers behind a validating identity edge.',
    );
  }

  if (config.auth.mode === 'trusted_headers') {
    warnings.push(
      'AUTH_MODE=trusted_headers trusts x-house-* headers: ensure a verifying reverse proxy/identity edge strips and re-injects them (this adapter does NOT validate JWTs).',
    );
  }

  if (config.evidenceStorage.provider === 'memory' && productionLike) {
    warnings.push(
      'EVIDENCE_STORAGE_PROVIDER=memory is non-durable and unsafe in a production-like environment: configure azure_blob.',
    );
  }

  if (
    config.evidenceMalwareScanning.mode === 'disabled' &&
    config.evidenceStorage.provider === 'azure_blob'
  ) {
    warnings.push(
      'EVIDENCE_MALWARE_SCANNING_MODE=disabled while EVIDENCE_STORAGE_PROVIDER=azure_blob: durable evidence is stored without a scan gate.',
    );
  }

  if (!config.serviceBus.enabled && productionLike) {
    warnings.push(
      'SERVICE_BUS_ENABLED=false in a production-like environment: outbox messages will publish to the no-op broker and never leave the database.',
    );
  }

  if (!config.outboxWorker.enabled && productionLike) {
    warnings.push(
      'OUTBOX_WORKER_ENABLED=false in a production-like environment: the transactional outbox will not drain.',
    );
  }

  return { summary: redactSecrets(summary), warnings };
}
