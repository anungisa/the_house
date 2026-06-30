/**
 * Evidence quarantine REVIEW/DISPOSITION HTTP DTOs.
 *
 * The quarantine review surface lets an authorized SECURITY OPERATOR (1) list quarantine
 * events, (2) inspect one, and (3) record a disposition (reviewed/released/discarded). These
 * DTOs are stable, NSO-generic projections — they never expose raw database rows and carry no
 * sport-specific vocabulary. Identity (tenant + actor) is ALWAYS carried in the shared
 * `x-house-*` trusted-header contract; query/path/body inputs never carry identity.
 *
 * No raw payload bytes exist anywhere in the quarantine model, so none can appear here. The
 * operator-facing views intentionally DO include the uploader id + source filename (a security
 * operator legitimately needs them to investigate); the disposition OUTBOX payload, by
 * contrast, excludes them (defence-in-depth).
 */

import type {
  QuarantineDisposition,
  QuarantineScanStatus,
  QuarantineStatus,
} from '../../governance/evidence/quarantine/index.js';

/** A parsed list request: header identity + raw query parameters (already routed). */
export interface QuarantineListHttpRequest {
  /** Header map with lowercased names (native Node http lowercases header keys). */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Raw query parameters (string values). Validated by the adapter; identity is ignored. */
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** A parsed detail request: the quarantine event id from the path + header identity. */
export interface QuarantineDetailHttpRequest {
  readonly quarantineEventId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/** A parsed disposition request: the event id from the path + header identity + JSON body. */
export interface QuarantineDispositionHttpRequest {
  readonly quarantineEventId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/** A sanitized quarantine event row in a list/detail response. */
export interface QuarantineEventDto {
  readonly quarantineEventId: string;
  readonly evidenceObjectId: string | null;
  readonly sourceFilename: string | null;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
  readonly scanStatus: QuarantineScanStatus;
  readonly scanner: string;
  readonly signatureVersion: string | null;
  readonly threatName: string | null;
  readonly reason: string | null;
  readonly quarantineStatus: QuarantineStatus;
  readonly uploadActorUserId: string | null;
  readonly reviewedByUserId: string | null;
  readonly reviewedAt: string | null;
  readonly dispositionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The stable JSON body for a quarantine list response. */
export type QuarantineListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly QuarantineEventDto[];
  /** Opaque cursor for the next page, or null when the result set is exhausted. */
  readonly nextCursor: string | null;
  readonly requestId: string;
};

/** The stable JSON body for a quarantine detail response. */
export type QuarantineDetailResponseBody = {
  readonly status: 'ok';
  readonly event: QuarantineEventDto;
  readonly requestId: string;
};

/** The stable JSON body for a successful disposition response. */
export type QuarantineDispositionResponseBody = {
  readonly status: 'ok';
  readonly quarantineEventId: string;
  readonly previousStatus: QuarantineStatus;
  readonly newStatus: QuarantineStatus;
  readonly disposition: QuarantineDisposition;
  readonly requestId: string;
};
