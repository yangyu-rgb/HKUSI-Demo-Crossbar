CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crowdsource_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    port TEXT NOT NULL,
    actual_wait_time INTEGER NOT NULL CHECK(actual_wait_time >= 0),
    crowd_level TEXT NOT NULL CHECK(crowd_level IN ('low', 'medium', 'high')),
    effective_at TEXT NOT NULL,
    time_label TEXT NOT NULL,
    comment TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'hong_kong_to_shenzhen'
        CHECK(direction IN ('hong_kong_to_shenzhen', 'shenzhen_to_hong_kong')),
    channel TEXT NOT NULL DEFAULT 'traveller'
        CHECK(channel IN ('traveller', 'vehicle', 'cargo')),
    is_real_observation INTEGER NOT NULL DEFAULT 0
        CHECK(is_real_observation IN (0, 1)),
    training_consent INTEGER NOT NULL DEFAULT 0
        CHECK(training_consent IN (0, 1)),
    source_type TEXT NOT NULL DEFAULT 'demo_seed'
        CHECK(source_type IN (
            'demo_seed', 'demo_entry', 'crowdsource_observation',
            'partner', 'official'
        )),
    wait_started_at TEXT,
    wait_ended_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_port_created
ON crowdsource_reports(port, created_at);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    origin_id TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    days_json TEXT NOT NULL,
    arrival_deadline TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('fastest', 'cheapest', 'balanced')),
    advance_reminder INTEGER NOT NULL,
    anomaly_alert INTEGER NOT NULL,
    better_route_alert INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
ON subscriptions(user_id, created_at);

CREATE TABLE IF NOT EXISTS subscription_evaluations (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    evaluated_at TEXT NOT NULL,
    evaluation_time TEXT NOT NULL,
    commute_date TEXT NOT NULL,
    target_time TEXT NOT NULL,
    recommended_port TEXT NOT NULL,
    recommended_port_id TEXT NOT NULL,
    latest_departure TEXT NOT NULL,
    next_alert TEXT,
    alternative_port TEXT,
    alerts_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_evaluations_subscription
ON subscription_evaluations(subscription_id, evaluated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    evaluation_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(subscription_id, kind, scheduled_at),
    FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY(evaluation_id) REFERENCES subscription_evaluations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications(user_id, is_read, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    persona_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
ON audit_events(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS error_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    error_code TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_events_created
ON error_events(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS scenario_overrides (
    scenario_date TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS external_collection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    raw_hash TEXT,
    archive_path TEXT,
    observation_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(source_id, fetched_at, raw_hash)
);

CREATE INDEX IF NOT EXISTS idx_external_collection_runs_source
ON external_collection_runs(source_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS external_feature_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    first_fetched_at TEXT NOT NULL,
    last_fetched_at TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    port_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN (
        'hong_kong_to_shenzhen', 'shenzhen_to_hong_kong'
    )),
    traveler_category TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK(metric_type IN (
        'queue_status', 'passenger_count'
    )),
    raw_value REAL NOT NULL,
    congestion_level TEXT,
    feature_available INTEGER NOT NULL CHECK(feature_available IN (0, 1)),
    raw_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(
        source_id, observed_at, port_id, direction,
        traveler_category, metric_type
    )
);

CREATE INDEX IF NOT EXISTS idx_external_feature_coverage
ON external_feature_observations(
    metric_type, feature_available, port_id, direction, observed_at
);

CREATE TABLE IF NOT EXISTS external_feature_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    revision_fetched_at TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    port_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN (
        'hong_kong_to_shenzhen', 'shenzhen_to_hong_kong'
    )),
    traveler_category TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK(metric_type IN (
        'queue_status', 'passenger_count'
    )),
    raw_value REAL NOT NULL,
    congestion_level TEXT,
    feature_available INTEGER NOT NULL CHECK(feature_available IN (0, 1)),
    raw_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(
        source_id, observed_at, port_id, direction,
        traveler_category, metric_type, revision_fetched_at, raw_hash
    )
);

CREATE INDEX IF NOT EXISTS idx_external_revision_as_of
ON external_feature_revisions(
    port_id, direction, metric_type, traveler_category,
    revision_fetched_at, observed_at
);

CREATE TABLE IF NOT EXISTS batch_plans (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    service_date TEXT NOT NULL,
    request_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    organization_id TEXT NOT NULL DEFAULT 'demo-org',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_plans_company
ON batch_plans(company, created_at);

CREATE TABLE IF NOT EXISTS shadow_model_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT NOT NULL,
    target_time TEXT NOT NULL,
    port_id TEXT NOT NULL,
    port_name TEXT NOT NULL,
    statistical_wait_minutes REAL NOT NULL,
    primary_wait_minutes REAL,
    prediction_engine TEXT NOT NULL DEFAULT 'statistical_fallback',
    scenario_version TEXT,
    shadow_wait_minutes REAL,
    difference_minutes REAL,
    status TEXT NOT NULL,
    model_version TEXT,
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_shadow_model_observations_generated
ON shadow_model_observations(generated_at, id);

CREATE TABLE IF NOT EXISTS forecast_runs (
    id TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL,
    target_time TEXT NOT NULL,
    query_json TEXT NOT NULL,
    model_version TEXT NOT NULL,
    data_version TEXT NOT NULL,
    data_sources_json TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'hong_kong_to_shenzhen'
        CHECK(direction IN ('hong_kong_to_shenzhen', 'shenzhen_to_hong_kong')),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_generated
ON forecast_runs(generated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS forecast_run_ports (
    forecast_run_id TEXT NOT NULL,
    port_id TEXT NOT NULL,
    port_name TEXT NOT NULL,
    target_time TEXT NOT NULL,
    statistical_wait_minutes REAL NOT NULL,
    shadow_wait_minutes REAL,
    shadow_status TEXT NOT NULL,
    shadow_reason TEXT,
    features_json TEXT NOT NULL,
    observed_wait_minutes REAL,
    observed_report_id TEXT UNIQUE,
    observed_at TEXT,
    observed_quality_score INTEGER,
    label_status TEXT NOT NULL DEFAULT 'unlabeled',
    PRIMARY KEY(forecast_run_id, port_id),
    FOREIGN KEY(forecast_run_id) REFERENCES forecast_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecast_run_ports_label
ON forecast_run_ports(label_status, port_id, target_time);

CREATE TABLE IF NOT EXISTS forecast_feedback_links (
    report_id TEXT PRIMARY KEY,
    forecast_run_id TEXT NOT NULL,
    port_id TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    FOREIGN KEY(forecast_run_id, port_id)
        REFERENCES forecast_run_ports(forecast_run_id, port_id)
);
