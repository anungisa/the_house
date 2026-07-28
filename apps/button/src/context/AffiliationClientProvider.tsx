import { createContext, useContext, type ReactNode } from 'react';

import type { AffiliationApiClient } from '../api/affiliationClient';

const AffiliationClientContext = createContext<AffiliationApiClient | undefined>(undefined);

/**
 * Provides the injectable affiliation-draft API client to the affiliation routes and hooks. The
 * app depends on the interface, never on `fetch` directly, so tests and the e2e suite substitute a
 * deterministic transport.
 */
export function AffiliationClientProvider({
  client,
  children,
}: {
  readonly client: AffiliationApiClient;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <AffiliationClientContext.Provider value={client}>{children}</AffiliationClientContext.Provider>
  );
}

export function useAffiliationClient(): AffiliationApiClient {
  const client = useContext(AffiliationClientContext);
  if (client === undefined) {
    throw new Error('useAffiliationClient must be used within an AffiliationClientProvider.');
  }
  return client;
}
