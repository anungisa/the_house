import { render, type RenderResult } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

import { App } from '../App';
import type { ButtonApiClient } from '../api/client';
import type { ButtonContextSelection, ButtonContextView } from '../api/types';
import { InMemoryButtonTelemetry } from '../observability/telemetry';
import type { ButtonLocale } from '../api/types';

/** A configurable fake client: resolves a fixed view or delegates to a function. */
export class FakeButtonApiClient implements ButtonApiClient {
  calls: ButtonContextSelection[] = [];
  constructor(
    private readonly responder: (selection: ButtonContextSelection) => Promise<ButtonContextView>,
  ) {}
  getContext(selection: ButtonContextSelection): Promise<ButtonContextView> {
    this.calls.push(selection);
    return this.responder(selection);
  }
}

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
    },
  });
}

export interface RenderAppOptions {
  readonly client: ButtonApiClient;
  readonly telemetry?: InMemoryButtonTelemetry;
  readonly initialEntries?: readonly string[];
  readonly initialLocale?: ButtonLocale;
}

export interface RenderAppResult extends RenderResult {
  readonly telemetry: InMemoryButtonTelemetry;
}

export function renderApp(options: RenderAppOptions): RenderAppResult {
  const telemetry = options.telemetry ?? new InMemoryButtonTelemetry();
  const result = render(
    <App
      client={options.client}
      telemetry={telemetry}
      queryClient={testQueryClient()}
      initialEntries={options.initialEntries ?? ['/button']}
      {...(options.initialLocale !== undefined ? { initialLocale: options.initialLocale } : {})}
    />,
  );
  return Object.assign(result, { telemetry });
}
