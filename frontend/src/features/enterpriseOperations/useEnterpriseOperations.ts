import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingError } from "../../shared/api/client";
import {
  adoptEnterpriseDecision,
  compareEnterpriseScenarios,
  createCoordinationNotice,
  fetchEnterprisePlans,
  fetchEnterpriseWorkspace,
  previewEnterpriseDecision,
  recordEnterpriseOutcome,
  validateEnterpriseCsv,
} from "./api";
import type { CoordinationNoticeWrite, EnterprisePlanRequest, OperationsJobInput, OperationsScenario, OutcomeWrite, WorkspaceKind } from "./types";

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
  const preview = useMutation({
    mutationFn: ({ jobs, scenario }: { jobs: OperationsJobInput[]; scenario: OperationsScenario }) => (
      previewEnterpriseDecision(jobs, scenario, view)
    ),
  });
  const comparison = useMutation({
    mutationFn: ({ jobs, scenarioIds }: { jobs: OperationsJobInput[]; scenarioIds: string[] }) => (
      compareEnterpriseScenarios(jobs, scenarioIds, view)
    ),
  });
  const csv = useMutation({
    mutationFn: ({ workspaceKind, csvText }: { workspaceKind: WorkspaceKind; csvText: string }) => (
      validateEnterpriseCsv(workspaceKind, csvText)
    ),
  });
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
  const error = workspace.error ?? plans.error ?? preview.error ?? comparison.error ?? csv.error ?? adopt.error ?? outcome.error ?? notice.error;
  return {
    workspace,
    plans: plans.data?.plans ?? [],
    preview,
    comparison,
    csv,
    adopt,
    outcome,
    notice,
    error: error ? userFacingError(error) : "",
    clearDecision: () => { preview.reset(); comparison.reset(); adopt.reset(); },
  };
}
