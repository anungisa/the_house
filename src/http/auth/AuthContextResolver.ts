/**
 * Edge-identity resolver contract + selection.
 *
 * An {@link AuthContextResolver} turns a parsed HTTP request (headers + body) into a trusted
 * {@link AuthContext}, or throws an {@link UnauthenticatedError}/{@link ForbiddenError}. The
 * HTTP adapter depends ONLY on this interface, so the same adapter serves demo and
 * trusted-headers modes (and any future JWT/Entra resolver) without change.
 *
 * Resolvers are read-only: they NEVER touch the kernel, stores, or governed state. They only
 * establish identity. Authorization of the governed action remains the kernel's job.
 */

import type { AppConfig } from '../../config/index.js';
import type { AuthContext } from './AuthContext.js';
import { DemoAuthContextResolver } from './DemoAuthContextResolver.js';
import { TrustedHeadersAuthContextResolver } from './TrustedHeadersAuthContextResolver.js';

/** The parsed request surface a resolver inspects. */
export interface AuthResolveInput {
  /** Lowercased header map (native Node http lowercases header keys). */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body (or undefined when none was sent). */
  readonly body: unknown;
}

export interface AuthContextResolver {
  /** The mode this resolver implements (diagnostics). */
  readonly mode: 'demo' | 'trusted_headers';
  /** Resolve a trusted identity context or throw an Unauthenticated/Forbidden error. */
  resolve(input: AuthResolveInput): AuthContext;
}

export { TRUSTED_HEADER_NAMES } from './TrustedHeadersAuthContextResolver.js';

/**
 * Select the resolver for the configured {@link AppConfig.auth} mode. An unknown mode is
 * impossible here because `loadConfig` fails closed on an invalid AUTH_MODE; the exhaustive
 * switch keeps that guarantee at the type level.
 */
export function createAuthContextResolver(config: AppConfig): AuthContextResolver {
  switch (config.auth.mode) {
    case 'demo':
      return new DemoAuthContextResolver();
    case 'trusted_headers':
      return new TrustedHeadersAuthContextResolver();
  }
}
