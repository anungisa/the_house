/**
 * Evidence HTTP adapter — protocol-pure upload/download handlers.
 *
 * These handlers translate raw HTTP shapes into calls against the existing evidence storage
 * services and back. They are deliberately narrow: store a payload, retrieve a payload. They
 * do NOT approve/reject anything, do NOT call GovernanceKernel.transition(), do NOT classify,
 * OCR, or run review workflow. Uploads ARE gated by a malware scan (an ingestion check that
 * inspects the bytes before storage and never makes a lifecycle decision); see
 * {@link enforceEvidenceScan} and docs/architecture/evidence-malware-scanning.md. Lifecycle
 * evidence binding stays in the governance kernel; this surface only moves bytes in and out
 * of {@link EvidenceStorage}.
 *
 * Identity: evidence request bodies are binary (upload) or a storage reference (download),
 * so identity is ALWAYS carried in the shared `x-house-*` trusted-header contract — unlike
 * the affiliation adapter which reads identity from a JSON body in demo mode. In demo mode
 * those headers are trusted without verification; in trusted_headers mode a verifying edge
 * sets them. See docs/architecture/evidence-http-endpoints.md.
 */

import { randomUUID } from 'node:crypto';

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AuthContext } from '../auth/AuthContext.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { TRUSTED_HEADER_NAMES } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import { UnauthenticatedError } from '../auth/AuthErrors.js';
import type {
  EvidenceStorage,
  EvidenceObjectRef,
} from '../../governance/evidence/EvidenceStorage.js';
import { buildEvidenceStorageKey } from '../../governance/evidence/EvidenceStorage.js';
import {
  parseEvidenceStorageRef,
  type EvidenceStorageRef,
} from '../../governance/evidence/EvidenceMetadataBinding.js';
import type { StoredEvidenceWithBinding } from '../../governance/evidence/GovernanceEvidenceService.js';
import {
  enforceEvidenceScan,
  type EvidenceMalwareScanner,
} from '../../governance/evidence/scanning/index.js';
import {
  EVIDENCE_HEADER_NAMES,
  type EvidenceDownloadRequest,
  type EvidenceScanResultSummary,
  type EvidenceUploadRequest,
  type EvidenceUploadResponseBody,
} from './EvidenceHttpDtos.js';

/** Default resolver mirrors the affiliation adapter: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Minimal upload dependency: anything that stores a payload and returns its binding. */
export interface EvidenceUploadService {
  storeEvidencePayload(input: {
    readonly tenantId: string;
    readonly content: Uint8Array;
    readonly contentType: string;
    readonly evidenceObjectId?: string;
    readonly sourceFilename?: string;
    readonly correlationId?: string;
    readonly retentionClass?: string;
  }): Promise<StoredEvidenceWithBinding>;
}

/** Minimal read dependency: retrieve a stored payload by its storage reference. */
export type EvidenceReadPort = Pick<EvidenceStorage, 'getEvidenceObject' | 'provider'>;

export interface EvidenceHttpDeps {
  readonly uploadService: EvidenceUploadService;
  readonly storage: EvidenceReadPort;
  /** Maximum accepted upload size in bytes; enforced here in addition to the server cap. */
  readonly maxUploadBytes: number;
  /**
   * Malware scanner that inspects payload bytes BEFORE storage. Always present so the upload
   * path is gated; the no-op scanner (mode `disabled`) returns `skipped`.
   */
  readonly scanner: EvidenceMalwareScanner;
  /** When true, a `skipped`/`error` scan fails closed and rejects the upload. */
  readonly scanRequired: boolean;
}

