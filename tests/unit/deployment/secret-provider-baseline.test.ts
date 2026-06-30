import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_ENV_VARS,
  REQUIRED_INFRA_MODULES,
  FORBIDDEN_DOMAIN_TERMS,
  findSecretLikeValues,
} from '../../../src/deployment/validateDeploymentBaseline.js';

/**
 * Hermetic tests asserting the managed-identity / Key Vault binding is reflected in the
 * deployment baseline: env-var contract, IaC module presence, and absence of secrets / sport
 * terminology in the new infra files. Static file reads only — no Azure, no network.
 */
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

const NEW_INFRA_FILES = [
  'infra/azure/main.bicep',
  'infra/azure/modules/container-apps.bicep',
  'infra/azure/modules/key-vault.bicep',
  'infra/azure/modules/key-vault-access.bicep',
];

describe('secret-provider deployment baseline', () => {
  // (13) deploy:check validates the secret-provider env vars.
  it('requires the secret-provider env vars in the documented contract', () => {
    expect(REQUIRED_ENV_VARS).toContain('SECRET_PROVIDER');
    expect(REQUIRED_ENV_VARS).toContain('KEY_VAULT_URI');
    expect(REQUIRED_ENV_VARS).toContain('KEY_VAULT_SECRET_PREFIX');
  });

  it('documents the secret-provider env vars in .env.example', () => {
    const envExample = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');
    for (const name of ['SECRET_PROVIDER', 'KEY_VAULT_URI', 'KEY_VAULT_SECRET_PREFIX']) {
      expect(envExample).toMatch(new RegExp(`^${name}=`, 'm'));
    }
  });

  it('requires the Key Vault access (RBAC) module', () => {
    expect(REQUIRED_INFRA_MODULES).toContain('modules/key-vault-access.bicep');
  });

  // (14) IaC files carry no secret-like values.
  it('contains no secret-like values in the new infra files', () => {
    for (const rel of NEW_INFRA_FILES) {
      const content = readFileSync(join(REPO_ROOT, rel), 'utf8');
      expect(findSecretLikeValues(content)).toEqual([]);
    }
  });

  // (16) No sport-specific terminology leaks into the new infra files.
  it('contains no sport-specific terminology in the new infra files', () => {
    for (const rel of NEW_INFRA_FILES) {
      const content = readFileSync(join(REPO_ROOT, rel), 'utf8').toLowerCase();
      for (const term of FORBIDDEN_DOMAIN_TERMS) {
        expect(content).not.toContain(term);
      }
    }
  });
});
