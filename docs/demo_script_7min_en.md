# CrossBorder AI - 7-Minute Live Demo Runbook

This is the interactive platform segment of the 15-minute Topic 2 presentation. Deliver every spoken line in English. Reserve the remaining 8 minutes for market evidence, business model, risks, roadmap, investment ask and closing.

## Before presenting

- Run `./start.sh`; use a 1440 x 900 browser at 100% zoom.
- Reset the Demo, sign in as `Platform Operator / Demo 操作员`, and leave `/business` open in Coach Dispatch view.
- Keep the coach and freight CSV sample files available only as backup. The primary path uses `Load Demo Sample` so the system file picker cannot interrupt timing.
- Never describe scenario exposure as booked loss, notification drafts as sent messages, or predicted improvement as observed performance.

## 0:00-0:35 - What enters the platform

Screen: `/business`, empty operating input.

Say:

> CrossBorder AI is a predictive dispatch platform for cross-border operators. Instead of starting from a prebuilt answer, it starts with the operator's services, vehicles, deadlines and current port plan.

Point to `Import CSV`, `Download Template`, `Add Task`, then click `Load Demo Sample`.

> I can upload a role-specific CSV or enter a service manually. For presentation reliability, I am loading the same ten-row deterministic sample. The platform has now validated ten services, their assigned vehicles, passenger capacity and timing constraints.

## 0:35-1:25 - Stress-test the same plan

Click `Compare All 4 Scenarios`.

Say:

> One forecast is not enough for an operator. We run the same operating plan against four explainable conditions: a normal weekday, a holiday peak, a major concert release and severe typhoon weather.

Point to the different before-and-after risk, conflict, exposure and action counts.

> The scenarios do not contain prewritten recommendations. They change the model inputs and constraints, so the same ten services produce different risk and dispatch decisions. The operator can also change weather, holiday status, event direction, time window, affected ports and port restrictions.

## 1:25-2:10 - Select the severe-weather decision

Click `Typhoon / Severe Weather`, then `Analyse Selected Scenario`.

Say:

> I will open the severe-weather case. Typhoon is not presented as a secret model feature. It is transparently represented as thunderstorm weather, high event impact and a Shenzhen Bay capacity restriction.

Point to the completed pipeline:

`Input validated -> HGB forecast -> Scenario calibrated -> Constraints optimized -> Plan ready`

> For every task, the checked-in HistGradientBoosting model forecasts each eligible passenger port. The system then applies versioned weather, holiday and event calibration, and finally checks route time, capacity, vehicle availability, turnaround and the promised arrival time.

## 2:10-3:15 - Show the operational risk before intervention

Point to the three comparison metrics and the task table.

Say:

> The red side is the operator's submitted plan under this scenario. The green side is the optimized plan. The table shows exactly which service changes port, departure time or vehicle, together with the predicted wait, 90 percent interval and model source.

> Risk is also operationally defined. Low means the upper prediction interval still arrives before the commitment. Medium means the median arrives on time but the upper interval may not. High means the median forecast is already late or a hard constraint fails.

> Scenario exposure is a transparent estimate based on the amount entered for each task and its risk classification. It is not a claim of observed financial loss.

## 3:15-4:20 - Show that the recommendation is data-dependent

Point to two changed service rows and the reserve-vehicle recommendation.

Say:

> The optimizer first rejects closed ports and capacity violations. It then minimizes high-risk services, vehicle-cycle conflicts and scenario exposure, while changing as little of the submitted plan as possible.

> Here, some services move to a different port or depart earlier. Where one vehicle cannot complete its first service and turn around before the next departure, the platform recommends a reserve allocation. This is why the result is more than a congestion dashboard: the forecast changes a real operating decision.

## 4:20-5:05 - Adopt and execute

Keep all recommended actions selected and click `Adopt 7 Actions & Create Drafts`.

Say:

> The dispatcher can accept all or only selected measures. Adoption stores the exact task input, scenario snapshot, model trace and chosen actions in the local audit record. It then creates passenger notification drafts and an execution CSV.

Point to `Export Execution CSV` and the human-entered review fields.

> Nothing is actually sent and no vehicle is controlled in this classroom Demo. After operations, a human records the real outcome separately, preventing predicted improvement from being misreported as observed performance.

## 5:05-5:55 - Prove the freight workflow

Switch to `Freight Dispatch`, click `Load Demo Sample`, then `Compare All 4 Scenarios`. Select `Holiday Peak` and analyse it.

Say:

> The same workflow accepts freight jobs, truck capacity, delivery windows and exposure values. In this holiday case, the submitted freight plan develops a delivery-window risk and a vehicle-cycle conflict, so the system compares diversion and reserve options.

Point to HGB/Fallback labels.

> Coverage is explicit. Shenzhen Bay uses the checked-in HGB model. Liantang and Man Kam To use a labelled transparent fallback because we do not have authorized port-specific training labels. The platform never hides that boundary.

## 5:55-6:30 - Prove the authority boundary

Switch to `Port Authority` and click `Publish Demo Coordination Notice`.

Say:

> A port authority sees aggregate port pressure and coordination signals, but not company CSV rows, vehicles or shipments. It can publish a local coordination notice for the operating window. This demonstrates one platform with role-specific decisions and data minimization.

## 6:30-7:00 - Investment close

Return attention to the adopted-plan history.

Say:

> This Demo now proves the complete operational loop: import, validate, stress-test, forecast, optimize, adopt, notify, export and review. The current model is sufficient for classroom technical feasibility. The next milestone is not another interface; it is two design partners, authorized timestamped outcomes and a measured pilot.

> CrossBorder AI turns border uncertainty from a status operators watch into a decision they can execute.

## Guideline scoring coverage

| Topic 2 criterion | Live evidence |
| --- | --- |
| Originality and value proposition - 15% | Enterprise input becomes an executable cross-border dispatch plan |
| AI technology at core - 20% | HGB forecast, scenario calibration, 90% interval, constraint optimizer and fallback disclosure |
| Problem-solution fit and market need - 15% | Official operating evidence plus coach and freight workflow |
| Feasibility and scalability - 15% | CSV contract, API, role isolation, persistence, export and reproducible local model |
| Entrepreneurial vision and awareness - 15% | Coach beachhead, freight extension, port coordination and explicit production-data gap |
| Organization and coherence - 10% | Input -> scenarios -> AI -> comparison -> adoption -> platform boundary -> close |
| Presentation skills - 10% | Four visible scenario cards, staged model pipeline, before/after metrics and direct interaction |

## Do not say

- Do not say the Demo prevented a real delay or saved the displayed exposure difference.
- Do not call generated wait labels real measured labels.
- Do not claim production authentication, live dispatch integration, notification delivery, paying customers or revenue.
- Do not claim full freight AI coverage.
- Do not spend the seven minutes on the personal planner, pricing simulation or every navigation item.
