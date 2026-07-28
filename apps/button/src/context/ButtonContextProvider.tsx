import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { ButtonApiClient } from '../api/client';
import {
  ButtonApiError,
  type ButtonContextSelection,
  type ButtonContextView,
  type ButtonErrorCategory,
} from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { newCorrelationId, type ButtonTelemetry } from '../observability/telemetry';

export interface ButtonContextState {
  readonly view: ButtonContextView | undefined;
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly errorCategory: ButtonErrorCategory | undefined;
  readonly selection: ButtonContextSelection;
  readonly correlationId: string;
  selectContext(organizationId: string, season?: string): void;
  clearContext(): void;
  refresh(): Promise<void>;
}

const ButtonContextStateContext = createContext<ButtonContextState | undefined>(undefined);

function toCategory(error: unknown): ButtonErrorCategory | undefined {
  if (error instanceof ButtonApiError) return error.category;
  if (error) return 'service-unavailable';
  return undefined;
}

export function ButtonContextProvider({
  client,
  telemetry,
  children,
}: {
  readonly client: ButtonApiClient;
  readonly telemetry: ButtonTelemetry;
  readonly children: ReactNode;
}): JSX.Element {
  const { locale } = useI18n();
  const [selection, setSelection] = useState<ButtonContextSelection>({});
  const [correlationId] = useState(() => newCorrelationId());

  const effectiveSelection = useMemo<ButtonContextSelection>(
    () => ({ ...selection, locale }),
    [selection, locale],
  );

  const query: UseQueryResult<ButtonContextView, unknown> = useQuery({
    queryKey: ['button-context', effectiveSelection.organizationId, effectiveSelection.season, locale],
    queryFn: async () => {
      try {
        const view = await client.getContext(effectiveSelection);
        telemetry.record('context.load.success', { locale, correlationId, hasOrgContext: view.currentContext !== null });
        return view;
      } catch (error) {
        const category = toCategory(error);
        telemetry.record('context.load.failure', { locale, correlationId, ...(category ? { errorCategory: category } : {}) });
        throw error;
      }
    },
    retry: (failureCount, error) => {
      // Only retry transient service errors, and never authorization/selection failures.
      if (error instanceof ButtonApiError && error.category === 'service-unavailable') {
        return failureCount < 2;
      }
      return false;
    },
  });

  const selectContext = useCallback((organizationId: string, season?: string) => {
    setSelection(season !== undefined ? { organizationId, season } : { organizationId });
  }, []);

  const clearContext = useCallback(() => setSelection({}), []);

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const value = useMemo<ButtonContextState>(
    () => ({
      view: query.data,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      errorCategory: toCategory(query.error),
      selection,
      correlationId,
      selectContext,
      clearContext,
      refresh,
    }),
    [query.data, query.isLoading, query.isFetching, query.error, selection, correlationId, selectContext, clearContext, refresh],
  );

  return (
    <ButtonContextStateContext.Provider value={value}>
      {children}
    </ButtonContextStateContext.Provider>
  );
}

export function useButtonContext(): ButtonContextState {
  const ctx = useContext(ButtonContextStateContext);
  if (ctx === undefined) {
    throw new Error('useButtonContext must be used within a ButtonContextProvider.');
  }
  return ctx;
}
