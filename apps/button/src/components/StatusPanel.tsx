import type { ReactNode } from 'react';

export type StatusPanelKind = 'loading' | 'empty' | 'denied' | 'expired' | 'service-error';

/**
 * A distinguishable, accessible status panel for the loading / empty / denied / expired /
 * service-error states. Each kind carries its OWN heading + descriptive text and a text status
 * label (never colour-only), and uses `role="status"` for progress and `role="alert"` for errors
 * so assistive technology announces the change.
 */
export function StatusPanel({
  kind,
  heading,
  body,
  statusLabel,
  children,
}: {
  readonly kind: StatusPanelKind;
  readonly heading: string;
  readonly body: string;
  readonly statusLabel: string;
  readonly children?: ReactNode;
}): JSX.Element {
  const isBusy = kind === 'loading';
  return (
    <section
      className={`status-panel status-panel--${kind}`}
      role={isBusy ? 'status' : 'alert'}
      aria-live={isBusy ? 'polite' : 'assertive'}
      data-status-kind={kind}
    >
      <p className="status-panel__label" data-testid="status-label">
        <span aria-hidden="true" className="status-panel__glyph">
          {kind === 'loading' ? '\u23F3' : kind === 'empty' ? '\u2205' : kind === 'expired' ? '\u23F0' : '\u26A0'}
        </span>
        <span className="status-panel__label-text">{statusLabel}</span>
      </p>
      <h2 className="status-panel__heading">{heading}</h2>
      <p className="status-panel__body">{body}</p>
      {children}
    </section>
  );
}
