/**
 * Participant Registry HTTP endpoint surface — public exports.
 *
 * Read transport: participant list + detail and an organization's participant-relationship list.
 * Write transport: create a participant and update its safe profile fields (gated by the
 * `participant.write` action), a reference-data status transition
 * (`POST /v1/participants/:participantId/status-transitions`, gated by the distinct
 * `participant.status.write` action), and recording an organization↔participant relationship
 * (`POST /v1/organizations/:organizationId/participants`, gated by the distinct
 * `participant.organization_link.write` action), and transitioning an existing relationship's
 * reference-data status
 * (`POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions`, gated
 * by the SAME `participant.organization_link.write` action). These endpoints NEVER touch governed
 * lifecycle state, NEVER invoke the Governance Kernel, and NEVER enqueue an outbox message directly
 * (the Participant Registry service owns the transactional outbox). Reads use the `participant.read`
 * action.
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
  handleParticipantStatusTransition,
  handleOrganizationParticipantLink,
  handleOrganizationParticipantStatusTransition,
  participantWriteErrorToHttpResult,
  type ParticipantWriteHttpDeps,
  type ParticipantExistenceReader,
} from './ParticipantWriteHttpAdapter.js';

export {
  PARTICIPANT_CREATE_BODY_KEYS,
  PARTICIPANT_UPDATE_BODY_KEYS,
  PARTICIPANT_STATUS_TRANSITION_BODY_KEYS,
  PARTICIPANT_STATUS_TRANSITION_REASON_MAX_LENGTH,
  type ParticipantCreateStatus,
  type ParticipantCreateRequestBody,
  type ParticipantUpdateRequestBody,
  type ParticipantCreateHttpRequest,
  type ParticipantUpdateHttpRequest,
  type ParticipantWriteResponseBody,
  type ParticipantStatusTransitionRequestBody,
  type ParticipantStatusTransitionHttpRequest,
  type ParticipantStatusTransitionResponseBody,
  PARTICIPANT_ORGANIZATION_LINK_BODY_KEYS,
  type OrganizationParticipantLinkRequestBody,
  type OrganizationParticipantLinkHttpRequest,
  type OrganizationParticipantLinkResponseBody,
  PARTICIPANT_ORGANIZATION_LINK_STATUS_TRANSITION_BODY_KEYS,
  PARTICIPANT_ORGANIZATION_LINK_STATUS_TRANSITION_REASON_MAX_LENGTH,
  type OrganizationParticipantStatusTransitionRequestBody,
  type OrganizationParticipantStatusTransitionHttpRequest,
  type OrganizationParticipantStatusTransitionResponseBody,
} from './ParticipantWriteHttpDtos.js';
