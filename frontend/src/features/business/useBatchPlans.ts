import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingError } from "../../shared/api/client";
import { queryKeys } from "../../shared/queryKeys";
import { createBatchPlan, fetchBatchPlans } from "./api";
import type { BatchRequest } from "./types";


export function useBatchPlans(company: string) {
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: queryKeys.batchPlans(company),
    queryFn: () => fetchBatchPlans(company),
  });
  const generate = useMutation({
    mutationFn: (payload: BatchRequest) => createBatchPlan(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.batchPlans(company) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.modelShadowSummary });
    },
  });
  const error = history.error ?? generate.error;
  return {
    history: history.data?.plans ?? [],
    loading: history.isPending,
    generating: generate.isPending,
    plan: generate.data ?? null,
    error: error ? userFacingError(error) : "",
    generate: generate.mutateAsync,
    clearPlan: generate.reset,
  };
}
