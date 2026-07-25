// Analyzer: authorization and tenant-isolation posture for The House.
//
// Derives the edge authorization catalog (named actions, role→action map, the single
// platform-admin wildcard) from src/authz, and the governed-transition permission model
// from src/governance/permissions + the reviewer-scope guard. It flags whether the
// permission model is RESOURCE-AWARE (scoped to a specific entity / jurisdiction) or only
// ROLE-based. It reports edge-authorization coverage vs the governed affiliation surface.
// Static parse only; it makes no readiness claim.

import { existsSync } from 'node:fs';
import { readText } from './house-lib.mjs';

function matchAll(text, rx, mapper) {
  const out = [];
  const re = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) out.push(mapper(m));
  return out;
}

export function analyze(ctx) {
  const actionsAbs = ctx.abs('src/authz/AuthorizationActions.ts');
  const actionsText = existsSync(actionsAbs) ? readText(actionsAbs) : '';

  const actions = matchAll(actionsText, /'([a-z]+(?:\.[a-z_]+)+)'/g, (m) => m[1]);
  const uniqueActions = [...new Set(actions)].sort();
  const roles = matchAll(actionsText, /^\s{2}([a-z_]+):\s*\[/gm, (m) => m[1]).sort();
  const hasPlatformAdmin = /PLATFORM_ADMIN_ROLE\s*=\s*'([a-z_]+)'/.test(actionsText);
  const failsClosedOnUnknown = /isKnownAction|KNOWN_ACTIONS|fail closed/i.test(actionsText);

  // Governed-transition permission model.
  const permAbs = ctx.abs('src/governance/permissions/PermissionChecker.ts');
  const permText = existsSync(permAbs) ? readText(permAbs) : '';
  const permReviewerRoles = matchAll(permText, /'(reviewer|approver|admin)'/g, (m) => m[1]);
  const permInputHasEntityId = /entityId/.test(permText);
  const permUsesRolesOnly =
    /REVIEWER_ROLES|actorHasReviewerRole/.test(permText) && !permInputHasEntityId;

  // Reviewer-scope guard (production repository).
  const repoAbs = ctx.abs('src/domains/affiliation/DomainBackedAffiliationGuardRepository.ts');
  const repoText = existsSync(repoAbs) ? readText(repoAbs) : '';
  const reviewerScopeRoleOnly =
    /actorHasReviewerScope/.test(repoText) && /roles\.some/.test(repoText) && !/entityId|jurisdiction|region|assigned/i.test(
      repoText.slice(repoText.indexOf('actorHasReviewerScope')),
    );

  // Edge authorization does not cover the governed affiliation transition surface: the
  // action catalog contains no affiliation.* action (affiliation authority is the kernel).
  const affiliationEdgeActions = uniqueActions.filter((a) => a.startsWith('affiliation'));

  const authorization = {
    summary: {
      edge_action_count: uniqueActions.length,
      edge_role_count: roles.length,
      platform_admin_wildcard: hasPlatformAdmin,
      edge_fails_closed_on_unknown_action: failsClosedOnUnknown,
      governed_permission_model: permUsesRolesOnly ? 'role-based' : 'unknown',
      governed_permission_resource_aware: permInputHasEntityId,
      reviewer_scope_guard_resource_aware: !reviewerScopeRoleOnly && repoText.length > 0,
      affiliation_edge_actions: affiliationEdgeActions,
      resource_aware_authorization_gap:
        permUsesRolesOnly && reviewerScopeRoleOnly
          ? 'CONFIRMED: governed affiliation authorization is role-only; neither the permission checker nor the reviewer-scope guard binds the actor to the specific applicant entity, jurisdiction, or region.'
          : 'not-detected',
    },
    edge_actions: uniqueActions,
    edge_roles: roles,
    governed_permission: {
      model: permUsesRolesOnly ? 'role-based' : 'unknown',
      reviewer_roles: [...new Set(permReviewerRoles)].sort(),
      input_includes_entity_id: permInputHasEntityId,
      reviewer_scope_guard_role_only: reviewerScopeRoleOnly,
    },
  };

  return { authorization };
}
