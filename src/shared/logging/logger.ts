/**
 * Minimal logger abstraction (scaffold).
 *
 * Vendor-neutral on purpose. No structured-logging or telemetry vendor is wired yet.
 *
 * TODO(observability): integrate Azure Application Insights / OpenTelemetry here
 * (trace/correlation propagation, exporters) in a later pass. Keep this interface stable
 * so call sites do not change when a real backend is added.
 */

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const LEVEL_ORDER: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Create a simple console-backed logger. Messages below `minLevel` are suppressed.
 */
export function createLogger(minLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'): Logger {
  const threshold = LEVEL_ORDER[minLevel] ?? LEVEL_ORDER.info!;

  function emit(level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: LogFields) {
    if (LEVEL_ORDER[level]! < threshold) return;
    const payload = fields !== undefined ? { ...fields } : undefined;
    const line = { level, message, ...(payload ?? {}) };
    // Console transport only for now; replace with a real exporter later.
    const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    writer(JSON.stringify(line));
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}