/** Discriminated transport result: JSON for metadata/errors, raw bytes for a download. */
export type EvidenceHttpResult =
  | { readonly kind: 'json'; readonly status: number; readonly body: Readonly<Record<string, unknown>> }
  | { readonly kind: 'bytes'; readonly status: number; readonly contentType: string; readonly body: Uint8Array };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmedHeader(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function splitList(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Build a demo-resolver identity body from the trusted-header contract. Evidence bodies are
 * binary, so demo identity is sourced from `x-house-*` headers (trusted without verification).
 */
function identityBodyFromHeaders(
  headers: Readonly<Record<string, string | undefined>>,
): Record<string, unknown> {
  const actor: Record<string, unknown> = {
    userId: trimmedHeader(headers[TRUSTED_HEADER_NAMES.actorUserId]) ?? '',
    roleKeys: splitList(headers[TRUSTED_HEADER_NAMES.actorRoleKeys]),
    permissionKeys: splitList(headers[TRUSTED_HEADER_NAMES.actorPermissionKeys]),
  };
  const scopeType = trimmedHeader(headers[TRUSTED_HEADER_NAMES.scopeType]);
  const scopeId = trimmedHeader(headers[TRUSTED_HEADER_NAMES.scopeId]);
  const organizationId = trimmedHeader(headers[TRUSTED_HEADER_NAMES.organizationId]);
  const organizationUnitId = trimmedHeader(headers[TRUSTED_HEADER_NAMES.organizationUnitId]);
  if (scopeType !== undefined) actor['scopeType'] = scopeType;
  if (scopeId !== undefined) actor['scopeId'] = scopeId;
  if (organizationId !== undefined) actor['organizationId'] = organizationId;
  if (organizationUnitId !== undefined) actor['organizationUnitId'] = organizationUnitId;
  return {
    tenantId: trimmedHeader(headers[TRUSTED_HEADER_NAMES.tenantId]) ?? '',
    actor,
  };
}

/**
 * Resolve evidence identity from headers in both modes. Demo reads a synthesized body built
 * from the trusted headers; trusted_headers reads the verified headers directly (a binary/
 * absent body is safe — the trusted resolver only rejects identity carried in a JSON body).
 */
function resolveEvidenceAuth(
  resolver: AuthContextResolver,
  headers: Readonly<Record<string, string | undefined>>,
): Promise<AuthContext> {
  if (resolver.mode === 'demo') {
    return Promise.resolve(resolver.resolve({ headers, body: identityBodyFromHeaders(headers) }));
  }
  return Promise.resolve(resolver.resolve({ headers, body: undefined }));
}

function requireTenant(auth: AuthContext): string {
  if (auth.tenantId.trim() === '') {
    throw new UnauthenticatedError('Evidence requests require a tenant identity.');
  }
  return auth.tenantId;
}

function evidenceAppErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.EVIDENCE_NOT_FOUND:
      return 404;
    case ErrorCode.EVIDENCE_HASH_MISMATCH:
      return 409;
    case ErrorCode.EVIDENCE_MALWARE_DETECTED:
      // Unprocessable content: the upload was well-formed but its payload is not acceptable.
      return 422;
    case ErrorCode.EVIDENCE_MALWARE_SCAN_FAILED:
    case ErrorCode.EVIDENCE_MALWARE_SCAN_REQUIRED:
      // Service unavailable: scanning is required but could not complete / was not performed.
      return 503;
    case ErrorCode.NOT_IMPLEMENTED:
      return 501;
    default:
      // EVIDENCE_STORAGE_ERROR and anything unexpected collapse to a server error.
      return 500;
  }
}

/**
 * Map an error to a transport JSON result. AppErrors expose their (sanitized) code/message;
 * any non-AppError (e.g. a raw storage failure) collapses to an opaque 500 so internal
 * details never leak across the boundary.
 */
