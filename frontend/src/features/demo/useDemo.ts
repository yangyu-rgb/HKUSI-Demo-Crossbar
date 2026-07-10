import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../shared/queryKeys";
import { fetchDemoContext, resetDemo } from "./api";


export function useDemoContext() {
  return useQuery({
    queryKey: queryKeys.demoContext,
    queryFn: fetchDemoContext,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}


export function useDemoReset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetDemo,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
}
