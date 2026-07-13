import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelCommercialSubscription, checkoutCommercialPlan, fetchCommercialPlans, fetchCommercialSubscription } from "./api";

export function useCommercial(authenticated = true) {
  const client = useQueryClient();
  const plans = useQuery({ queryKey: ["commercial-plans"], queryFn: fetchCommercialPlans, staleTime: Infinity });
  const subscription = useQuery({ queryKey: ["commercial-subscription"], queryFn: fetchCommercialSubscription, enabled: authenticated });
  const checkout = useMutation({
    mutationFn: checkoutCommercialPlan,
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["commercial-subscription"] }); await client.invalidateQueries({ queryKey: ["operations-summary"] }); },
  });
  const cancel = useMutation({
    mutationFn: cancelCommercialSubscription,
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["commercial-subscription"] }); await client.invalidateQueries({ queryKey: ["operations-summary"] }); },
  });
  return { plans, subscription, checkout, cancel };
}
