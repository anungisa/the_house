/**
 * Participant Registry HTTP endpoint surface — public exports.
 *
 * Read transport: participant list + detail and an organization's participant-relationship list.
 * Write transport (PHASE 1): create a participant and update its safe profile fields. These
 * endpoints NEVER touch governed lifecycle state, NEVER invoke the Governance Kernel, and NEVER
 * enqueue an outbox message directly (the Participant Registry service owns the transactional
 * outbox). Reads use the `participant.read` action; writes use the distinct `participant.write`
 * action. Status transitions and organization-link writes are deliberately NOT part of phase 1.
 */

export {
  handleParticipantList,
  handleParticipantDetail,
  handleOrganizationParticipantList,
  participantReadErrorToHttpResult,
  PARTICIPANT_HTTP_LIST_MAX_LIMIT,
  type ParticipantReadHttpDeps,
  type ParticipantReadHttpResult,
  type ParticipantReadStore,
} from './ParticipantReadHttpAdapter.js';

export {
  type ParticipantDto,
  type ParticipantExternalRefDto,
  type OrganizationParticipantDto,
  type ParticipantPageDto,
  type ParticipantListHttpRequest,
  type ParticipantDetailHttpRequest,
  type OrganizationParticipantListHttpRequest,
  type ParticipantListResponseBody,
  type ParticipantDetailResponseBody,
  type OrganizationParticipantListResponseBody,
} from './ParticipantReadHttpDtos.js';

export { toParticipantDto } from './ParticipantReadHttpAdapter.js';

export {
  handleParticipantCreate,
  handleParticipantUpdate,
  participantWriteErrorToHttpResult,
  type ParticipantWriteHttpDeps,
  type ParticipantExistenceReader,
} from './ParticipantWriteHttpAdapter.js';

export {
  PARTICIPANT_CREATE_BODY_KEYS,
  PARTICIPANT_UPDATE_BODY_KEYS,
  type ParticipantCreateStatus,
  type ParticipantCreateRequestBody,
  type ParticipantUpdateRequestBody,
  type ParticipantCreateHttpRequest,
  type ParticipantUpdateHttpRequest,
  type ParticipantWriteResponseBody,
} from './ParticipantWriteHttpDtos.js';
