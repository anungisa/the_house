// Analyzer: configuration/secrets, test estate, and operational readiness for The House.
//
// - Configuration: config + secrets modules, secret providers (env vs Azure Key Vault),
//   and fail-closed configuration signals.
// - Tests: unit vs integration file/case counts and the DB-gating posture (integration
//   suites require RUN_DB_TESTS=1 and are SKIPPED by the default hermetic `npm test`).
// - Operations: observability exporters, deployment baseline validators, infra (Azure
//   Bicep) modules, CI workflows, and the HTTP readiness probe.
// Static parse only. The test section reports what EXISTS and how it is GATED; it makes
// no claim that any DB-gated suite was executed or passed.

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { readText, walk, countMatches } from './house-lib.mjs';

function tsFiles(ctx, relDir, extra = () => true) {
  return walk(ctx.abs(relDir), (f) => f.endsWith('.ts') && extra(f));
}

function analyzeConfiguration(ctx) {
  const configFiles = tsFiles(ctx, 'src/config', (f) => !/\.test\.ts$/.test(f)).map((f) => ctx.rel(f));
  const secretFiles = tsFiles(ctx, 'src/secrets', (f) => !/\.test\.ts$/.test(f)).map((f) => ctx.rel(f));
  const idxAbs = ctx.abs('src/config/index.ts');
  const idxText = existsSync(idxAbs) ? readText(idxAbs) : '';
  const failClosed = /throw|fail.?closed|required|must be set|missing/i.test(idxText);
  const secretProviders = {
    env: secretFiles.some((f) => /EnvSecretProvider/.test(f)),
    azure_key_vault: secretFiles.some((f) => /AzureKeyVaultSecretProvider/.test(f)),
  };
  return {
    summary: {
      config_modules: configFiles.length,
      secret_modules: secretFiles.length,
      secret_providers: Object.entries(secretProviders).filter(([, v]) => v).map(([k]) => k),
      fail_closed_config_signals: failClosed,
      has_config_check_cli: existsSync(ctx.abs('scripts/config-check.ts')),
    },
    config_modules: configFiles,
    secret_modules: secretFiles,
  };
}

function analyzeTests(ctx) {
  const unit = tsFiles(ctx, 'tests/unit', (f) => /\.test\.ts$/.test(f));
  const integration = tsFiles(ctx, 'tests/integration', (f) => /\.test\.ts$/.test(f));
  const caseCount = (files) =>
    files.reduce((n, f) => n + countMatches(readText(f), /\b(it|test)\s*\(/g), 0);
  const gatedIntegration = integration.filter((f) => /RUN_DB_TESTS|DATABASE_URL/.test(readText(f)));

  const vitestAbs = ctx.abs('vitest.config.ts');
  const vitestText = existsSync(vitestAbs) ? readText(vitestAbs) : '';
  const defaultRunIsHermetic = /RUN_DB_TESTS/.test(vitestText);

  return {
    summary: {
      unit_test_files: unit.length,
      integration_test_files: integration.length,
      unit_test_cases: caseCount(unit),
      integration_test_cases: caseCount(integration),
      db_gated_integration_files: gatedIntegration.length,
      integration_gating_env: 'RUN_DB_TESTS=1',
      default_npm_test_is_hermetic: defaultRunIsHermetic,
      db_gated_suites_skipped_by_default: gatedIntegration.length,
      disclosure:
        'Every integration suite requires a live PostgreSQL database (RUN_DB_TESTS=1) and is SKIPPED by the default hermetic `npm test`. A passing hermetic unit run does not execute these suites and is not evidence of production behavior.',
    },
    unit_test_files: unit.map((f) => ctx.rel(f)),
    integration_test_files: integration.map((f) => ctx.rel(f)),
    db_gated_integration_files: gatedIntegration.map((f) => ctx.rel(f)),
  };
}

function analyzeOperations(ctx) {
  const observability = tsFiles(ctx, 'src/observability', (f) => !/\.test\.ts$/.test(f)).map((f) =>
    basename(f, '.ts'),
  );
  const validators = tsFiles(ctx, 'src/deployment', (f) => /validate/i.test(basename(f))).map((f) =>
    basename(f, '.ts'),
  );
  const infraModules = walk(ctx.abs('infra/azure/modules'), (f) => f.endsWith('.bicep')).map((f) =>
    basename(f, '.bicep'),
  );
  const infraMain = existsSync(ctx.abs('infra/azure/main.bicep'));
  const ci = walk(ctx.abs('.github/workflows'), (f) => /\.ya?ml$/.test(f)).map((f) => basename(f));
  const readinessAbs = ctx.abs('src/http/readiness.ts');
  const hasReadiness = existsSync(readinessAbs);

  // Deployed-environment evidence: infra is Bicep source only; no evidence of a
  // provisioned/live House environment is asserted by the repository.
  const deployedEnvironmentEvidence = false;

  return {
    summary: {
      observability_exporters: observability,
      deployment_validators: validators.length,
      infra_bicep_main_present: infraMain,
      infra_bicep_modules: infraModules,
      ci_workflows: ci,
      http_readiness_probe: hasReadiness,
      deployed_house_environment_evidence: deployedEnvironmentEvidence,
      operational_note:
        'Infrastructure is Azure Bicep source (skeleton + parameter examples) and deployment baseline validators are static checks. The repository provides no evidence of a provisioned, running House v2 environment; deployment/operational readiness is therefore unproven at runtime.',
    },
    deployment_validators: validators,
    infra_modules: infraModules,
    ci_workflows: ci,
  };
}

export function analyze(ctx) {
  return {
    configuration: analyzeConfiguration(ctx),
    tests: analyzeTests(ctx),
    operations: analyzeOperations(ctx),
  };
}
