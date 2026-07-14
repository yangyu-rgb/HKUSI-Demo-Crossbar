# CrossBorder AI - 7-Minute Live Demo Runbook

This runbook covers the interactive platform segment of the 15-minute Topic 2 presentation. Deliver every spoken line in English. Reserve the remaining 8 minutes for market evidence, business model, feasibility, risks, roadmap, investment ask, and closing.

## Before presenting

- Run `./start.sh` and confirm `/api/health/ready` returns healthy.
- Use a 1440 x 900 browser window at 100% zoom.
- Reset the Demo, sign in as `Platform Operator / Demo 操作员`, and leave `/` open.
- Keep `/business` and `/model` available as backup tabs only if switching tabs is faster on the presentation device.
- Do not describe any scenario wait, cost, customer, notification, or improvement as observed performance.

## 0:00-0:35 - Five-second value proposition

Screen: `/`

Action: Let the cinematic Hero and live Hong Kong-Shenzhen scene remain visible. Point to the primary CTA.

Say:

> CrossBorder AI is a predictive dispatch platform for cross-border operators. It turns one-to-three-hour border uncertainty into service, fleet, freight and coordination decisions. We are not building another map. We are building the decision layer between border forecasts and enterprise operations.

Investor message: clear value proposition, enterprise focus, and immediate visual identity.

## 0:35-1:15 - Problem and market need

Screen: scroll from the Hero to the four-port 3D scene, then open the operations control tower.

Say:

> The operational problem is real. An official Hong Kong briefing recorded about 26,000 travellers using Huanggang in six hours on 1 January 2024. Heavy traffic prevented many cross-border coaches from immediately returning to the city, even after service was reinforced. More vehicles alone did not solve the problem because fleet circulation failed.

> Our platform forecasts the pressure before it becomes an operational failure, then converts that forecast into a decision an operator can adopt.

Evidence boundary: the 26,000-traveller event and coach circulation problem are official facts. The May Day service plan used next is a classroom reconstruction.

## 1:15-2:05 - Prove that AI is at the core

Screen: `/business`, Coach Dispatch view.

Action: Point to the embedded AI line and the four port forecast chips before clicking anything.

Say:

> This is not a dashboard with an AI label. Our checked-in HistGradientBoosting model uses port, direction, hour, weekday and official cross-border traffic pressure to produce a base wait forecast. Transparent stress calibration adjusts that forecast, and a deterministic constraint optimizer turns it into service and vehicle actions.

> We show a 90 percent prediction interval because the system must communicate uncertainty, not pretend to know an exact future minute. If the model artifact fails validation, the platform falls back to an explainable statistical forecast.

Point out:

- model version `public-traffic-transparent-hgb-v2.2`;
- 1-3 hour forecast horizon;
- 90% interval per port;
- classroom disclosure beside the operational data.

## 2:05-3:10 - Show the risk before intervention

Screen: the May Day 2026 coach scenario.

Action: Read the visible baseline before generating a plan.

Say:

> At 07:00, the platform evaluates ten reconstructed services. Three services using Luohu are classified as high risk, one vehicle has a cycle conflict, and the scenario cost exposure is HK$12,000. Exposure means a transparent scenario estimate for recovery and support workload; it is not booked loss.

> The red state is important: the audience first sees what happens if the operator does nothing.

## 3:10-4:20 - Generate and compare the AI dispatch plan

Action: Click `Generate AI Dispatch Plan`.

Say:

> The model and constraint layer now recommend rerouting services 101 and 103 through Futian, rerouting 105 through Shenzhen Bay, and releasing vehicle A02 for service 110.

Point to the three comparison metrics and the service table.

> In this reconstructed scenario, high-risk services move from three to zero, the vehicle conflict moves from one to zero, and scenario exposure moves from HK$12,000 to HK$2,400. Predicted arrival improves by eight minutes on average. These are scenario outputs, not a promise of zero delay.

Investor message: a visible before-and-after decision, not a passive chart.

## 4:20-5:05 - Adopt and execute

Action: Keep all recommended actions selected and click `Adopt Plan & Create Notification Drafts`.

Say:

> A recommendation has no value if it stops at the screen. The dispatcher adopts the plan, creates 147 local passenger notification drafts and can export an execution CSV. In the Demo nothing is actually sent and no vehicle is controlled, but the workflow boundary is ready for later API integration.

Action: briefly point to the local outcome-review inputs.

> After operations, a human records the actual outcome separately. This prevents predicted improvement from being misreported as observed performance and creates the future learning and audit loop.

## 5:05-5:50 - Prove that it is a platform

Action: As Platform Operator, switch from Coach Dispatch to Freight Dispatch, then to Port Authority.

Say:

> The same decision architecture supports three operating roles. Coach operators manage services and fleet circulation. Freight operators protect delivery windows and reroute trucks. Port authorities see aggregate pressure and coordination notices, but not company vehicle or task details.

> Model coverage is also explicit. The checked-in HGB fully covers the four passenger ports used by the coach scenario. The freight view currently has HGB coverage for Shenzhen Bay and a labelled transparent fallback for unsupported freight ports. Extending freight coverage requires authorized port-specific labels; the Demo does not hide that gap.

> This role and model boundary is part of the product design: one platform, different decisions, and no unnecessary operational-data exposure or fake AI coverage.

## 5:50-6:30 - Feasibility and model honesty

Screen: `/model` or remain on the embedded AI line if time is tight.

Say:

> The current model is sufficient for a classroom proof of technical feasibility. It is reproducible, versioned, tested against a time split, checked for distribution drift, and protected by a statistical fallback. We will not retrain it merely to show a lower synthetic error.

> The production milestone is different: secure authorized, timestamped wait labels from design partners, evaluate out of sample by port and peak period, and only then decide whether a more complex temporal model earns deployment.

Investor message: technically buildable today, honest about the data needed for production.

## 6:30-7:00 - Investment close

Screen: return to the adopted plan comparison.

Say:

> CrossBorder AI is investable because AI is tied directly to an expensive operational decision: when to depart, which port to use, and how to protect fleet circulation. The Demo proves the complete interaction - forecast, compare, adopt, notify and review. Our next validation is not more interface work; it is two design partners, authorized outcome data, and a measured pilot.

> We are turning border uncertainty from an unavoidable disruption into a manageable operating decision.

## Guideline scoring coverage

| Topic 2 criterion | Live evidence |
| --- | --- |
| Originality and value proposition - 15% | Predictive dispatch layer between public border information and enterprise execution |
| AI technology at core - 20% | HGB forecast, official traffic feature, transparent calibration, uncertainty interval, constraint optimizer, fallback |
| Problem-solution fit and market need - 15% | Official 2024 Huanggang operating failure, then visible risk-to-action workflow |
| Feasibility and scalability - 15% | Running API, role isolation, local persistence, exports, model validation and staged production boundary |
| Entrepreneurial vision and awareness - 15% | Coach beachhead, freight and port extensions, design-partner data plan, explicit model and integration risks |
| Organization and coherence - 10% | Problem -> AI -> baseline -> decision -> execution -> platform -> feasibility -> ask |
| Presentation skills - 10% | Cinematic opening, 3D scene, three before/after metrics, one-click adoption, concise English delivery |

## Do not say

- Do not say the Demo prevented real delays or saved HK$9,600.
- Do not call generated wait labels real measured labels.
- Do not claim that official sources do not forecast border flows.
- Do not claim production authentication, live dispatch integration, real notification delivery, paying customers or revenue.
- Do not spend the seven minutes on the personal planner, pricing simulation, technical formulas, or every navigation item.
