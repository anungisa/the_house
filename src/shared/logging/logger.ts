/**
 * Minimal structured logger (platform observability hardening).
 *
 * Vendor-neutral on purpose — no telemetry vendor is wired yet. Emits a single JSON object
 * per line to the console transport with a stable shape: `{ timestamp, level, message,
 * ...fields }`. Operational safety is built in:
 *  - secret-like metadata is redacted via {@link redactSecrets} before writing;
 *  - `Error` values are serialized to `{ name, message, stack? }` (never raw);
 *  - stack traces are included ONLY when not running in production, or when
 *    `LOG_INCLUDE_STACK=true`, so production logs do not leak internals by default.
 *
 * TODO(observability): integrate Azure Application Insights / OpenTelemetry here
 * (trace/correlation propagation, exporters) in a later pass. Keep this interface stable so
 * call sites do not change when a real backend is added.
 */

import { redactSecrets } from '../security/redaction.js';

export type LogFields = Record<string, unknown>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  /** Custom sink (defaults to console by level). Receives the serialized JSON line. */
  readonly write?: (level: LogLevel, line: string) => void;
  /** Timestamp source (defaults to ISO-8601 wall clock). Injectable for deterministic tests. */
  readonly now?: () => string;
  /**
   * Force stack-trace inclusion on/off. When omitted, stacks are included unless
   * NODE_ENV === 'production' (overridable with LOG_INCLUDE_STACK=true).
   */
  readonly includeStack?: boolean;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveIncludeStack(option: boolean | undefined): boolean {
  if (option !== undefined) return option;
  if (process.env.LOG_INCLUDE_STACK === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

/** Convert `Error` instances (at any depth) into safe plain objects. Never mutates input. */
function serializeErrors(value: unknown, includeStack: boolean, seen: WeakSet<object>): unknown {
  if (value instanceof Error) {
    const out: Record<string, unknown> = { name: value.name, message: value.message };
    if (includeStack && typeof value.stack === 'string') out.stack = value.stack;
    if (value.cause !== undefined) {
      out.cause = serializeErrors(value.cause, includeStack, seen);
    }
    return out;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => serializeErrors(item, includeStack, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = serializeErrors(child, includeStack, seen);
  }
  return out;
}

function defaultWrite(level: LogLevel, line: string): void {
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  writer(line);
}

/**
 * Create a console-backed structured logger. Messages below `minLevel` are suppressed.
 * Metadata secrets are redacted and Error values are serialized safely before emission.
 */
export function createLogger(minLevel: LogLevel = 'info', options: LoggerOptions = {}): Logger {
  const threshold = LEVEL_ORDER[minLevel] ?? LEVEL_ORDER.info;
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date().toISOString());

  function emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < threshold) return;
    const includeStack = resolveIncludeStack(options.includeStack);
    let safeFields: Record<string, unknown> | undefined;
    if (fields !== undefined) {
      const serialized = serializeErrors(fields, includeStack, new WeakSet<object>());
      safeFields = redactSecrets(serialized) as Record<string, unknown>;
    }
    const line = { timestamp: now(), level, message, ...(safeFields ?? {}) };
    write(level, JSON.stringify(line));
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}
