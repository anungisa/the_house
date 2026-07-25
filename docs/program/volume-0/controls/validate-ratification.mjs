// Control: ratification integrity for the Volume 0 corpus.
//
// A chapter/annex may claim RATIFIED only when it has an owner and approver, a
// covering ratified approval in REG-006 (direct artifact_id or package scope), an
// allowed evidence label, and no fabricated claim of independent assurance.

import { Severity, makeFinding, runStandalone } from './lib.mjs';

const ALLOWED_LABELS = new Set([
  'AUTHOR-VERIFIED',
  'SELF-ATTESTED',
  'SELF-ATTESTED / AUTHOR-VERIFIED',
  'DOMAIN-VALIDATED',
  'PEER-REVIEWED',
  'AUTOMATED-EVIDENCE',
  'INDEPENDENTLY-ASSESSED',
  'EXECUTIVE-ACCEPTED',
  'PRODUCTION-PROVEN'
]);

const INDEPENDENT_LABELS = new Set([
  'INDEPENDENTLY-ASSESSED',
  'EXECUTIVE-ACCEPTED',
  'PRODUCTION-PROVEN'
]);

function records(ctx, regId) {
  return ctx.registers[regId]?.doc?.records ?? [];
}

export function run(ctx) {
  const findings = [];
  const approvals = records(ctx, 'REG-006');

  const ratifiedApprovals = approvals.filter((a) => a.approval_state === 'ratified');

  function coveringApproval(id) {
    return ratifiedApprovals.find(
      (a) => a.artifact_id === id || (Array.isArray(a.scope) && a.scope.includes(id))
    );
  }

  for (const ch of ctx.chapters) {
    if (ch.status !== 'RATIFIED') continue;

    const cover = coveringApproval(ch.fileId);
    if (!cover) {
      findings.push(
        makeFinding(Severity.ERROR, 'FALSE_RATIFICATION', `${ch.fileId}: RATIFIED but no covering ratified approval in REG-006`, ch.fileId)
      );
    }

    // The accountable approver is established either by the chapter header or,
    // for package-scoped annexes, by the covering approval's approver_role.
    const hasApprover = Boolean(ch.approver) || Boolean(cover && cover.approver_role);
    const hasOwner = Boolean(ch.owner) || Boolean(cover);
    if (!hasOwner) {
      findings.push(makeFinding(Severity.ERROR, 'FALSE_RATIFICATION', `${ch.fileId}: RATIFIED without an identifiable owner`, ch.fileId));
    }
    if (!hasApprover) {
      findings.push(makeFinding(Severity.ERROR, 'FALSE_RATIFICATION', `${ch.fileId}: RATIFIED without an identifiable approver`, ch.fileId));
    }

    // Evidence-label honesty from the Ratification header line.
    const line = ch.ratification || '';
    const labelMatch = line.match(/evidence\s+([A-Z][A-Z /-]+?)(?:;|$)/);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      if (!ALLOWED_LABELS.has(label)) {
        findings.push(
          makeFinding(Severity.ERROR, 'EVIDENCE_LABEL_INVALID', `${ch.fileId}: evidence label "${label}" is not a recognized label`, ch.fileId)
        );
      }
      if (INDEPENDENT_LABELS.has(label)) {
        findings.push(
          makeFinding(Severity.WARNING, 'INDEPENDENCE_CLAIMED', `${ch.fileId}: claims independent-grade evidence (${label}); confirm an independent approval exists`, ch.fileId)
        );
      }
    }
    if (/independent validation (confirmed|complete|completed|provided|obtained|achieved)/i.test(line)) {
      findings.push(
        makeFinding(Severity.ERROR, 'FABRICATED_ASSURANCE', `${ch.fileId}: ratification line asserts independent validation as achieved`, ch.fileId)
      );
    }
  }

  // Ratified approvals bearing independent-grade labels must not be self-signed by the author.
  for (const a of ratifiedApprovals) {
    if (INDEPENDENT_LABELS.has(a.evidence_label) && /Aubert Nungisa|Accountable Program Authority/i.test(a.approver_role || '')) {
      findings.push(
        makeFinding(Severity.ERROR, 'FABRICATED_ASSURANCE', `${a.id}: independent-grade evidence label self-signed by the accountable author`, a.id)
      );
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runStandalone('Volume 0 ratification integrity', run);
}
