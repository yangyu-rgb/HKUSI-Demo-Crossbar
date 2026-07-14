# Topic 2 Capstone Guideline Audit

Source reviewed: `SIUS2612_Capstone Project Guideline.pdf`, last updated 26 June 2026.

## Mandatory presentation constraints

- Topic: Topic 2 - a new AI business pitched to angel investors.
- Language: English throughout the presentation.
- Total time: 15 minutes.
- Final presentation file deadline in the supplied guideline: 23:59 on 15 July 2026 via HKUSI Moodle.
- Recommended allocation for this project: 7 minutes of live platform demonstration and 8 minutes of business analysis, strategic vision, risks, roadmap, investment ask and close.

## Rubric mapping

| Criterion | Weight | Current evidence | Status |
| --- | ---: | --- | --- |
| Originality and value proposition | 15% | Predictive decision layer for coach, freight and port operations rather than another personal map | Ready |
| AI technology at core | 20% | Actual HGB inference in the enterprise API, transparent stress calibration, 90% interval, constraint optimizer, model coverage and fallback disclosure | Ready for Demo; production labels still required |
| Problem-solution fit and market need | 15% | Official 2024 Huanggang coach-circulation evidence, official 2026 May Day peak forecast and official 2025 freight-port redistribution policy | Strong public evidence; first-hand customer validation remains external |
| Feasibility and scalability | 15% | Running frontend/API, role isolation, SQLite audit trail, exports, deterministic reset, model artifact checks and tested fallback | Ready for classroom feasibility claim |
| Entrepreneurial vision and awareness | 15% | Coach beachhead, staged freight coverage, port coordination boundary, design-partner data plan and explicit risks | Ready if delivered in the business segment |
| Organization and coherence | 10% | Seven-minute runbook follows problem -> AI -> baseline -> action -> execution -> platform -> feasibility -> ask | Ready |
| Presentation skills | 10% | Existing cinematic Hero, 3D border scene, high-contrast risk state, three before/after metrics, one-click adoption and role switching | Ready after device rehearsal |

## Model decision

Do not retrain the model for the final classroom Demo.

Reasons:

1. The current `public-traffic-transparent-hgb-v2.2` artifact already has a chronological train/validation/test split, 25-candidate selection, data audit, per-port interval calibration, traffic ablation, slice checks and monotonicity checks.
2. Its test MAE of 1.1368 minutes and 90.44% interval coverage apply to a generated base-wait target with real official traffic features. Retraining on the same generated target could improve a synthetic score but would not improve investor credibility.
3. The material technical gap was enterprise integration, not model complexity. The enterprise control tower now calls the checked-in HGB artifact directly and exposes model version, inputs, coverage, forecast interval and fallback source.
4. Freight model coverage is intentionally partial: Shenzhen Bay uses HGB, while unsupported freight ports use a labelled transparent scenario fallback. Extending the model without authorized port-specific labels would overstate capability.

Production model milestone:

- obtain authorized timestamped wait and operational outcome labels from two design partners;
- define event-time train/test separation and prevent revised public data from leaking backward;
- evaluate by port, direction, peak period and disruption type;
- compare HGB with temporal alternatives only after a strong baseline exists;
- promote a new model only if it improves out-of-sample accuracy, calibration and operational decisions.

## Remaining non-code requirements

- Conduct and document at least two genuine customer interviews; do not fabricate quotes, willingness to pay or pilot intent.
- Prepare the final English presentation file required by the guideline and submit it before the stated deadline.
- Rehearse the seven-minute live flow on the actual laptop, network and display; keep screenshots or a short backup recording available if live 3D rendering fails.
- Keep all scenario outcomes labelled as estimates. Say `scenario exposure`, not `loss`, and `notification drafts`, not `messages sent`.
