import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingError } from "../../shared/api/client";
import {
  adoptEnterpriseDecision,
  createCoordinationNotice,
  fetchEnterprisePlans,
  fetchEnterpriseWorkspace,
  previewEnterpriseDecision,
  recordEnterpriseOutcome,
} from "./api";
import type { CoordinationNoticeWrite, EnterprisePlanRequest, OutcomeWrite, WorkspaceKind } from "./types";

export function useEnterpriseOperations(view?: WorkspaceKind) {
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: ["enterprise-operations-workspace", view ?? "own"],
    queryFn: () => fetchEnterpriseWorkspace(view),
  });
  const plans = useQuery({
    queryKey: ["enterprise-operations-plans"],
    queryFn: fetchEnterprisePlans,
  });
  const preview = useMutation({ mutationFn: (scenarioId: string) => previewEnterpriseDecision(scenarioId, view) });
  const adopt = useMutation({
    mutationFn: (payload: EnterprisePlanRequest) => adoptEnterpriseDecision(payload, view),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["enterprise-operations-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["enterprise-operations-workspace"] });
    },
  });
  const outcome = useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: OutcomeWrite }) => recordEnterpriseOutcome(planId, payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["enterprise-operations-plans"] }),
  });
  const notice = useMutation({
    mutationFn: (payload: CoordinationNoticeWrite) => createCoordinationNotice(payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["enterprise-operations-workspace"] }),
  });
  const error = workspace.error ?? plans.error ?? preview.error ?? adopt.error ?? outcome.error ?? notice.error;
  return {
    workspace,
    plans: plans.data?.plans ?? [],
    preview,
    adopt,
    outcome,
    notice,
    error: error ? userFacingError(error) : "",
    clearDecision: () => { preview.reset(); adopt.reset(); },
  };
}