export function evidenceErrorToHttpResult(
  err: unknown,
  requestId: string,
): { kind: 'json'; status: number; body: Record<string, unknown> } {
  if (err instanceof AppError) {
    return {
      kind: 'json',
      status: evidenceAppErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    kind: 'json',
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/** Store an uploaded payload and return its governance binding metadata (never the bytes). */
export async function handleEvidenceUpload(
  deps: EvidenceHttpDeps,
  req: EvidenceUploadRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<EvidenceHttpResult> {
  try {
    const tenantId = requireTenant(await resolveEvidenceAuth(resolver, req.headers));

    const contentType = trimmedHeader(req.headers['content-type']);
    if (contentType === undefined) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'A content-type header is required for evidence upload.',
      );
    }
    if (req.content.byteLength === 0) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Evidence upload body must not be empty.');
    }
    if (req.content.byteLength > deps.maxUploadBytes) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'Evidence upload exceeds the maximum allowed size.',
      );
    }

    // Ingestion gate: scan the payload BEFORE it is stored. An infected payload (or a
    // skipped/failed scan when scanning is required) throws and is never persisted.
    const scan = await enforceEvidenceScan(
      { scanner: deps.scanner, required: deps.scanRequired },
      { content: req.content, contentType, tenantId },
    );
    const malwareScan: EvidenceScanResultSummary = {
      status: scan.status,
      scanner: scan.scanner,
      scannedAt: scan.scannedAt,
      ...(scan.signatureVersion !== undefined ? { signatureVersion: scan.signatureVersion } : {}),
    };

    const evidenceObjectId = trimmedHeader(req.headers[EVIDENCE_HEADER_NAMES.evidenceObjectId]);
    const sourceFilename = trimmedHeader(req.headers[EVIDENCE_HEADER_NAMES.sourceFilename]);
    const retentionClass = trimmedHeader(req.headers[EVIDENCE_HEADER_NAMES.retentionClass]);
    const correlationId = trimmedHeader(req.headers[EVIDENCE_HEADER_NAMES.correlationId]);

    const stored = await deps.uploadService.storeEvidencePayload({
      tenantId,
      content: req.content,
      contentType,
      ...(evidenceObjectId !== undefined ? { evidenceObjectId } : {}),
      ...(sourceFilename !== undefined ? { sourceFilename } : {}),
      ...(retentionClass !== undefined ? { retentionClass } : {}),
      ...(correlationId !== undefined ? { correlationId } : {}),
    });

    const body: EvidenceUploadResponseBody = {
      status: 'stored',
      evidenceObjectId: stored.evidenceObjectId,
      contentHash: stored.binding.contentHash,
      storageRef: stored.binding.storageRef,
      storageProvider: stored.metadata.storageProvider,
      storageContainer: stored.metadata.storageContainer,
      storageKey: stored.metadata.storageKey,
      contentType: stored.metadata.contentType,
      sizeBytes: stored.metadata.sizeBytes,
      requestId,
      malwareScan,
    };
    return { kind: 'json', status: 201, body };
  } catch (err) {
    return evidenceErrorToHttpResult(err, requestId);
  }
}

function parseDownloadRef(ref: EvidenceStorageRef): EvidenceStorageRef {
  if (
    typeof ref.provider !== 'string' ||
    typeof ref.container !== 'string' ||
    typeof ref.key !== 'string' ||
    typeof ref.contentType !== 'string' ||
    typeof ref.sha256 !== 'string'
  ) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'storageRef is malformed.');
  }
  return ref;
}

/** Retrieve a stored payload by its storage reference and return the raw bytes. */
export async function handleEvidenceDownload(
  deps: EvidenceHttpDeps,
  req: EvidenceDownloadRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<EvidenceHttpResult> {
  try {
    const tenantId = requireTenant(await resolveEvidenceAuth(resolver, req.headers));

    if (!isPlainObject(req.body)) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
    }
    const evidenceObjectId = trimmedHeader(
      typeof req.body['evidenceObjectId'] === 'string' ? req.body['evidenceObjectId'] : undefined,
    );
    const storageRefRaw =
      typeof req.body['storageRef'] === 'string' ? req.body['storageRef'] : undefined;
    if (evidenceObjectId === undefined) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'evidenceObjectId is required.');
    }
    if (storageRefRaw === undefined || storageRefRaw.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'storageRef is required.');
    }

    let ref: EvidenceStorageRef;
    try {
      ref = parseDownloadRef(parseEvidenceStorageRef(storageRefRaw));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(ErrorCode.INVALID_INPUT, 'storageRef is not a valid storage reference.');
    }

    // Tenant ownership: the storage key must live under the resolved tenant's namespace.
    const tenantPrefix = `tenants/${tenantId}/evidence/`;
    if (!ref.key.startsWith(tenantPrefix)) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Storage reference does not belong to the resolved tenant.',
      );
    }
    // Integrity: the key must match (tenant, evidenceObjectId, sha256) exactly.
    const expectedKey = buildEvidenceStorageKey(tenantId, evidenceObjectId, ref.sha256);
    if (ref.key !== expectedKey) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        'storageRef does not match the supplied evidenceObjectId.',
      );
    }

    const objectRef: EvidenceObjectRef = {
      tenantId,
      evidenceObjectId,
      storageProvider: ref.provider,
      storageContainer: ref.container,
      storageKey: ref.key,
      sha256: ref.sha256,
    };
    const result = await deps.storage.getEvidenceObject(objectRef);
    return { kind: 'bytes', status: 200, contentType: ref.contentType, body: result.content };
  } catch (err) {
    return evidenceErrorToHttpResult(err, requestId);
  }
}
