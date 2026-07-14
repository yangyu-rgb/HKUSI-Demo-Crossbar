import type { components } from "../../generated/api";

export type WorkspaceKind = components["schemas"]["WorkspaceKind"];
export type EnterpriseWorkspace = components["schemas"]["EnterpriseOperationsWorkspaceResponse"];
export type DecisionPreview = components["schemas"]["DecisionPreviewResponse"];
export type AdoptedDecisionPlan = components["schemas"]["AdoptedDecisionPlanResponse"];
export type PlanList = components["schemas"]["EnterpriseOperationsPlanListResponse"];
export type OutcomeWrite = components["schemas"]["EnterpriseOperationsOutcomeWrite"];
export type CoordinationNoticeWrite = components["schemas"]["CoordinationNoticeWrite"];
export type OperationsJobInput = components["schemas"]["EnterpriseOperationsJobInput"];
export type OperationsScenario = components["schemas"]["EnterpriseScenarioInput"];
export type ScenarioComparison = components["schemas"]["EnterpriseOperationsComparisonResponse"];
export type CsvValidation = components["schemas"]["EnterpriseOperationsCsvValidateResponse"];

export type EnterprisePlanRequest = components["schemas"]["EnterpriseOperationsPlanRequest"];
