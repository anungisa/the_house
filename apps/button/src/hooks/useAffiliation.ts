import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useAffiliationClient } from '../context/AffiliationClientProvider';
import {
  AffiliationApiError,
  type AffiliationApplicationProjection,
  type AffiliationErrorCategory,
  type AffiliationOverview,
  type DraftResponseInput,
  type SubmissionReceipt,
} from '../api/affiliationTypes';

/** Stable query keys for the affiliation surface. */
export const affiliationKeys = {
  overview: (organizationId: string, season: string, pathway: string) =>
    ['affiliation', 'overview', organizationId, season, pathway] as const,
  application: (applicationId: string) => ['affiliation', 'application', applicationId] as const,
  reviewQueue: () => ['affiliation', 'review-queue'] as const,
  submissionState: (applicationId: string) =>
    ['affiliation', 'submission-state', applicationId] as const,
};

/** Map any thrown value to a stable, non-leaking error category. */
export function toAffiliationCategory(error: unknown): AffiliationErrorCategory | undefined {
  if (error instanceof AffiliationApiError) return error.category;
  if (error) return 'service-unavailable';
  return undefined;
}

/** Load the begin-vs-resume overview for an organization + season. */
export function useAffiliationOverview(
  organizationId: string | undefined,
  season: string | undefined,
  pathway = 'new_affiliation',
): UseQueryResult<AffiliationOverview, unknown> {
  const client = useAffiliationClient();
  return useQuery({
    queryKey: affiliationKeys.overview(organizationId ?? '', season ?? '', pathway),
    enabled: organizationId !== undefined && season !== undefined,
    queryFn: () => client.getOverview({ organizationId: organizationId!, season: season!, pathway }),
    retry: retryTransient,
  });
}

/** Load the full projection for a specific application (safe to deep-link / resume). */
export function useAffiliationApplication(
  applicationId: string | undefined,
): UseQueryResult<AffiliationApplicationProjection, unknown> {
  const client = useAffiliationClient();
  return useQuery({
    queryKey: affiliationKeys.application(applicationId ?? ''),
    enabled: applicationId !== undefined,
    queryFn: () => client.getApplication(applicationId!),
    retry: retryTransient,
  });
}

function retryTransient(failureCount: number, error: unknown): boolean {
  if (error instanceof AffiliationApiError && error.category === 'service-unavailable') {
    return failureCount < 2;
  }
  return false;
}

/** Initiate (or idempotently resume) an application for an org + season. */
export function useInitiateAffiliation() {
  const client = useAffiliationClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { organizationId: string; seasonId: string; pathway?: string }) =>
      client.initiate(input),
    onSuccess: (application) => {
      queryClient.setQueryData(affiliationKeys.application(application.applicationId), application);
    },
  });
}

/** Save draft responses under optimistic concurrency (If-Match). */
export function useSaveDraft(applicationId: string) {
  const client = useAffiliationClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedVersion: string; responses: readonly DraftResponseInput[] }) =>
      client.saveDraft({ applicationId, expectedVersion: input.expectedVersion, responses: input.responses }),
    onSuccess: (application) => {
      queryClient.setQueryData(affiliationKeys.application(applicationId), application);
    },
  });
}

/** Associate a governed evidence payload with a requirement (association ≠ acceptance). */
export function useAssociateEvidence(applicationId: string) {
  const client = useAffiliationClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requirementCode: string; file: File }) =>
      client.associateEvidence({ applicationId, requirementCode: input.requirementCode, file: input.file }),
    onSuccess: (application) => {
      queryClient.setQueryData(affiliationKeys.application(applicationId), application);
    },
  });
}

/** Remove a previously associated evidence reference. */
export function useRemoveEvidence(applicationId: string) {
  const client = useAffiliationClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { linkId: string }) =>
      client.removeEvidence({ applicationId, linkId: input.linkId }),
    onSuccess: (application) => {
      queryClient.setQueryData(affiliationKeys.application(applicationId), application);
    },
  });
}

/** Execute the consequential governed submission and receive an immutable receipt. */
export function useSubmitAffiliation(applicationId: string) {
  const client = useAffiliationClient();
  const queryClient = useQueryClient();
  return useMutation<SubmissionReceipt, unknown, { expectedVersion: string; idempotencyKey: string }>({
    mutationFn: (input) => {
      if (client.submit === undefined) {
        throw new AffiliationApiError(
          'service-unavailable',
          503,
          'Affiliation submission is unavailable.',
        );
      }
      return client.submit({
          applicationId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
        });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: affiliationKeys.application(applicationId) });
    },
  });
}

export function useAffiliationReviewQueue() {
  const client = useAffiliationClient();
  return useQuery({
    queryKey: affiliationKeys.reviewQueue(),
    queryFn: () => {
      if (client.listReviewQueue === undefined) {
        throw new AffiliationApiError('service-unavailable', 0, 'Review queue is unavailable.');
      }
      return client.listReviewQueue();
    },
    retry: retryTransient,
  });
}

export function useStartAffiliationReview() {
  const client = useAffiliationClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) => {
      if (client.startReview === undefined) {
        throw new AffiliationApiError('service-unavailable', 0, 'Review start is unavailable.');
      }
      return client.startReview(applicationId, `review-start-${applicationId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: affiliationKeys.reviewQueue() }),
  });
}

export function useAffiliationSubmissionState(
  applicationId: string | undefined,
  enabled = true,
) {
  const client = useAffiliationClient();
  return useQuery({
    queryKey: affiliationKeys.submissionState(applicationId ?? ''),
    enabled: enabled && applicationId !== undefined,
    queryFn: () => {
      if (client.getSubmissionState === undefined) {
        throw new AffiliationApiError('service-unavailable', 0, 'Submission state is unavailable.');
      }
      return client.getSubmissionState(applicationId!);
    },
    retry: retryTransient,
  });
}

export function useResubmitAffiliationCorrection(applicationId: string) {
  const client = useAffiliationClient();
  const queryClient = useQueryClient();
  return useMutation<
    SubmissionReceipt,
    unknown,
    { correctionRequestId: string; expectedVersion: string; idempotencyKey: string }
  >({
    mutationFn: (input) => {
      if (client.resubmitCorrection === undefined) {
        throw new AffiliationApiError('service-unavailable', 0, 'Resubmission is unavailable.');
      }
      return client.resubmitCorrection({ applicationId, ...input });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: affiliationKeys.application(applicationId) });
      void queryClient.invalidateQueries({
        queryKey: affiliationKeys.submissionState(applicationId),
      });
    },
  });
}
