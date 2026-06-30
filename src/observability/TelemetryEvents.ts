/**
 * Stable telemetry name and attribute-key constants.
 *
 * Names are intentionally generic and platform-oriented (HTTP, authz, workflow, evidence,
 * quarantine, outbox). They MUST NOT encode any sport-, league-, or tenant-specific terms —
 * telemetry is governed-domain-agnostic operational visibility. Keeping every name in one
 * place gives us a single source of truth for dashboards/alerts in a future pass and lets a
 * test assert the no-domain-terminology rule mechanically.
 */

/** Counter metric names (monotonic increments). */
export const TelemetryCounters = {
  httpRequest: 'http.request.count',
  httpRequestError: 'http.request.error.count',
  authzDenied: 'authz.denied.count',
  workflowRead: 'workflow.read.count',
  workflowDecision: 'workflow.decision.count',
  workflowExecution: 'workflow.execution.count',
  evidenceUpload: 'evidence.upload.count',
  evidenceUploadRejected: 'evidence.upload.rejected.count',
  evidenceQuarantineRecorded: 'evidence.quarantine.recorded.count',
  evidenceQuarantineDisposition: 'evidence.quarantine.disposition.count',
  outboxBatch: 'outbox.batch.count',
  outboxMessagePublished: 'outbox.message.published.count',
  outboxMessageFailed: 'outbox.message.failed.count',
} as const;

/** Duration metric names (milliseconds). */
export const TelemetryDurations = {
  httpRequest: 'http.request.duration_ms',
  workflowDecision: 'workflow.decision.duration_ms',
  workflowExecution: 'workflow.execution.duration_ms',
  evidenceUpload: 'evidence.upload.duration_ms',
  outboxBatch: 'outbox.batch.duration_ms',
} as const;

/** Operational event names (point-in-time, sanitized). */
export const TelemetryEvents = {
  authzDenied: 'authz.denied',
  workflowDecisionRecorded: 'workflow.decision.recorded',
  workflowExecutionRequested: 'workflow.execution.requested',
  evidenceQuarantineRecorded: 'evidence.quarantine.recorded',
  evidenceQuarantineDispositionRecorded: 'evidence.quarantine.disposition.recorded',
  outboxBatchCompleted: 'outbox.batch.completed',
  outboxBatchFailed: 'outbox.batch.failed',
} as const;

/** Stable, low-cardinality attribute keys. */
export const TelemetryAttributeKeys = {
  method: 'method',
  route: 'route',
  status: 'status',
  result: 'result',
  operation: 'operation',
  action: 'action',
  reason: 'reason',
  scanStatus: 'scanStatus',
  disposition: 'disposition',
  requestId: 'requestId',
  correlationId: 'correlationId',
  workerId: 'workerId',
  claimed: 'claimed',
  published: 'published',
  failed: 'failed',
  rescheduled: 'rescheduled',
} as const;

/** Stable attribute VALUES for the `result` dimension. */
export const TelemetryResult = {
  success: 'success',
  failure: 'failure',
} as const;

/** Every telemetry name in one array — used by guard tests (e.g. no domain terminology). */
export const ALL_TELEMETRY_NAMES: readonly string[] = [
  ...Object.values(TelemetryCounters),
  ...Object.values(TelemetryDurations),
  ...Object.values(TelemetryEvents),
];
