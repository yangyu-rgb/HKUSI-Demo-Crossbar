export const queryKeys = {
  demoContext: ["demo-context"] as const,
  modelShadowSummary: ["model-shadow-summary"] as const,
  realtime: ["realtime"] as const,
  crowdsource: ["crowdsource"] as const,
  locations: ["locations"] as const,
  prediction: (query: unknown) => ["prediction", query] as const,
  subscriptions: (userId: string) => ["subscriptions", userId] as const,
  subscriptionPreview: (subscriptionId: string) => ["subscription-preview", subscriptionId] as const,
  batchPlans: (company: string) => ["batch-plans", company] as const,
};
