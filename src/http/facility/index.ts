/**
 * Facility Registry HTTP endpoint surface — public exports.
 *
 * READ transport: list + detail over the Facility Registry read store, plus one organization's
 * facilities list. WRITE transport: create + update + status transition over the validated
 * {@link FacilityRegistryService}. The write handlers NEVER enqueue outbox messages, touch governed
 * state, invoke the Governance Kernel, or mutate the Organization Registry (the service only READS
 * it). Read authorization is the centralized `facility.read` action; create/update use
 * `facility.write`; a facility STATUS transition uses the DISTINCT `facility.status.write` action
 * over `POST /v1/facilities/:facilityId/status-transitions` (reference-data status, not a governed
 * lifecycle FSM).
 */

export {
  handleFacilityList,
  handleFacilityDetail,
  handleOrganizationFacilityList,
  facilityReadErrorToHttpResult,
  toFacilityDto,
  FACILITY_HTTP_LIST_MAX_LIMIT,
  type FacilityReadHttpDeps,
  type FacilityReadHttpResult,
  type FacilityReadStore,
} from './FacilityReadHttpAdapter.js';

export {
  handleFacilityCreate,
  handleFacilityUpdate,
  handleFacilityStatusTransition,
  facilityWriteErrorToHttpResult,
  type FacilityWriteHttpDeps,
  type FacilityExistenceReader,
} from './FacilityWriteHttpAdapter.js';

export {
  type FacilityDto,
  type FacilityPageDto,
  type FacilityListHttpRequest,
  type FacilityDetailHttpRequest,
  type OrganizationFacilityListHttpRequest,
  type FacilityListResponseBody,
  type FacilityDetailResponseBody,
  type OrganizationFacilityListResponseBody,
} from './FacilityReadHttpDtos.js';

export {
  FACILITY_CREATE_BODY_KEYS,
  FACILITY_UPDATE_BODY_KEYS,
  FACILITY_STATUS_TRANSITION_BODY_KEYS,
  FACILITY_STATUS_TRANSITION_REASON_MAX_LENGTH,
  type FacilityCreateRequestBody,
  type FacilityUpdateRequestBody,
  type FacilityStatusTransitionRequestBody,
  type FacilityCreateHttpRequest,
  type FacilityUpdateHttpRequest,
  type FacilityStatusTransitionHttpRequest,
  type FacilityWriteResponseBody,
} from './FacilityWriteHttpDtos.js';
