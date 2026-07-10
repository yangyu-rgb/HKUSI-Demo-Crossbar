import { request } from "../../shared/api/client";
import type {
  SubscriptionInput,
  SubscriptionEvaluation,
  SubscriptionListResponse,
  SubscriptionRecord,
  SubscriptionUpdate,
} from "./types";


export function fetchSubscriptions(userId: string): Promise<SubscriptionListResponse> {
  return request(`/api/subscriptions?user_id=${encodeURIComponent(userId)}`);
}


export function createSubscription(
  payload: SubscriptionInput,
): Promise<SubscriptionRecord> {
  return request("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export function fetchSubscriptionPreview(
  subscriptionId: string,
): Promise<SubscriptionEvaluation> {
  return request(`/api/subscriptions/${subscriptionId}/preview`);
}


export function updateSubscription(
  subscriptionId: string,
  payload: SubscriptionUpdate,
): Promise<SubscriptionRecord> {
  return request(`/api/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}


export function deleteSubscription(subscriptionId: string): Promise<void> {
  return request(`/api/subscriptions/${subscriptionId}`, { method: "DELETE" });
}
