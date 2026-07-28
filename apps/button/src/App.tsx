import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { I18nProvider } from './i18n/I18nProvider';
import type { ButtonLocale } from './api/types';
import { ButtonContextProvider } from './context/ButtonContextProvider';
import { AppRoutes } from './routing/AppRoutes';
import { createButtonApiClient, type ButtonApiClient } from './api/client';
import {
  ConsoleButtonTelemetry,
  type ButtonTelemetry,
} from './observability/telemetry';

export interface AppProps {
  /** Injectable API client (defaults to the env-selected transport). */
  readonly client?: ButtonApiClient;
  /** Injectable telemetry sink (defaults to the console sink). */
  readonly telemetry?: ButtonTelemetry;
  /** Injectable initial locale (tests). */
  readonly initialLocale?: ButtonLocale;
  /**
   * Router override for tests: a MemoryRouter with initial entries. Production uses BrowserRouter.
   */
  readonly initialEntries?: readonly string[];
  /** Injectable QueryClient (tests disable retries/gc). */
  readonly queryClient?: QueryClient;
}

function defaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 60_000, refetchOnWindowFocus: false },
    },
  });
}

/**
 * Root application. Composition is fully injectable so the component/route/a11y tests and the
 * e2e browser suite can substitute a deterministic API client, telemetry sink, locale, router,
 * and query client without touching the production wiring.
 */
export function App({
  client,
  telemetry,
  initialLocale,
  initialEntries,
  queryClient,
}: AppProps): JSX.Element {
  const apiClient = client ?? createButtonApiClient();
  const sink = telemetry ?? new ConsoleButtonTelemetry();
  const qc = queryClient ?? defaultQueryClient();

  const RouterShell = ({ children }: { readonly children: ReactNode }): JSX.Element =>
    initialEntries !== undefined ? (
      <MemoryRouter initialEntries={[...initialEntries]}>{children}</MemoryRouter>
    ) : (
      <BrowserRouter>{children}</BrowserRouter>
    );

  return (
    <QueryClientProvider client={qc}>
      <I18nProvider {...(initialLocale !== undefined ? { initialLocale } : {})}>
        <ButtonContextProvider client={apiClient} telemetry={sink}>
          <RouterShell>
            <AppRoutes telemetry={sink} />
          </RouterShell>
        </ButtonContextProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
