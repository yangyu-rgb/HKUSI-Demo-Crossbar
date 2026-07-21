# CrossBorder AI - Architecture Documentation

This document describes the system architecture, design decisions, and technical implementation of the CrossBorder AI platform.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Backend Architecture](#backend-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [Data Architecture](#data-architecture)
6. [AI/ML Pipeline](#aiml-pipeline)
7. [API Design](#api-design)
8. [Security & Access Control](#security--access-control)
9. [Performance & Scalability](#performance--scalability)
10. [Testing Strategy](#testing-strategy)

---

## System Overview

CrossBorder AI is a full-stack web application designed for classroom demonstration of predictive cross-border transportation management. The system consists of:

- **Backend**: FastAPI-based REST API with AI prediction engine
- **Frontend**: React SPA with desktop and mobile experiences
- **Data Layer**: SQLite for runtime data, JSON/CSV for configuration
- **AI/ML**: HistGradientBoosting model with transparent calibration

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │  Desktop   │  │   Mobile   │  │  3D Visualization    │  │
│  │   Pages    │  │   Pages    │  │  (Three.js Scene)    │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
│         │              │                    │                │
│         └──────────────┴────────────────────┘                │
│                        │                                     │
│              TanStack Query (State)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP/REST
┌─────────────────────────┴───────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌─────────┐ │
│  │   API    │→ │  Service  │→ │ Repository │→ │ SQLite  │ │
│  │ Routers  │  │  Layer    │  │   Layer    │  │   DB    │ │
│  └──────────┘  └───────────┘  └────────────┘  └─────────┘ │
│                      ↓                                       │
│              ┌───────────────┐                               │
│              │  ML Inference │                               │
│              │ (HGB + Calib) │                               │
│              └───────────────┘                               │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│                      Data Sources                            │
│  • Hong Kong Immigration: Passenger flow (primary feature)   │
│  • Shenzhen Port Office: Cross-validation snapshots          │
│  • Local JSON: Port metadata, routes, scenarios              │
└──────────────────────────────────────────────────────────────┘
```

---

## Architecture Principles

### 1. Classroom Demo First

- **No production dependencies**: No real authentication, payment, SMS/email, cloud databases
- **Reproducible**: All critical data committed to repository or generated deterministically
- **Self-contained**: Runs entirely on localhost with one command (`./start.sh`)
- **Transparent**: All predictions explainable, all data sources traceable

### 2. Modular Monolith

- **Backend**: Router → Schema → Service → Repository layering
- **Frontend**: Feature-based modules with co-located API/hooks/components
- **Rationale**: Complexity doesn't justify microservices for classroom demo
- **Future**: Repository/Provider interfaces allow swapping data sources when moving to production

### 3. Explainability by Design

- **Transparent calibration**: Weather/holiday/event multipliers are fixed constants, not hidden in model
- **Shadow comparison**: AI v1 runs in background for comparison without affecting user results
- **Decision trace**: Every prediction exposes full calculation chain
- **Fallback clarity**: Users know when statistical fallback is used vs. AI model

### 4. Progressive Enhancement

- **3D visualization**: WebGL scene with full text data fallback
- **Mobile PWA**: Installable app experience with offline shell
- **Reduced motion**: Honors prefers-reduced-motion for animations
- **WCAG A/AA**: Automated accessibility testing in CI

---

## Backend Architecture

### Layer Responsibilities

```
┌─────────────────────────────────────────────────────────┐
│  API Layer (app/api/)                                   │
│  • HTTP routing (FastAPI routers)                       │
│  • Request validation (Pydantic)                        │
│  • Authentication dependency (X-Demo-Persona-ID)        │
│  • Error handling & response formatting                 │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Service Layer (app/services/)                          │
│  • Business logic orchestration                         │
│  • Prediction engine & calibration                      │
│  • Multi-source data aggregation                        │
│  • Constraint optimization (enterprise)                 │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Repository Layer (app/repositories/)                   │
│  • SQLite persistence (feedback, subscriptions, etc.)   │
│  • JSON/CSV loading (ports, routes, scenarios)          │
│  • Provider protocol for external data sources          │
└─────────────────────────────────────────────────────────┘
```

### Key Services

**PredictionService** (`app/services/prediction.py`)
- Orchestrates full prediction pipeline
- Calls base model (statistical or AI v2.2)
- Applies transparent calibration (weather, holiday, event)
- Integrates official level and crowdsource feedback
- Expands uncertainty with Shenzhen cross-validation
- Returns prediction with full decision trace

**CrowdsourceService** (`app/services/crowdsource.py`)
- Quality scoring (freshness, consistency, deviation)
- Duplicate detection (10-minute cooldown)
- Robust aggregation (outlier filtering)
- Consensus judgment (15%/30%/45% ceiling)
- Weighted calibration with decay

**SubscriptionService** (`app/services/subscriptions.py`)
- Pattern matching (next valid commute date)
- Alert evaluation (departure, anomaly, alternative)
- Notification generation (local demo inbox)
- Read/unread status tracking

**EnterpriseOperationsService** (`app/services/enterprise_operations.py`)
- Multi-scenario comparison (normal, holiday, event, typhoon)
- Per-task HGB inference + transparent calibration
- Constraint optimization (route, capacity, vehicle, time)
- Risk exposure calculation (high-risk, conflicts, cost)
- Adoption & execution checklist generation

### ML Integration

**ModelLoader** (`app/ml/model_loader.py`)
- Validates model architecture version, model version, feature order
- Checks graduation status (passed all offline quality gates)
- Verifies training data hash consistency
- Loads joblib binary or returns None for fallback

**PredictionEngine** (`app/ml/prediction_engine.py`)
- Feature adaptation (converts business domain to model features)
- Model inference (HGB for covered ports)
- Transparent fallback (statistical model for uncovered ports)
- Shadow observation logging (AI v1 vs. statistical comparison)

### Hong Kong Clock Abstraction

All backend time operations use `HongKongClock` (`app/clock.py`):
- Returns `datetime` objects in `Asia/Hong_Kong` timezone
- API responses format as ISO 8601 with `+08:00` offset
- Frontend syncs global clock every 60 seconds
- Ensures consistent time across predictions, scenarios, alerts

---

## Frontend Architecture

### Structure

```
src/
├── features/              # Feature modules
│   ├── auth/             # Login, session, guards
│   ├── prediction/       # Route planning
│   ├── realtime/         # Border situation & 3D
│   ├── crowdsource/      # Feedback submission
│   ├── alerts/           # Smart subscriptions
│   ├── enterprise/       # Operations control tower
│   └── model/            # AI explainer
│
├── pages/                # Route-level page components
│   ├── LoginPage.tsx
│   ├── PlannerPage.tsx
│   ├── BusinessPage.tsx
│   └── ...
│
├── mobile/               # Mobile-specific routes
│   ├── MobileHome.tsx
│   ├── MobilePlanner.tsx
│   └── ...
│
├── layout/               # Global layout
│   ├── AppLayout.tsx    # Desktop navigation
│   └── MobileLayout.tsx # Mobile bottom nav
│
├── shared/               # Shared utilities
│   ├── api/             # API client & error handling
│   ├── components/      # Reusable UI components
│   ├── hooks/           # Common hooks
│   └── motion/          # Animation components
│
└── generated/            # OpenAPI generated types
    └── api.ts
```

### State Management

**TanStack Query** for all server state:
- Automatic caching with configurable stale times
- Optimistic updates for mutations
- Request deduplication
- 60-second polling for real-time data
- Query invalidation on mutations

**React useState** for local UI state:
- Form inputs (controlled components)
- Modal visibility
- Dropdown open/close
- Temporary editing state

**URL State** for shareable state:
- Current route (React Router)
- Role selection (query params in desktop navigation)

### Code Splitting

- Route-level lazy loading (`React.lazy()`)
- 3D scene async loaded (~633 kB, gzipped ~165 kB)
- Desktop and mobile entry points separate
- Vendor chunks optimized in Vite config

### Responsive Design

Breakpoints (CSS custom properties):
- `--mobile`: 375px (base)
- `--tablet`: 768px
- `--desktop`: 1024px
- `--wide`: 1440px

All pages tested for horizontal overflow at all breakpoints.

### Design System

**Desktop**: 
- Inter font
- Light city background with ~80% overlay
- White frosted glass content surfaces
- Dark text for readability
- Homepage exception: Video hero + 3D scene

**Mobile** (`/mobile/*`):
- Independent mobile-optimized styling
- Bottom navigation (5 tabs)
- Inherits Inter font only

---

## Data Architecture

### Persistence Strategy

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| Crowdsource feedback | SQLite | Mutable, query by port/time |
| Subscriptions | SQLite | CRUD operations |
| Alert evaluations | SQLite | History tracking |
| Notifications | SQLite | Inbox with read status |
| Prediction runs | SQLite | Traceability & audit |
| Enterprise plans | SQLite | Adoption & retrospective |
| Business subscriptions | SQLite | Demo SaaS tracking |
| Audit logs | SQLite | Compliance simulation |
| Port metadata | JSON | Static configuration |
| Traffic matrix | JSON | Deterministic routes |
| Historical samples | JSON | Reproducible training data |
| Enterprise scenarios | JSON | Sample task definitions |
| Trained models | Joblib (git-ignored) | Binary artifacts |

### SQLite Schema Highlights

**Crowdsource Feedback**:
- `id`, `port`, `direction`, `wait_minutes`, `quality_score`
- `created_at`, `expires_at` (90-minute validity)
- `forecast_run_id` (linkage to prediction that was calibrated)

**Subscriptions**:
- `id`, `user_id`, `origin`, `destination`, `target_arrival_time`
- `preference`, `budget`, `enabled_days` (JSON array)
- `alerts_enabled` (JSON object: departure, anomaly, alternative)

**Prediction Runs**:
- `run_id` (stable hash of query+time+model+inputs)
- `origin`, `destination`, `target_arrival`, `preferences`
- `model_version`, `scenario_version`, `official_snapshot_version`
- `recommended_port`, `confidence_interval`, `risk_level`

**Enterprise Operations**:
- `plan_id`, `organization`, `role`, `scenario_name`
- `input_tasks` (JSON), `scenario_snapshot` (JSON)
- `recommendations` (JSON), `adopted_at`, `execution_checklist` (JSON)

### Data Provenance

All data sources registered in `data/sources/official_sources.json`:

```json
{
  "sources": [
    {
      "id": "hk_immigration_daily",
      "name": "Hong Kong Immigration Department - Daily Statistics",
      "url": "https://www.immd.gov.hk/...",
      "status": "approved_feature_only",
      "purpose": "Primary feature for base model training"
    },
    {
      "id": "shenzhen_port_office",
      "name": "Shenzhen Port Office - Public Statistics", 
      "url": "https://www.sz.gov.cn/...",
      "status": "approved_feature_only",
      "purpose": "Cross-validation snapshots (independent verification)"
    }
  ]
}
```

---

## AI/ML Pipeline

### Training Pipeline (Offline)

```
1. Data Generation (scripts/generate_v2_training_data.py)
   ↓
   • Read Hong Kong official passenger flow snapshots (16,144 records)
   • Generate 730 days × 4 ports × 2 directions × 24 hours scenarios
   • Apply transparent weather/holiday/event multipliers to create targets
   • Output: 140,160 training samples with explainable targets
   
2. Model Training (scripts/train_wait_model_v2.py)
   ↓
   • Time-based split: first 80% train, next 10% validation, last 10% test
   • Compare 25 candidate configurations (Ridge, ExtraTrees, HGB)
   • Select best on validation set
   • Evaluate on held-out test set
   
3. Quality Gates (all must pass)
   ↓
   • Data audit: No target leakage in features
   • Baseline improvement: Better than day-of-week average
   • Feature importance: Passenger flow must be top contributor
   • Test degradation: No worse than validation performance
   • Interval coverage: 90% confidence intervals ≥85% actual coverage
   • Slice analysis: Worst slice MAE within acceptable bounds
   • Monotonicity: Higher passenger flow → higher wait time
   
4. Graduation
   ↓
   • If all gates pass: Model graduates, metadata saved
   • If any gate fails: Training fails, must investigate root cause
   
5. Deployment
   ↓
   • Binary saved to data/runtime/models/wait_model_v2.joblib (git-ignored)
   • Metadata saved to data/models/wait_model_v2.metadata.json (committed)
   • FastAPI loads at startup with validation checks
```

### Inference Pipeline (Runtime)

```
User Request (origin, destination, target_arrival)
   ↓
1. Base Prediction
   ├─→ Try AI v2.2 HGB (if model loaded & port covered)
   │   • Features: port, direction, hour, weekday, weekend, official_pressure
   │   • Returns: base wait time (minutes)
   │
   └─→ Fallback to Statistical Model (if model unavailable/uncovered)
       • Weighted average of historical samples
       • Match: weekday type, hour ±1, weather, last 28 days (decay)
   
2. Transparent Calibration
   ↓
   • Scenario multipliers: weather × holiday × event (capped at 2.10)
   • Official level: normal/busy/very_busy with decay weights
   • Result: scenario_calibrated_wait_time
   
3. Crowdsource Feedback
   ↓
   • Robust aggregation: Filter outliers, weight by quality
   • Consensus judgment: Single(15%) / Duo(30%) / Multi(45%) ceiling
   • Decay: Feedback age × prediction span
   • Result: crowd_adjusted_wait_time
   
4. Shenzhen Cross-validation
   ↓
   • Standardize HK and SZ pressure independently
   • Calculate consistency score
   • If inconsistent: Expand uncertainty bounds (max +35%)
   • Result: cross_validated_confidence_interval
   
5. Route Optimization
   ↓
   • For each of 4 ports: Calculate total journey time
   • Apply user preferences (fastest/cheapest/balanced)
   • Rank by optimization score
   • Result: 4 ranked routes with recommendations
   
6. Decision Trace
   ↓
   • Log all intermediate values for explainability
   • Return: {
       base_wait, scenario_wait, crowd_wait, final_wait,
       confidence_interval_90, delay_risk_percent,
       calibration_trace: {weather_factor, holiday_factor, ...}
     }
```

### Shadow Comparison (AI v1)

AI v1 runs in parallel for comparison but doesn't affect user results:

```
Prediction Request
   ↓
├─→ Primary Path (AI v2.2 → Statistical fallback)
│   • User sees this result
│
└─→ Shadow Path (AI v1 if available)
    • Try load AI v1 model (with strict validation)
    • Run inference with same inputs
    • Log to shadow_observations table:
      {port, statistical_wait, ai_v1_wait, difference, unavailable_reason}
    • If model fails: Log reason, continue silently
    • Never affects user-facing predictions
```

**Shadow observations are for demo analysis only**, accessible via `/api/demo/model-shadow-summary`.

---

## API Design

### REST Principles

- **Resource-based URLs**: `/api/predictions`, `/api/subscriptions/{id}`
- **HTTP methods**: GET (read), POST (create), PATCH (update), DELETE (remove)
- **Status codes**: 200 (success), 201 (created), 400 (validation error), 401 (auth required), 403 (forbidden), 404 (not found), 500 (server error)
- **JSON payloads**: Request and response bodies in JSON
- **OpenAPI spec**: Auto-generated from Pydantic schemas

### Request/Response Contract

**Request Validation** (Pydantic schemas):
```python
class PredictionRequest(BaseModel):
    origin: LocationID
    destination: LocationID
    target_arrival: datetime
    preference: Preference = Preference.BALANCED
    budget: Optional[int] = None
```

**Response Format** (Pydantic schemas):
```python
class PredictionResponse(BaseModel):
    routes: List[RouteOption]
    request_id: str
    forecast_run_id: str
    generated_at: datetime
    model_version: str
    scenario_version: str
```

**Error Format** (unified envelope):
```python
class ErrorResponse(BaseModel):
    error_code: str              # Machine-readable code
    message: str                 # Human-readable message
    details: Optional[Dict]      # Additional context
    request_id: str              # Trace ID
    category: ErrorCategory      # validation/auth/system/external
    retryable: bool              # Can client retry?
    user_action: Optional[str]   # What should user do?
```

### Authentication

**Demo Authentication** (local persona header):
- Header: `X-Demo-Persona-ID: <persona_id>`
- Values: `commuter-alice`, `enterprise-admin-bob`, `dispatcher-charlie`, etc.
- Validation: Check persona exists in `data/demo/personas.json`
- No real JWT, OAuth, or session tokens

**Authorization** (role-based):
- Personal commuter: `/api/predictions`, `/api/crowdsource`, `/api/subscriptions`
- Enterprise admin: `/api/enterprise-plans`, `/api/employees`
- Dispatcher: `/api/enterprise-operations` (role-specific)
- Port authority: `/api/coordination` (aggregated data only)
- Platform operator: All endpoints + `/api/demo/operations-summary`

### Rate Limiting

Currently no rate limiting (classroom demo). Production would implement:
- Per-user rate limits (e.g., 100 req/min)
- Per-IP rate limits for public endpoints
- Exponential backoff for failures

---

## Security & Access Control

### Threat Model

**Out of Scope** (classroom demo):
- Real user data breaches (no real users)
- Payment fraud (no real payments)
- Production-scale DDoS (localhost only)

**In Scope** (demonstration boundaries):
- XSS prevention (React escaping, Content-Security-Policy)
- SQL injection prevention (parameterized queries)
- CORS configuration (restrict origins)
- Audit logging (write operations)
- Role-based access (prevent privilege escalation within demo)

### Security Headers

```python
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # CSP omitted for demo (would require nonce for inline scripts)
    return response
```

### Input Validation

**Backend** (Pydantic):
- Type checking (str, int, datetime, enums)
- Range validation (0 ≤ wait_minutes ≤ 300)
- Pattern matching (location IDs from fixed list)
- Custom validators (arrival time must be future)

**Frontend** (HTML + React):
- Controlled inputs (validated on change)
- Disabled submit until valid
- Enum selectors (no free text for enums)
- Date/time pickers (no manual date entry)

### SQL Injection Prevention

All database queries use parameterized statements:

```python
# GOOD
cursor.execute(
    "SELECT * FROM feedback WHERE port = ? AND created_at > ?",
    (port, cutoff_time)
)

# BAD (would be vulnerable)
# cursor.execute(f"SELECT * FROM feedback WHERE port = '{port}'")
```

### XSS Prevention

**React automatic escaping**:
- All `{variable}` expressions escaped by default
- No `dangerouslySetInnerHTML` used in codebase

**Content Security Policy** (future):
- Restrict inline scripts (require nonce)
- Restrict external domains
- Report violations to logging endpoint

---

## Performance & Scalability

### Current Characteristics (Classroom Demo)

- **Concurrency**: Single-process FastAPI with uvicorn
- **Database**: SQLite (file-based, no connection pool)
- **Caching**: In-memory dictionaries for port metadata
- **Frontend**: Client-side rendering (CSR) only
- **3D Scene**: Single RAF loop, optimized raycast targets

### Bottlenecks (If Scaling to Production)

1. **SQLite Write Contention**
   - Issue: Exclusive write locks
   - Solution: Migrate to PostgreSQL with connection pooling

2. **AI Inference Latency**
   - Issue: ~50ms per HGB prediction, serial for 4 ports
   - Solution: Batch inference, model serving (TensorFlow Serving, ONNX Runtime)

3. **No Horizontal Scaling**
   - Issue: Single process, single machine
   - Solution: Stateless API servers behind load balancer, separate prediction service

4. **No Caching Layer**
   - Issue: Every request hits database and model
   - Solution: Redis for frequently accessed predictions (TTL = prediction validity)

5. **Frontend Bundle Size**
   - Current: 3D scene ~633 kB (gzipped ~165 kB)
   - Solution: Further code splitting, lazy load non-critical features

### Production Architecture (Future)

```
Load Balancer (nginx)
   ↓
┌────────────────────────────────────┐
│  API Servers (stateless, scale N)  │
└────────────────────────────────────┘
   ↓                  ↓
┌──────────┐    ┌─────────────────┐
│ Redis    │    │ PostgreSQL      │
│ (cache)  │    │ (persistence)   │
└──────────┘    └─────────────────┘
   ↓
┌─────────────────────────────────────┐
│ Prediction Service (batch inference) │
│ • Model loaded in memory             │
│ • Batch requests from API servers    │
│ • Async responses via queue          │
└─────────────────────────────────────┘
```

---

## Testing Strategy

### Backend Tests (pytest)

**Unit Tests** (`tests/unit/`):
- Service logic (prediction calculation, crowdsource aggregation)
- ML components (feature adaptation, fallback logic)
- Utility functions (quality scoring, time decay)

**Integration Tests** (`tests/integration/`):
- API endpoints with test database
- Repository operations (CRUD)
- Provider data loading

**Coverage Target**: ≥70% statements, branches, functions, lines for critical modules

**Run**: `pytest -q` (97 passing tests)

### Frontend Tests (Vitest + Playwright)

**Unit Tests** (Vitest):
- Component rendering
- Hook behavior
- Utility functions
- 3D scene utilities (camera framing, particle mapping)

**E2E Tests** (Playwright):
- Desktop flow: Login → Prediction → Crowdsource → Alerts → Enterprise
- Mobile flow: Login → Home → Planning → Feedback → Notifications
- 3D scene: Load → Interact → Focus → Return to overview
- WCAG A/AA: Automated axe accessibility checks on all pages

**Coverage Target**: ≥70% for critical API/crowdsource/auth modules

**Run**: 
- `npm test` (unit tests)
- `npm run test:e2e` (end-to-end tests, requires backend running)

### Continuous Integration (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Install Python dependencies
      - Run pytest
      - Check OpenAPI schema generation
  
  frontend:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Install Node dependencies
      - Run Vitest (unit tests)
      - Run ESLint
      - Build production bundle
  
  e2e:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Start backend (wait for health check)
      - Start frontend (wait for page load)
      - Run Playwright tests (single worker to avoid SQLite race)
      - Upload test artifacts
```

### Manual Testing Checklist

Before major demo:
- [ ] `./start.sh` succeeds on clean clone
- [ ] Frontend loads at http://127.0.0.1:5173
- [ ] API docs accessible at http://127.0.0.1:8000/docs
- [ ] 3D scene loads and responds to mouse/keyboard
- [ ] Video hero plays on homepage (or shows fallback poster)
- [ ] Crowdsource feedback updates predictions
- [ ] Enterprise control tower shows all 4 scenarios
- [ ] Mobile PWA install prompt appears
- [ ] All demo roles accessible via login
- [ ] No console errors in browser devtools

---

## Technology Stack Summary

### Backend
- **Language**: Python 3.10+
- **Framework**: FastAPI 0.100+
- **Validation**: Pydantic 2.0+
- **Database**: SQLite 3.x
- **ML**: scikit-learn 1.3+ (HistGradientBoostingRegressor)
- **Server**: Uvicorn (ASGI)

### Frontend
- **Language**: TypeScript 5.x
- **Framework**: React 19
- **Build Tool**: Vite 5.x
- **State Management**: TanStack Query 5.x
- **Routing**: React Router 6.x
- **3D Graphics**: Three.js + @react-three/fiber
- **Charts**: Recharts
- **Testing**: Vitest, Playwright, @axe-core/playwright

### DevOps
- **Version Control**: Git + GitHub
- **CI/CD**: GitHub Actions
- **Package Management**: pip (backend), npm (frontend)
- **Code Quality**: pytest, ESLint, Prettier

### Data
- **Training Data**: Hong Kong Immigration Dept (16,144 official records)
- **Geography**: OpenStreetMap (ODbL 1.0) - offline export for classroom use
- **Validation**: Shenzhen Port Office public statistics

---

## Future Considerations

### Moving to Production

**Required Changes**:
1. Replace SQLite with PostgreSQL + connection pool
2. Implement real authentication (OAuth 2.0, JWT)
3. Add Redis caching layer for predictions
4. Set up message queue (RabbitMQ, Kafka) for async tasks
5. Implement real notification delivery (SMS, email, push)
6. Add rate limiting and DDoS protection
7. Set up monitoring (Prometheus, Grafana)
8. Deploy behind load balancer with auto-scaling
9. Obtain licenses for real-time data APIs
10. Conduct security audit and penetration testing

**Data Governance**:
- Obtain explicit consent for real wait time labels
- Comply with PDPO (Hong Kong) and PIPL (China) for personal data
- Data retention and deletion policies
- Right to erasure (GDPR-style)
- Audit trail for all data access

**Model Governance**:
- A/B testing framework for model changes
- Online learning pipeline with label quality checks
- Fairness audits (ensure no port/demographic bias)
- Incident response for prediction errors
- Rollback procedures for model deployments

### Microservices Architecture (If Needed)

Only consider if:
- Team size >20 engineers (multiple autonomous teams)
- Clear service boundaries emerge (auth, prediction, notification, billing)
- Independent scaling needs (prediction service needs 10x more resources than API)
- Polyglot requirements (different services in different languages)

Current modular monolith is sufficient for:
- Teams <10 engineers
- Shared data model
- Tight coupling between features (predictions affect alerts affect enterprise)
- Simplified deployment and debugging

---

For API specification details, see [docs/api_contract.md](docs/api_contract.md).

For feature descriptions, see [FEATURES.md](FEATURES.md).

For getting started, see [README.md](README.md).
