/**
 * Participant Registry HTTP endpoint surface — public exports.
 *
 * A single narrow, READ-ONLY transport: participant list + detail and an organization's
 * participant-relationship list over the Participant Registry read store. These endpoints NEVER
 * mutate the registry, enqueue outbox messages, touch governed state, or invoke the Governance
 * Kernel. Authorization is the centralized `participant.read` action.
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
