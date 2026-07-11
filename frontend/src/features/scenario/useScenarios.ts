import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../shared/queryKeys";
import { fetchScenarios, resetScenarios, restoreScenario, saveScenario, type ScenarioWrite } from "./api";


export function useScenarios() {
  const client = useQueryClient();
  const scenarios = useQuery({ queryKey: queryKeys.scenarios, queryFn: fetchScenarios });
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.scenarios });
  const save = useMutation({ mutationFn: ({ date, payload }: { date: string; payload: ScenarioWrite }) => saveScenario(date, payload), onSuccess: invalidate });
  const restore = useMutation({ mutationFn: restoreScenario, onSuccess: invalidate });
  const reset = useMutation({ mutationFn: resetScenarios, onSuccess: invalidate });
  return { scenarios, save, restore, reset };
}
