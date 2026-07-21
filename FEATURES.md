# CrossBorder AI - Features Documentation

This document provides detailed information about each feature module in the CrossBorder AI platform.

---

## Table of Contents

1. [Real-time Border Situation](#real-time-border-situation)
2. [AI-Powered Route Prediction](#ai-powered-route-prediction)
3. [Crowdsource Feedback System](#crowdsource-feedback-system)
4. [Smart Alert Subscriptions](#smart-alert-subscriptions)
5. [Enterprise Operations Control Tower](#enterprise-operations-control-tower)
6. [Employee Batch Planning](#employee-batch-planning)
7. [Scenario Simulation Lab](#scenario-simulation-lab)
8. [3D Digital Twin Visualization](#3d-digital-twin-visualization)
9. [Mobile Personal App](#mobile-personal-app)
10. [Business SaaS Platform](#business-saas-platform)

---

## Real-time Border Situation

**Target Users**: Public visitors, commuters, operators

**Purpose**: Provide real-time visibility into all four border crossing points between Hong Kong and Shenzhen.

### Key Features

- **Live Status Dashboard**: Current wait times, operating hours, and special lanes for all four ports (Lo Wu, Lok Ma Chau/Futian, Huanggang, Shenzhen Bay)
- **Trend Forecasting**: 3-hour ahead predictions with 90% confidence intervals
- **Pressure Heatmap**: 4×4 matrix showing peak pressure patterns across ports and time slots
- **Automated Insights**: AI-generated situation summaries and anomaly alerts
- **3D Digital Twin**: Interactive Hong Kong-Shenzhen miniature city with real-time traffic flow visualization

### Data Sources

- Hong Kong Immigration Department: Daily passenger flow statistics (primary feature)
- Shenzhen Port Office: Cross-validation snapshots (independent verification)
- Weather simulation data
- Holiday and event calendars

### How It Works

1. Base prediction uses historical patterns from similar weekday types, hours, and passenger volumes
2. Transparent weather/holiday/event multipliers adjust the baseline (fixed coefficients: 1.00-1.38)
3. Fresh official congestion levels (normal/busy/very busy) provide additional calibration
4. Shenzhen snapshot standardizes pressure independently to expand uncertainty bounds when inconsistent
5. 90% confidence intervals account for historical volatility and prediction span

**Access**: Public (no login required)

---

## AI-Powered Route Prediction

**Target Users**: Individual commuters

**Purpose**: Recommend optimal cross-border routes based on time constraints, preferences, and real-time predictions.

### Key Features

- **Multi-modal Route Comparison**: Compare up to 4 different routes across different ports and transportation modes
- **Time-constrained Planning**: Specify arrival deadline and get latest departure time recommendation
- **Risk Quantification**: "20% chance of being late" instead of single point estimates
- **Explainable Calculations**: Open detailed calculation modal showing:
  - Base model prediction
  - Scenario adjustments (weather, holidays, events)
  - Official calibration
  - Crowdsource feedback impact
  - Shenzhen verification consistency
  - Final recommendation with 90% confidence interval

### Supported Directions

- Hong Kong → Shenzhen (4 ports)
- Shenzhen → Hong Kong (4 ports)

### Optimization Factors

- Arrival deadline
- Budget constraints
- Personal preferences (fastest, cheapest, most reliable)
- Current predictions with uncertainty

### How to Use

1. Login with personal commuter identity
2. Select origin and destination from fixed location list
3. Specify target arrival time
4. Choose preference (fastest/cheapest/balanced)
5. Submit for prediction
6. Review 4 route options with detailed breakdown
7. Click "View Full Calculation" to see AI decision trace

**Access**: Requires login (personal commuter role)

---

## Crowdsource Feedback System

**Target Users**: Individual commuters

**Purpose**: Allow users to submit real-time wait time reports to improve prediction accuracy through collective intelligence.

### Key Features

- **Real-time Feedback Submission**: Report actual wait time at any of the 4 ports
- **Quality Scoring**: Automatic quality assessment based on:
  - Recency (fresher reports weighted higher)
  - Consistency with other reports
  - Deviation from predictions
- **Duplicate Prevention**: 10-minute cooldown between submissions for same user
- **Consensus Mechanism**: 
  - Single reporter: max 15% adjustment
  - Two reporters: max 30% adjustment  
  - Three+ high-quality consensus: max 45% adjustment
- **Feedback Expiration**: Reports valid for 90 minutes
- **Impact Visualization**: See how your feedback changed the predictions

### How It Works

1. User submits actual wait time experience at a specific port
2. System calculates quality score based on time freshness and crowd consistency
3. Robust aggregation filters outliers and weighs by quality
4. Consensus judgment determines adjustment ceiling (15%/30%/45%)
5. Weighted feedback calibrates predictions with decay based on age and forecast span
6. User sees before/after prediction comparison

### Gamification

- Earn points for submitting feedback
- Quality score displayed for each submission
- Contribution history tracking

**Access**: Requires login (personal commuter role)

---

## Smart Alert Subscriptions

**Target Users**: Regular cross-border commuters

**Purpose**: Proactive notification system that learns commute patterns and sends timely alerts.

### Key Features

- **Pattern Learning**: Define recurring commute schedule (days of week, typical departure time)
- **Three Alert Types**:
  1. **Departure Reminder**: "Leave at 8:15 AM for best route via Futian"
  2. **Anomaly Warning**: "⚠️ Your usual Lo Wu route is +40% congested today, suggest Shenzhen Bay"
  3. **Alternative Recommendation**: Suggest different port when conditions change
- **Customizable Schedule**: Select specific weekdays (Mon-Sun)
- **Notification Preferences**: Enable/disable each alert type independently
- **Next Commute Preview**: See what alerts would trigger for your next scheduled trip
- **Notification Inbox**: View all past alert evaluations with read/unread status

### Alert Logic

1. System identifies next valid commute date based on subscription schedule
2. Runs prediction 3 hours before target arrival time
3. Evaluates three conditions:
   - Should send departure reminder?
   - Is usual route experiencing anomalous congestion?
   - Is there a better alternative route?
4. Generates notification drafts (local demo only, not real email/SMS)
5. User can review evaluations in notification inbox

### Privacy Note

All alerts are local demo notifications, not actual email/SMS/push notifications.

**Access**: Requires login (personal commuter role)

---

## Enterprise Operations Control Tower

**Target Users**: Cross-border bus operators, logistics dispatchers, port authorities

**Purpose**: Predictive dispatch and resource optimization for enterprise-scale cross-border operations.

### Key Features

- **Four-stage Workflow**:
  1. **Input**: Import tasks via role-specific CSV, manual entry, or load sample scenarios
  2. **Scenario Testing**: Compare same tasks across 4 scenarios (Normal day, Holiday peak, Concert event, Typhoon)
  3. **AI Analysis**: View HGB predictions, transparent calibration, constraint optimization, and recommendations
  4. **Adoption**: Accept suggestions, generate notification drafts, export execution checklist, log retrospective

- **Task Management**:
  - Cross-border bus schedules (origin, destination, promised arrival, capacity, vehicle availability, turnaround time)
  - Logistics shipments (cargo volume, vehicle capacity, delivery windows, freight port distribution)
  - Constraint validation (route feasibility, capacity, time windows, port restrictions)

- **Multi-scenario Comparison**: Same batch of tasks compared horizontally across:
  - Normal working day (control group, no automatic changes)
  - Holiday peak (transparent holiday multiplier)
  - Major event (e.g., concert at specific port, time, direction)
  - Severe weather (typhoon = thunderstorm weather + high event impact + port capacity constraints)

- **AI Decision Trace**: For each task, display:
  - Model version and input features
  - HGB base prediction (if covered) or transparent fallback
  - Scenario calibration (weather × holiday × event multipliers)
  - Constraint optimization (route, capacity, vehicle availability, turnaround, arrival deadline)
  - Original vs. recommended port/vehicle/time
  - Risk exposure comparison (high-risk count, vehicle conflicts, scenario cost)

- **Coverage Transparency**:
  - **Passenger operations**: Full coverage across all 4 ports (Lo Wu, Futian, Huanggang, Shenzhen Bay)
  - **Freight operations**: Partial coverage (Shenzhen Bay uses HGB, Liantang/Wenjindu show explicit transparent fallback)

- **Adoption & Execution**:
  - Review detailed before/after comparison
  - Generate local notification drafts (not real SMS/customer service)
  - Export execution checklist (CSV)
  - Log retrospective for future review

### Scenario Logic

- **Normal day**: Submitted plan remains unchanged (control group)
- **Pressure scenarios**: Only optimize tasks where original port is actually affected by scenario or becomes infeasible
- **Event filtering**: Will not route new tasks into event-affected ports; only forces alternative when original port is closed
- **Transparent constraints**: Typhoon explicitly modeled as weather factor + event intensity + port capacity restrictions

### Role-specific Views

- **Bus Dispatcher**: Focus on passenger schedules, turnaround time, vehicle conflicts
- **Logistics Dispatcher**: Focus on cargo volume, delivery windows, freight port distribution
- **Port Authority**: Aggregated pressure view only, no enterprise vehicle/task details; manage coordination suggestions

**Access**: Requires login (bus/logistics dispatcher or platform operator role)

---

## Employee Batch Planning

**Target Users**: Enterprise HR administrators

**Purpose**: Dedicated workspace for HR teams to manage employee cross-border commute planning.

### Key Features

- **Employee Management**:
  - CSV import with validation
  - Manual employee entry/editing
  - Explicit preference and budget input (no longer inferred from employee sequence)

- **Batch Route Planning**:
  - Generate optimal routes for all employees based on their individual constraints
  - Filter results by risk level, recommended port, or employee name
  - Export results to CSV for distribution

- **Historical Plans**:
  - View past planning sessions
  - Restore previous employee lists
  - Compare plan outcomes over time

- **Separation from Operations Control Tower**:
  - Enterprise Administrator role automatically routes to `/business/employees`
  - This is their primary workspace
  - Platform Operator selecting enterprise perspective also enters employee planning directly

**Access**: Requires login (enterprise administrator or platform operator with enterprise view)

---

## Scenario Simulation Lab

**Target Users**: Platform operators

**Purpose**: Test and experiment with future scenarios to understand their impact on predictions.

### Key Features

- **14-day Scenario Editor**:
  - Edit weather for next 14 days (clear, rain, rainstorm, thunderstorm)
  - Configure holiday flags
  - Define event parameters (direction, port, time range, intensity: none/low/medium/high)

- **Transparent Multipliers**:
  - Weather: 1.00 (clear) / 1.08 (rain) / 1.18 (rainstorm) / 1.25 (thunderstorm)
  - Holiday: 1.00 (normal) / 1.24 (holiday)
  - Event: 1.00 (none) / 1.08 (low) / 1.20 (medium) / 1.38 (high)
  - Combined: min(2.10, weather × holiday × event)

- **Scenario Persistence**:
  - Saved to SQLite for all business flows (planner, alerts, enterprise)
  - Per-day or bulk reset available
  - Invalidates real-time situation cache when changed

- **A/B Comparison**:
  - Compare draft scenario vs. default scenario side-by-side
  - Preview impact without saving
  - One-click classroom demonstration presets

### How It Works

1. Operator opens scenario lab
2. Edits weather/holidays/events for specific dates
3. Can preview impact via A/B comparison (no side effects)
4. Saves scenario to persist for all user-facing predictions
5. Reset individual days or entire 14-day window as needed

**Access**: Requires login (platform operator role only)

---

## 3D Digital Twin Visualization

**Target Users**: All users (public homepage feature)

**Purpose**: Immersive 3D visualization of Hong Kong-Shenzhen cross-border traffic situation.

### Key Features

- **Geographic Foundation**:
  - Offline OpenStreetMap data (Hong Kong + Shenzhen regions)
  - Coastline and administrative boundaries
  - Major roads (motorway, trunk, primary)
  - Four types of procedural buildings
  - Abstract landmark silhouettes
  - Detailed port nodes (inspection hall, lanes, canopy, gates)

- **Real-time Traffic Flow**:
  - Four route curves representing the four border crossings
  - Three-layer flow lines (color-coded by pressure)
  - Bi-directional particle systems with staggered batches
  - Non-linear progress mapping creates visible queuing buffer near ports
  - Congestion level monotonically increases density/accumulation and decreases speed

- **Interactive Controls**:
  - Left-click: Orbit rotation
  - Right-click or Shift+Left-click: Pan
  - Scroll wheel: Zoom
  - Touch gestures: Full support
  - Arrow keys: Keyboard pan
  - Hover tooltips: Port details (clamped within module bounds)
  - Focus & return to overview buttons
  - Auto-cruise with 8-second pause on interaction

- **Quality Settings**:
  - Smooth / Balanced / Crisp (manual selection)
  - `prefers-reduced-motion`: Disables continuous cruise and camera fly, keeps explicit route focus

- **Performance Optimizations**:
  - Raycast targets pre-cached at initialization
  - Single RAF loop lifecycle controlled by viewport visibility, page visibility, WebGL context state
  - Particle and water surfaces only count active render time
  - Context lost preserves text data for browser recovery
  - Fallback to old outline geometry if asset loading fails
  - Fallback to full text data table if WebGL unavailable

### Data Attribution

- Geography data: © OpenStreetMap contributors, ODbL 1.0
- Visible attribution on page and asset metadata
- For classroom situational visualization only, not surveying or navigation data

### Accessibility

- Keyboard navigation supported
- Reduced motion preferences honored
- Text-based fallback for no-WebGL environments

**Access**: Public (visible on homepage)

---

## Mobile Personal App

**Target Users**: Individual commuters on mobile devices

**Purpose**: Standalone mobile-first experience for personal cross-border commute planning.

### Key Features

- **Independent Mobile Routes** (`/mobile/*`):
  - Mobile Login (personal commuter identity only)
  - Mobile Home (current best port, 4-port ranking, dual-source explanation, shortcuts)
  - Route Planning (bi-directional, fixed locations, explicit submission)
  - Scenario Comparison (default vs. draft, no side effects)
  - Crowdsource Feedback (with quality score and impact preview)
  - Alert Notifications (view evaluations, mark as read)
  - Model Explainer (technical formula + plain language)

- **Mobile-specific Features**:
  - Bottom navigation (5 tabs)
  - Return to web version link
  - Logout from "My" page
  - PWA support (installable, offline shell, online status indicator)
  - Session persistence across navigation

- **Separation from Desktop**:
  - Mobile pages do NOT redirect to desktop business pages
  - All personal functions completable within mobile experience
  - Independent layout and styling optimized for small screens

### How to Access

1. Visit `/mobile/login` on mobile device
2. Select personal commuter identity (other roles blocked)
3. Access all personal features through bottom navigation
4. Install as PWA for app-like experience

**Note**: Offline mode provides shell only; predictions require network connection (not cached/mocked).

**Access**: Requires login (personal commuter role only)

---

## Business SaaS Platform

**Target Users**: Enterprise decision makers, procurement teams

**Purpose**: Demonstrate commercial viability and business model through operational subscription platform.

### Key Features

- **Three-tier Pricing**:
  - **Essential**: Basic predictions and alerts
  - **Professional**: Advanced analytics and batch planning
  - **Enterprise**: Custom solutions and dedicated support

- **Billing Cycles**:
  - Monthly subscription
  - Annual subscription (discounted)

- **Mock Checkout Flow**:
  - Select plan and billing cycle
  - Login to complete purchase
  - Generate local receipt (not real payment)
  - Subscription status tracking

- **Business Metrics Dashboard** (Operator Only):
  - Monthly Recurring Revenue (MRR)
  - Subscription counts by tier
  - Simulated customer growth
  - Demonstration of business viability for investors

### Important Notes

- **This is a demonstration only**: No real payment processing, authentication, customer data, or revenue
- **Purpose**: Show business model and commercial narrative for classroom pitch
- **Subscription entitlement**: Currently not enforced for feature access (future production consideration)

**Access**: 
- Pricing page: Public (no login required)
- Subscription purchase: Requires login
- Business metrics: Platform operator only

---

## Access Control Summary

| Feature | Public | Personal | Enterprise Admin | Dispatcher | Port Authority | Platform Operator |
|---------|--------|----------|-----------------|------------|----------------|-------------------|
| Border Situation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Route Prediction | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Crowdsource | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Smart Alerts | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Operations Tower | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Employee Planning | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (enterprise view) |
| Port Coordination | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Scenario Lab | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Model Explainer | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pricing Info | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Business Metrics | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Technical Implementation Notes

### Prediction Engine (AI v2.2)

1. **Base Model**: HistGradientBoosting trained on Hong Kong official passenger flow data
   - Features: port, direction, hour, weekday, weekend flag, official passenger pressure
   - Training: 730 days, 140,160 deterministic scenarios
   - Test MAE: 1.14 minutes (on generated baseline targets)

2. **Transparent Calibration** (v2.3 strategy):
   - Fixed scenario multipliers (weather × holiday × event, capped at 2.10)
   - Fresh official congestion level (normal/busy/very busy with decay weights)
   - Dynamic crowdsource feedback (15%/30%/45% ceiling based on consensus)
   - Shenzhen snapshot cross-validation (expands uncertainty when inconsistent)

3. **Fallback Logic**:
   - Model loading checks: architecture version, model version, feature order, graduation status, data hash
   - If model unavailable/incompatible: automatic fallback to statistical model
   - Freight ports without HGB coverage: explicit transparent scenario fallback
   - All fallback paths preserve explainability

### Data Persistence

- **SQLite** (`data/runtime/crossborder.db`): Crowdsource feedback, subscriptions, alert evaluations, notifications, prediction runs, enterprise plans, coordination suggestions, employee plans, shadow observations, business subscriptions, audit logs
- **JSON/CSV**: Port metadata, historical samples, traffic matrix, deterministic enterprise scenarios
- **Git-ignored Runtime**: Trained model binaries, training snapshots, external source cache

### API Architecture

- **FastAPI Backend**: Router → Schema → Service → Repository pattern
- **OpenAPI Contract**: Generated TypeScript types for frontend
- **Error Handling**: Typed operational errors with retry flags and user action suggestions
- **Authentication**: Local demo persona headers (not production auth)
- **Audit**: All write operations logged with request ID, identity, organization, path, status

### Frontend Architecture

- **React 19** + TypeScript + Vite
- **TanStack Query**: Server state, caching, invalidation, 60s polling
- **Lazy Loading**: Routes code-split, 3D scene async loaded (~633 kB gzipped ~165 kB)
- **Responsive**: 375/768/1024/1440 breakpoints, no horizontal overflow
- **WCAG A/AA**: Automated axe checks in E2E tests
- **PWA**: Manifest, service worker, install prompt, offline shell

---

For API specification details, see [docs/api_contract.md](docs/api_contract.md).

For AI model evaluation, see [docs/model_v2_report.md](docs/model_v2_report.md).

For demo script, see [docs/demo_script_7min_en.md](docs/demo_script_7min_en.md).
