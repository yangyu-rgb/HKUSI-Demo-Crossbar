from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
import json
import sqlite3
import csv

from ..exceptions import PersistenceError
from ..clock import Clock, HongKongClock
from ..external_data import load_source_registry
from .external import ExternalDataRepository
from ..providers import (
    CROWDSOURCE_FALLBACK,
    ENTERPRISE_OPERATIONS_FALLBACK,
    EVENT_FALLBACK,
    HOLIDAY_FALLBACK,
    PORT_STATE_FALLBACK,
    WEATHER_FALLBACK,
    LocalJsonProvider,
    valid_calendar,
    valid_crowdsource_seed,
    valid_enterprise_operations,
    valid_events,
    valid_port_state,
    valid_weather,
)


SCHEMA_VERSION = 15


def load_json(path: Path) -> dict | list:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


class DemoRepository:
    """Combines cached deterministic JSON inputs with transactional SQLite state."""

    def __init__(
        self,
        data_dir: Path,
        database_path: Path,
        clock: Clock | None = None,
    ):
        self._data_dir = data_dir
        self._database_path = database_path
        self._clock = clock or HongKongClock()
        provider_now = self._clock.now()
        self._providers = {
            "port_status": LocalJsonProvider(
                name="port_status",
                path=data_dir / "realtime" / "ports_status.json",
                fallback=PORT_STATE_FALLBACK,
                validator=valid_port_state,
                now=provider_now,
            ),
            "weather": LocalJsonProvider(
                name="weather",
                path=data_dir / "factors" / "weather.json",
                fallback=WEATHER_FALLBACK,
                validator=valid_weather,
                now=provider_now,
            ),
            "calendar": LocalJsonProvider(
                name="calendar",
                path=data_dir / "factors" / "holidays.json",
                fallback=HOLIDAY_FALLBACK,
                validator=valid_calendar,
                now=provider_now,
            ),
            "events": LocalJsonProvider(
                name="events",
                path=data_dir / "factors" / "events.json",
                fallback=EVENT_FALLBACK,
                validator=valid_events,
                now=provider_now,
            ),
            "crowdsource_seed": LocalJsonProvider(
                name="crowdsource_seed",
                path=data_dir / "crowdsource" / "user_reports.json",
                fallback=CROWDSOURCE_FALLBACK,
                validator=valid_crowdsource_seed,
                now=provider_now,
            ),
            "enterprise_operations": LocalJsonProvider(
                name="enterprise_operations",
                path=data_dir / "operations" / "demo_operations.json",
                fallback=ENTERPRISE_OPERATIONS_FALLBACK,
                validator=valid_enterprise_operations,
                now=provider_now,
            ),
        }
        self._port_state = self._providers["port_status"].get()
        self._locations = load_json(data_dir / "routes" / "locations.json")
        self._transit_matrix = load_json(data_dir / "routes" / "transit_matrix.json")
        self._personas = load_json(data_dir / "demo" / "personas.json")
        self._external_source_registry = load_source_registry(
            data_dir / "sources" / "official_sources.json"
        )
        self._route_validation_errors = self._validate_route_data()
        self._history_path = data_dir / "history" / "port_wait_history.csv"
        self._history = self._load_history()
        self._weather = self._providers["weather"].get()
        self._holidays = self._providers["calendar"].get()
        self._events = self._providers["events"].get()
        self._crowdsource_seed = self._providers["crowdsource_seed"].get()
        self._enterprise_operations = self._providers["enterprise_operations"].get()
        self._initialize_database()
        self.external_data = ExternalDataRepository(
            self._database_path,
            self._clock,
            self._external_source_registry,
        )

    def _utc_now(self) -> str:
        return self._clock.now().astimezone(timezone.utc).isoformat()

    @property
    def clock(self) -> Clock:
        return self._clock

    def _load_history(self) -> list[dict]:
        with self._history_path.open("r", encoding="utf-8") as file:
            return [
                {
                    **row,
                    "timestamp": datetime.fromisoformat(row["timestamp"]),
                    "wait_minutes": int(row["wait_minutes"]),
                    "is_holiday": row["is_holiday"].lower() == "true",
                }
                for row in csv.DictReader(file)
            ]

    def _connect(self) -> sqlite3.Connection:
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _initialize_database(self) -> None:
        try:
            schema = (Path(__file__).with_name("schema.sql")).read_text(encoding="utf-8")
            with self._connect() as connection:
                connection.executescript(schema)
                self._migrate_database(connection)
                is_new_database = connection.execute(
                    "SELECT COUNT(*) FROM schema_version"
                ).fetchone()[0] == 0
                connection.execute(
                    "INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)",
                    (SCHEMA_VERSION, self._utc_now()),
                )
                if is_new_database:
                    report_ids = [item["id"] for item in self._crowdsource_seed]
                    subscription_ids = [
                        item["subscription_id"]
                        for item in load_json(
                            self._data_dir / "subscriptions" / "demo_subscriptions.json"
                        )
                    ]
                    connection.executemany(
                        "DELETE FROM crowdsource_reports WHERE id = ?",
                        [(item_id,) for item_id in report_ids],
                    )
                    connection.executemany(
                        "DELETE FROM subscriptions WHERE id = ?",
                        [(item_id,) for item_id in subscription_ids],
                    )
                    self._seed_reports(connection)
                    self._seed_subscriptions(connection)
        except (OSError, sqlite3.Error) as error:
            raise PersistenceError() from error

    def _migrate_database(self, connection: sqlite3.Connection) -> None:
        """Apply additive, idempotent migrations to existing local Demo databases."""
        report_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(crowdsource_reports)")
        }
        additions = {
            "direction": (
                "TEXT NOT NULL DEFAULT 'hong_kong_to_shenzhen' "
                "CHECK(direction IN ('hong_kong_to_shenzhen', 'shenzhen_to_hong_kong'))"
            ),
            "channel": (
                "TEXT NOT NULL DEFAULT 'traveller' "
                "CHECK(channel IN ('traveller', 'vehicle', 'cargo'))"
            ),
            "is_real_observation": (
                "INTEGER NOT NULL DEFAULT 0 CHECK(is_real_observation IN (0, 1))"
            ),
            "training_consent": (
                "INTEGER NOT NULL DEFAULT 0 CHECK(training_consent IN (0, 1))"
            ),
            "source_type": (
                "TEXT NOT NULL DEFAULT 'demo_seed' "
                "CHECK(source_type IN ('demo_seed', 'demo_entry', "
                "'crowdsource_observation', 'partner', 'official'))"
            ),
            "wait_started_at": "TEXT",
            "wait_ended_at": "TEXT",
        }
        for name, declaration in additions.items():
            if name not in report_columns:
                connection.execute(
                    f"ALTER TABLE crowdsource_reports ADD COLUMN {name} {declaration}"
                )

        forecast_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(forecast_runs)")
        }
        if "direction" not in forecast_columns:
            connection.execute(
                "ALTER TABLE forecast_runs ADD COLUMN direction TEXT NOT NULL "
                "DEFAULT 'hong_kong_to_shenzhen' "
                "CHECK(direction IN ('hong_kong_to_shenzhen', 'shenzhen_to_hong_kong'))"
            )

        batch_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(batch_plans)")
        }
        if "organization_id" not in batch_columns:
            connection.execute(
                "ALTER TABLE batch_plans ADD COLUMN organization_id TEXT NOT NULL "
                "DEFAULT 'demo-org'"
            )

        forecast_port_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(forecast_run_ports)")
        }
        forecast_port_additions = {
            "primary_wait_minutes": "REAL",
            "prediction_engine": "TEXT NOT NULL DEFAULT 'statistical_fallback'",
            "scenario_version": "TEXT",
        }
        for name, declaration in forecast_port_additions.items():
            if name not in forecast_port_columns:
                connection.execute(
                    f"ALTER TABLE forecast_run_ports ADD COLUMN {name} {declaration}"
                )

        external_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(external_feature_observations)"
            )
        }
        if "first_fetched_at" not in external_columns:
            connection.execute(
                "ALTER TABLE external_feature_observations "
                "ADD COLUMN first_fetched_at TEXT"
            )
        if "last_fetched_at" not in external_columns:
            connection.execute(
                "ALTER TABLE external_feature_observations "
                "ADD COLUMN last_fetched_at TEXT"
            )
        connection.execute(
            """
            UPDATE external_feature_observations
            SET first_fetched_at = COALESCE(first_fetched_at, fetched_at),
                last_fetched_at = COALESCE(last_fetched_at, fetched_at)
            """
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO external_feature_revisions(
                source_id, source_version, revision_fetched_at, observed_at,
                port_id, direction, traveler_category, metric_type,
                raw_value, congestion_level, feature_available, raw_hash,
                created_at
            )
            SELECT source_id, source_version, fetched_at, observed_at,
                   port_id, direction, traveler_category, metric_type,
                   raw_value, congestion_level, feature_available, raw_hash,
                   created_at
            FROM external_feature_observations
            """
        )

        # Labels created before provenance was introduced are retained for audit but
        # cannot silently remain eligible for V2 training.
        connection.execute(
            """
            UPDATE forecast_run_ports
            SET label_status = 'excluded'
            WHERE label_status = 'labeled'
              AND EXISTS (
                  SELECT 1 FROM crowdsource_reports AS reports
                  WHERE reports.id = forecast_run_ports.observed_report_id
                    AND (
                        reports.is_real_observation = 0
                        OR reports.training_consent = 0
                        OR reports.source_type NOT IN (
                            'crowdsource_observation', 'partner', 'official'
                        )
                    )
              )
            """
        )

    def _validate_route_data(self) -> list[str]:
        errors: list[str] = []
        origins = {item["id"]: item for item in self._locations.get("origins", [])}
        destinations = {
            item["id"]: item for item in self._locations.get("destinations", [])
        }
        if len(origins) != len(self._locations.get("origins", [])):
            errors.append("出发地点 ID 不唯一")
        if len(destinations) != len(self._locations.get("destinations", [])):
            errors.append("目的地点 ID 不唯一")
        port_ids = {item["id"] for item in self._port_state["ports"]}
        for direction in self._locations.get("directions", []):
            direction_id = direction["id"]
            matrix = self._transit_matrix.get(direction_id)
            if matrix is None:
                errors.append(f"缺少 {direction_id} 交通矩阵")
                continue
            for origin_id in direction["origin_ids"]:
                if origin_id not in origins:
                    errors.append(f"未知出发地点 {origin_id}")
                    continue
                legs = matrix.get("access", {}).get(origin_id, {})
                if set(legs) != port_ids:
                    errors.append(f"{direction_id}/{origin_id} 未覆盖四口岸")
            for port_id in port_ids:
                legs = matrix.get("onward", {}).get(port_id, {})
                missing = set(direction["destination_ids"]) - set(legs)
                if missing:
                    errors.append(
                        f"{direction_id}/{port_id} 缺少目的地 {sorted(missing)}"
                    )
            for section in ("access", "onward"):
                for legs in matrix.get(section, {}).values():
                    for leg in legs.values():
                        if leg.get("duration", -1) < 0 or leg.get("cost", -1) < 0:
                            errors.append(f"{direction_id} 存在负数时间或费用")
        return errors

    def _seed_reports(self, connection: sqlite3.Connection) -> None:
        reports = self._crowdsource_seed
        now = self._clock.now().replace(microsecond=0)
        for report in reports:
            effective_at = now - timedelta(minutes=report["age_minutes"])
            connection.execute(
                """
                INSERT INTO crowdsource_reports(
                    id, user_id, port, actual_wait_time, crowd_level,
                    effective_at, time_label, comment, direction, channel,
                    is_real_observation, training_consent, source_type,
                    wait_started_at, wait_ended_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    report["id"],
                    report["user_id"],
                    report["port"],
                    report["actual_wait_time"],
                    report["crowd_level"],
                    effective_at.isoformat(),
                    "",
                    report["comment"],
                    "hong_kong_to_shenzhen",
                    "traveller",
                    0,
                    0,
                    "demo_seed",
                    (
                        effective_at - timedelta(minutes=report["actual_wait_time"])
                    ).isoformat(),
                    effective_at.isoformat(),
                    effective_at.astimezone(timezone.utc).isoformat(),
                ),
            )

    def _seed_subscriptions(self, connection: sqlite3.Connection) -> None:
        subscriptions = load_json(
            self._data_dir / "subscriptions" / "demo_subscriptions.json"
        )
        for subscription in subscriptions:
            routine = subscription["routine"]
            alerts = subscription["alerts"]
            created_at = self._utc_now()
            connection.execute(
                """
                INSERT INTO subscriptions(
                    id, user_id, origin_id, destination_id, days_json,
                    arrival_deadline, priority, advance_reminder,
                    anomaly_alert, better_route_alert, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    subscription["subscription_id"],
                    subscription["user_id"],
                    routine.get("origin_id", "hku"),
                    routine.get("destination_id", "nanshan-tech"),
                    json.dumps(routine["days"]),
                    routine["arrival_deadline"],
                    routine["priority"],
                    int(alerts["advance_reminder"]),
                    int(alerts["anomaly_alert"]),
                    int(alerts["better_route_alert"]),
                    created_at,
                    created_at,
                ),
            )

    @staticmethod
    def _report_from_row(row: sqlite3.Row) -> dict:
        record = {
            "id": row["id"],
            "user_id": row["user_id"],
            "port": row["port"],
            "actual_wait_time": row["actual_wait_time"],
            "crowd_level": row["crowd_level"],
            "timestamp": row["effective_at"],
            "time_label": row["time_label"],
            "comment": row["comment"],
            "direction": row["direction"],
            "channel": row["channel"],
            "is_real_observation": bool(row["is_real_observation"]),
            "training_consent": bool(row["training_consent"]),
            "source_type": row["source_type"],
            "wait_started_at": row["wait_started_at"],
            "wait_ended_at": row["wait_ended_at"],
            "_created_at": row["created_at"],
        }
        if "forecast_run_id" in row.keys():
            record["forecast_run_id"] = row["forecast_run_id"]
            record["forecast_port_id"] = row["forecast_port_id"]
        return record

    @staticmethod
    def _subscription_from_row(row: sqlite3.Row) -> dict:
        return {
            "subscription_id": row["id"],
            "user_id": row["user_id"],
            "routine": {
                "origin_id": row["origin_id"],
                "destination_id": row["destination_id"],
                "days": json.loads(row["days_json"]),
                "arrival_deadline": row["arrival_deadline"],
                "priority": row["priority"],
            },
            "alerts": {
                "advance_reminder": bool(row["advance_reminder"]),
                "anomaly_alert": bool(row["anomaly_alert"]),
                "better_route_alert": bool(row["better_route_alert"]),
            },
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _subscription_evaluation_from_row(row: sqlite3.Row) -> dict:
        return {
            "evaluation_id": row["id"],
            "subscription_id": row["subscription_id"],
            "evaluated_at": row["evaluated_at"],
            "evaluation_time": row["evaluation_time"],
            "commute_date": row["commute_date"],
            "target_time": row["target_time"],
            "recommended_port": row["recommended_port"],
            "recommended_port_id": row["recommended_port_id"],
            "latest_departure": row["latest_departure"],
            "next_alert": row["next_alert"],
            "alternative_port": row["alternative_port"],
            "alerts": json.loads(row["alerts_json"]),
            "warnings": json.loads(row["warnings_json"]),
            "is_read": bool(row["is_read"]),
            "read_at": row["read_at"],
            "created_at": row["created_at"],
        }

    def get_port_state(self) -> dict:
        return deepcopy(self._port_state)

    def get_locations(self) -> dict:
        return deepcopy(self._locations)

    def get_personas(self) -> dict:
        return deepcopy(self._personas)

    def get_persona(self, persona_id: str | None = None) -> dict | None:
        selected_id = persona_id or self._personas["default_persona_id"]
        return next(
            (
                deepcopy(item)
                for item in self._personas["personas"]
                if item["id"] == selected_id
            ),
            None,
        )

    def get_route_validation_errors(self) -> list[str]:
        return list(self._route_validation_errors)

    def infer_direction(self, origin_id: str, destination_id: str) -> str | None:
        origin = self.find_location(origin_id, "origins")
        destination = self.find_location(destination_id, "destinations")
        if origin is None or destination is None or origin["city"] == destination["city"]:
            return None
        if origin["city"] == "香港" and destination["city"] == "深圳":
            return "hong_kong_to_shenzhen"
        if origin["city"] == "深圳" and destination["city"] == "香港":
            return "shenzhen_to_hong_kong"
        return None

    def get_weather(self) -> dict:
        return deepcopy(self._weather)

    def get_holidays(self) -> dict:
        return deepcopy(self._holidays)

    def get_events(self) -> dict:
        return deepcopy(self._events)

    def get_enterprise_operations(self) -> dict:
        return deepcopy(self._enterprise_operations)

    def get_provider_statuses(self) -> list[dict]:
        return [
            {
                **provider.status(),
                "data_version": provider.version(),
            }
            for provider in self._providers.values()
        ]

    def get_prediction_input_context(
        self,
        target_time: datetime,
        scenario_override: dict | None = None,
        *,
        use_default_scenario: bool = False,
    ) -> dict:
        scenario_date = target_time.date().isoformat()
        if use_default_scenario:
            scenario = self._default_scenario(scenario_date)
        elif scenario_override is not None:
            scenario = self._version_scenario(
                {
                    **scenario_override,
                    "date": scenario_date,
                    "is_override": False,
                    "is_preview": True,
                }
            )
        else:
            scenario = self.get_scenario(scenario_date)
        return {
            "weather": scenario["weather"],
            "is_holiday": scenario["is_holiday"],
            "scenario": scenario,
            "data_sources": self.get_provider_statuses(),
            "data_version": scenario["version"] + "-" + "-".join(
                item["data_version"]
                for item in self.get_provider_statuses()
            ),
        }

    def _default_scenario(self, scenario_date: str) -> dict:
        payload = {
            "date": scenario_date,
            "weather": "clear",
            "is_holiday": scenario_date in set(self._holidays["dates"]),
            "events": [],
            "is_override": False,
        }
        return self._version_scenario(payload)

    @staticmethod
    def _version_scenario(payload: dict) -> dict:
        from hashlib import sha256
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return {**payload, "version": sha256(canonical.encode("utf-8")).hexdigest()[:16]}

    def get_scenario(self, scenario_date: str) -> dict:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    "SELECT payload_json FROM scenario_overrides WHERE scenario_date = ?",
                    (scenario_date,),
                ).fetchone()
            if row is None:
                return self._default_scenario(scenario_date)
            payload = json.loads(row["payload_json"])
            return self._version_scenario({**payload, "date": scenario_date, "is_override": True})
        except (sqlite3.Error, json.JSONDecodeError) as error:
            raise PersistenceError() from error

    def list_scenarios(self, start_date: str, days: int) -> list[dict]:
        start = datetime.fromisoformat(start_date).date()
        return [self.get_scenario((start + timedelta(days=offset)).isoformat()) for offset in range(days)]

    def save_scenario(self, scenario_date: str, payload: dict) -> dict:
        stored = {**payload, "date": scenario_date}
        stored.pop("version", None)
        stored.pop("is_override", None)
        try:
            with self._connect() as connection:
                connection.execute(
                    "INSERT INTO scenario_overrides(scenario_date, payload_json, updated_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(scenario_date) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at",
                    (scenario_date, json.dumps(stored, ensure_ascii=False), self._utc_now()),
                )
            return self.get_scenario(scenario_date)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def delete_scenario(self, scenario_date: str) -> dict:
        try:
            with self._connect() as connection:
                connection.execute("DELETE FROM scenario_overrides WHERE scenario_date = ?", (scenario_date,))
            return self.get_scenario(scenario_date)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_history_path(self) -> Path:
        return self._history_path

    def get_v1_model_metadata(self) -> dict:
        return load_json(self._data_dir / "models" / "wait_model_v1.metadata.json")

    def get_v2_model_metadata(self) -> dict:
        return load_json(self._data_dir / "models" / "wait_model_v2.metadata.json")

    def database_ready(self) -> bool:
        try:
            with self._connect() as connection:
                return connection.execute("SELECT 1").fetchone()[0] == 1
        except sqlite3.Error:
            return False

    def get_external_source_registry(self) -> dict:
        return self.external_data.get_registry()

    def save_external_collection(
        self,
        *,
        source: dict,
        fetched_at: str,
        raw_hash: str,
        archive_path: str,
        observations: list[dict],
    ) -> int:
        return self.external_data.save_collection(
            source=source,
            fetched_at=fetched_at,
            raw_hash=raw_hash,
            archive_path=archive_path,
            observations=observations,
        )

    def record_external_collection_failure(
        self,
        *,
        source: dict,
        fetched_at: str,
        error: str,
    ) -> None:
        self.external_data.record_failure(
            source=source,
            fetched_at=fetched_at,
            error=error,
        )

    def get_external_data_readiness(self) -> dict:
        return self.external_data.readiness()

    def get_history(self, port_name: str) -> list[dict]:
        return [
            deepcopy(record)
            for record in self._history
            if record["port"] == port_name
        ]

    def find_location(self, location_id: str, kind: str) -> dict | None:
        return next(
            (item for item in self._locations[kind] if item["id"] == location_id),
            None,
        )

    def get_access_leg(self, direction: str, origin_id: str, port_id: str) -> dict:
        return deepcopy(self._transit_matrix[direction]["access"][origin_id][port_id])

    def get_onward_leg(self, direction: str, port_id: str, destination_id: str) -> dict:
        return deepcopy(
            self._transit_matrix[direction]["onward"][port_id][destination_id]
        )

    def get_reports(self, limit: int | None = None) -> list[dict]:
        query = """
            SELECT reports.*, links.forecast_run_id,
                   links.port_id AS forecast_port_id
            FROM crowdsource_reports AS reports
            LEFT JOIN forecast_feedback_links AS links ON links.report_id = reports.id
            ORDER BY reports.created_at ASC, reports.id ASC
        """
        parameters: tuple = ()
        if limit is not None:
            query = """
                SELECT * FROM (
                    SELECT reports.*, links.forecast_run_id,
                           links.port_id AS forecast_port_id
                    FROM crowdsource_reports AS reports
                    LEFT JOIN forecast_feedback_links AS links ON links.report_id = reports.id
                    ORDER BY created_at DESC, id DESC LIMIT ?
                ) ORDER BY created_at ASC, id ASC
            """
            parameters = (limit,)
        try:
            with self._connect() as connection:
                rows = connection.execute(query, parameters).fetchall()
            return [self._report_from_row(row) for row in rows]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def add_report(self, report: dict) -> dict:
        record = {
            "direction": "hong_kong_to_shenzhen",
            "channel": "traveller",
            "is_real_observation": False,
            "training_consent": False,
            "source_type": "demo_entry",
            **report,
            "id": report.get("id", f"report-{uuid4().hex[:12]}"),
            "_created_at": self._utc_now(),
        }
        observed_at = datetime.fromisoformat(record["timestamp"])
        record.setdefault("wait_ended_at", observed_at.isoformat())
        record.setdefault(
            "wait_started_at",
            (observed_at - timedelta(minutes=record["actual_wait_time"])).isoformat(),
        )
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO crowdsource_reports(
                        id, user_id, port, actual_wait_time, crowd_level,
                        effective_at, time_label, comment, direction, channel,
                        is_real_observation, training_consent, source_type,
                        wait_started_at, wait_ended_at, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record["id"],
                        record["user_id"],
                        record["port"],
                        record["actual_wait_time"],
                        record["crowd_level"],
                        record["timestamp"],
                        record["time_label"],
                        record["comment"],
                        record["direction"],
                        record["channel"],
                        int(record["is_real_observation"]),
                        int(record["training_consent"]),
                        record["source_type"],
                        record["wait_started_at"],
                        record["wait_ended_at"],
                        record["_created_at"],
                    ),
                )
            return deepcopy(record)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_subscriptions(self, user_id: str) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM subscriptions
                    WHERE user_id = ? ORDER BY created_at DESC, id DESC
                    """,
                    (user_id,),
                ).fetchall()
            return [self._subscription_from_row(row) for row in rows]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_subscription(self, subscription_id: str) -> dict | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    "SELECT * FROM subscriptions WHERE id = ?",
                    (subscription_id,),
                ).fetchone()
            return self._subscription_from_row(row) if row else None
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def add_subscription(self, subscription: dict) -> dict:
        record = {
            **subscription,
            "subscription_id": subscription.get(
                "subscription_id",
                f"sub-{uuid4().hex[:12]}",
            ),
            "created_at": self._utc_now(),
            "updated_at": self._utc_now(),
        }
        routine = record["routine"]
        alerts = record["alerts"]
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO subscriptions(
                        id, user_id, origin_id, destination_id, days_json,
                        arrival_deadline, priority, advance_reminder,
                        anomaly_alert, better_route_alert, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record["subscription_id"],
                        record["user_id"],
                        routine["origin_id"],
                        routine["destination_id"],
                        json.dumps(routine["days"]),
                        routine["arrival_deadline"],
                        routine["priority"],
                        int(alerts["advance_reminder"]),
                        int(alerts["anomaly_alert"]),
                        int(alerts["better_route_alert"]),
                        record["created_at"],
                        record["updated_at"],
                    ),
                )
            return deepcopy(record)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def update_subscription(self, subscription_id: str, subscription: dict) -> dict | None:
        routine = subscription["routine"]
        alerts = subscription["alerts"]
        updated_at = self._utc_now()
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    UPDATE subscriptions SET
                        origin_id = ?, destination_id = ?, days_json = ?,
                        arrival_deadline = ?, priority = ?,
                        advance_reminder = ?, anomaly_alert = ?,
                        better_route_alert = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        routine["origin_id"],
                        routine["destination_id"],
                        json.dumps(routine["days"]),
                        routine["arrival_deadline"],
                        routine["priority"],
                        int(alerts["advance_reminder"]),
                        int(alerts["anomaly_alert"]),
                        int(alerts["better_route_alert"]),
                        updated_at,
                        subscription_id,
                    ),
                )
                if cursor.rowcount == 0:
                    return None
            return self.get_subscription(subscription_id)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def delete_subscription(self, subscription_id: str) -> bool:
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    "DELETE FROM subscriptions WHERE id = ?",
                    (subscription_id,),
                )
            return cursor.rowcount > 0
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def save_subscription_evaluation(self, evaluation: dict) -> dict:
        record = {
            **evaluation,
            "evaluation_id": f"eval-{uuid4().hex[:12]}",
            "is_read": False,
            "read_at": None,
            "created_at": self._utc_now(),
        }
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO subscription_evaluations(
                        id, subscription_id, evaluated_at, evaluation_time,
                        commute_date, target_time, recommended_port,
                        recommended_port_id, latest_departure, next_alert,
                        alternative_port, alerts_json, warnings_json, is_read,
                        read_at, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record["evaluation_id"],
                        record["subscription_id"],
                        record["evaluated_at"].isoformat(),
                        record["evaluation_time"].isoformat(),
                        record["commute_date"].isoformat(),
                        record["target_time"].isoformat(),
                        record["recommended_port"],
                        record["recommended_port_id"],
                        record["latest_departure"].isoformat(),
                        record["next_alert"].isoformat()
                        if record["next_alert"]
                        else None,
                        record["alternative_port"],
                        json.dumps(record["alerts"], ensure_ascii=False, default=str),
                        json.dumps(record["warnings"], ensure_ascii=False),
                        0,
                        None,
                        record["created_at"],
                    ),
                )
            return self.get_subscription_evaluation(record["evaluation_id"])
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_subscription_evaluation(self, evaluation_id: str) -> dict | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    "SELECT * FROM subscription_evaluations WHERE id = ?",
                    (evaluation_id,),
                ).fetchone()
            return self._subscription_evaluation_from_row(row) if row else None
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_subscription_evaluations(
        self,
        subscription_id: str,
        limit: int,
    ) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM subscription_evaluations
                    WHERE subscription_id = ?
                    ORDER BY evaluated_at DESC, id DESC LIMIT ?
                    """,
                    (subscription_id, limit),
                ).fetchall()
            return [self._subscription_evaluation_from_row(row) for row in rows]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def mark_subscription_evaluation_read(self, evaluation_id: str) -> dict | None:
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    UPDATE subscription_evaluations
                    SET is_read = 1, read_at = COALESCE(read_at, ?)
                    WHERE id = ?
                    """,
                    (self._utc_now(), evaluation_id),
                )
                if cursor.rowcount == 0:
                    return None
            return self.get_subscription_evaluation(evaluation_id)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def save_notifications(self, evaluation: dict, user_id: str) -> int:
        created = 0
        try:
            with self._connect() as connection:
                for alert in evaluation["alerts"]:
                    if not alert["triggered"] or alert["scheduled_at"] is None:
                        continue
                    cursor = connection.execute(
                        """
                        INSERT OR IGNORE INTO notifications(
                            id, user_id, subscription_id, evaluation_id, kind,
                            title, message, scheduled_at, is_read, read_at, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
                        """,
                        (
                            f"notification-{uuid4().hex[:12]}",
                            user_id,
                            evaluation["subscription_id"],
                            evaluation["evaluation_id"],
                            alert["kind"],
                            alert["title"],
                            alert["message"],
                            alert["scheduled_at"],
                            self._utc_now(),
                        ),
                    )
                    created += cursor.rowcount
            return created
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_notifications(
        self,
        user_id: str,
        limit: int,
        unread_only: bool = False,
    ) -> list[dict]:
        clause = "AND is_read = 0" if unread_only else ""
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    f"""
                    SELECT * FROM notifications
                    WHERE user_id = ? {clause}
                    ORDER BY scheduled_at DESC, created_at DESC LIMIT ?
                    """,
                    (user_id, limit),
                ).fetchall()
            return [dict(row) | {"is_read": bool(row["is_read"])} for row in rows]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def mark_notification_read(
        self,
        notification_id: str,
        user_id: str | None = None,
    ) -> dict | None:
        owner_clause = " AND user_id = ?" if user_id is not None else ""
        parameters = (
            (self._utc_now(), notification_id, user_id)
            if user_id is not None
            else (self._utc_now(), notification_id)
        )
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    f"""
                    UPDATE notifications
                    SET is_read = 1, read_at = COALESCE(read_at, ?)
                    WHERE id = ?{owner_clause}
                    """,
                    parameters,
                )
                if cursor.rowcount == 0:
                    return None
                row = connection.execute(
                    "SELECT * FROM notifications WHERE id = ?",
                    (notification_id,),
                ).fetchone()
            return dict(row) | {"is_read": bool(row["is_read"])}
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def record_audit_event(self, event: dict) -> None:
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO audit_events(
                        request_id, persona_id, organization_id, method,
                        path, status_code, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event["request_id"],
                        event["persona_id"],
                        event["organization_id"],
                        event["method"],
                        event["path"],
                        event["status_code"],
                        self._utc_now(),
                    ),
                )
        except sqlite3.Error:
            return

    def list_audit_events(self, limit: int) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    "SELECT * FROM audit_events ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(row) for row in rows]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def record_error_event(self, event: dict) -> None:
        """Best-effort operational record; never masks the original error."""
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO error_events(
                        request_id, method, path, status_code, error_code,
                        category, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event["request_id"],
                        event["method"],
                        event["path"],
                        event["status_code"],
                        event["error_code"],
                        event["category"],
                        self._utc_now(),
                    ),
                )
        except (OSError, sqlite3.Error):
            return

    def get_operations_summary(self, window_hours: int, current_time: datetime) -> dict:
        threshold = current_time - timedelta(hours=window_hours)

        def in_window(value: str) -> bool:
            parsed = datetime.fromisoformat(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed >= threshold.astimezone(parsed.tzinfo)

        try:
            with self._connect() as connection:
                forecast_rows = connection.execute(
                    """
                    SELECT runs.id, runs.generated_at, ports.port_id,
                           ports.prediction_engine
                    FROM forecast_runs AS runs
                    JOIN forecast_run_ports AS ports
                      ON ports.forecast_run_id = runs.id
                    ORDER BY runs.generated_at ASC, ports.port_id ASC
                    """
                ).fetchall()
                error_rows = connection.execute(
                    "SELECT * FROM error_events ORDER BY created_at DESC, id DESC"
                ).fetchall()
                audit_rows = connection.execute(
                    "SELECT * FROM audit_events ORDER BY created_at DESC, id DESC"
                ).fetchall()
                linked_rows = connection.execute(
                    "SELECT linked_at FROM forecast_feedback_links"
                ).fetchall()
                commercial_rows = connection.execute(
                    "SELECT plan_id, billing_cycle, status, price_hkd FROM commercial_subscriptions"
                ).fetchall()
                transaction_rows = connection.execute(
                    "SELECT amount_hkd, created_at FROM commercial_transactions"
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError() from error

        forecasts = [dict(row) for row in forecast_rows if in_window(row["generated_at"])]
        errors = [dict(row) for row in error_rows if in_window(row["created_at"])]
        audits = [dict(row) for row in audit_rows if in_window(row["created_at"])]
        linked_count = sum(in_window(row["linked_at"]) for row in linked_rows)
        active_commercial = [row for row in commercial_rows if row["status"] == "active"]
        plan_distribution: dict[str, int] = {}
        for row in active_commercial:
            plan_distribution[row["plan_id"]] = plan_distribution.get(row["plan_id"], 0) + 1
        demo_mrr = round(sum(
            row["price_hkd"] if row["billing_cycle"] == "monthly" else row["price_hkd"] / 12
            for row in active_commercial
        ))
        window_revenue = sum(
            row["amount_hkd"] for row in transaction_rows if in_window(row["created_at"])
        )
        run_engines: dict[str, str] = {}
        port_counts: dict[str, int] = {}
        hourly: dict[str, set[str]] = {}
        for row in forecasts:
            run_engines[row["id"]] = row["prediction_engine"]
            port_counts[row["port_id"]] = port_counts.get(row["port_id"], 0) + 1
            bucket = datetime.fromisoformat(row["generated_at"]).replace(minute=0, second=0, microsecond=0).isoformat()
            hourly.setdefault(bucket, set()).add(row["id"])
        engine_counts: dict[str, int] = {}
        for engine in run_engines.values():
            engine_counts[engine] = engine_counts.get(engine, 0) + 1
        error_codes: dict[str, int] = {}
        error_paths: dict[str, int] = {}
        for row in errors:
            error_codes[row["error_code"]] = error_codes.get(row["error_code"], 0) + 1
            error_paths[row["path"]] = error_paths.get(row["path"], 0) + 1
        audit_paths: dict[str, int] = {}
        for row in audits:
            audit_paths[row["path"]] = audit_paths.get(row["path"], 0) + 1
        return {
            "forecast": {
                "total_runs": len(run_engines),
                "engine_counts": engine_counts,
                "port_evaluations": port_counts,
                "hourly_runs": [
                    {"hour": hour, "count": len(ids)}
                    for hour, ids in sorted(hourly.items())
                ],
            },
            "errors": {
                "total": len(errors),
                "by_code": error_codes,
                "by_path": error_paths,
                "recent": errors[:10],
            },
            "audit": {
                "total": len(audits),
                "by_path": audit_paths,
                "recent": audits[:10],
            },
            "linked_feedback_count": linked_count,
            "commercial": {
                "active_subscriptions": len(active_commercial),
                "demo_mrr_hkd": demo_mrr,
                "window_checkout_hkd": window_revenue,
                "plan_distribution": plan_distribution,
                "demo_only": True,
            },
        }

    def save_batch_plan(
        self,
        company: str,
        service_date: str,
        request: dict,
        result: dict,
        organization_id: str = "demo-org",
    ) -> str:
        plan_id = f"plan-{uuid4().hex[:12]}"
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO batch_plans(
                        id, company, service_date, request_json, result_json,
                        organization_id, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        plan_id,
                        company,
                        service_date,
                        json.dumps(request, ensure_ascii=False),
                        json.dumps(result, ensure_ascii=False),
                        organization_id,
                        self._utc_now(),
                    ),
                )
            return plan_id
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_commercial_subscription(self, account_id: str) -> dict | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    "SELECT * FROM commercial_subscriptions WHERE account_id = ?",
                    (account_id,),
                ).fetchone()
            return dict(row) if row else None
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def save_commercial_subscription(self, *, account_id: str, persona: dict, plan_id: str, billing_cycle: str, price_hkd: int, started_at: datetime, renews_at: datetime) -> dict:
        receipt_id = f"demo-receipt-{uuid4().hex[:10]}"
        now = self._utc_now()
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO commercial_subscriptions(
                        account_id, persona_id, organization_id, plan_id,
                        billing_cycle, status, price_hkd, started_at,
                        renews_at, receipt_id, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
                    ON CONFLICT(account_id) DO UPDATE SET
                        persona_id=excluded.persona_id,
                        organization_id=excluded.organization_id,
                        plan_id=excluded.plan_id,
                        billing_cycle=excluded.billing_cycle,
                        status='active', price_hkd=excluded.price_hkd,
                        started_at=excluded.started_at, renews_at=excluded.renews_at,
                        receipt_id=excluded.receipt_id, updated_at=excluded.updated_at
                    """,
                    (account_id, persona["id"], persona["organization_id"], plan_id, billing_cycle, price_hkd, started_at.isoformat(), renews_at.isoformat(), receipt_id, now),
                )
                connection.execute(
                    "INSERT INTO commercial_transactions(id, account_id, plan_id, billing_cycle, amount_hkd, status, created_at) VALUES (?, ?, ?, ?, ?, 'demo_succeeded', ?)",
                    (receipt_id, account_id, plan_id, billing_cycle, price_hkd, now),
                )
                row = connection.execute("SELECT * FROM commercial_subscriptions WHERE account_id = ?", (account_id,)).fetchone()
            return dict(row)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def cancel_commercial_subscription(self, account_id: str) -> dict | None:
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    "UPDATE commercial_subscriptions SET status = 'canceled', updated_at = ? WHERE account_id = ? AND status = 'active'",
                    (self._utc_now(), account_id),
                )
                if cursor.rowcount == 0:
                    return None
                row = connection.execute("SELECT * FROM commercial_subscriptions WHERE account_id = ?", (account_id,)).fetchone()
            return dict(row)
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_batch_plans(
        self,
        company: str,
        limit: int,
        organization_id: str = "demo-org",
    ) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM batch_plans
                    WHERE company = ? AND organization_id = ?
                    ORDER BY created_at DESC LIMIT ?
                    """,
                    (company, organization_id, limit),
                ).fetchall()
            return [
                {
                    "plan_id": row["id"],
                    "company": row["company"],
                    "date": row["service_date"],
                    "request": json.loads(row["request_json"]),
                    "result": json.loads(row["result_json"]),
                    "created_at": row["created_at"],
                }
                for row in rows
            ]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_batch_plan(
        self,
        plan_id: str,
        organization_id: str = "demo-org",
    ) -> dict | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    "SELECT * FROM batch_plans WHERE id = ? AND organization_id = ?",
                    (plan_id, organization_id),
                ).fetchone()
            if row is None:
                return None
            return {
                "plan_id": row["id"],
                "company": row["company"],
                "date": row["service_date"],
                "request": json.loads(row["request_json"]),
                "result": json.loads(row["result_json"]),
                "created_at": row["created_at"],
            }
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def save_enterprise_operation_plan(
        self,
        *,
        organization_id: str,
        workspace_kind: str,
        scenario_id: str,
        request: dict,
        result: dict,
    ) -> dict:
        plan_id = f"ops-{uuid4().hex[:12]}"
        created_at = self._utc_now()
        stored = {
            **result,
            "plan_id": plan_id,
            "status": "adopted",
            "adopted_at": created_at,
            "outcome": None,
        }
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO enterprise_operation_plans(
                        id, organization_id, workspace_kind, scenario_id,
                        request_json, result_json, outcome_json, status,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'adopted', ?, ?)
                    """,
                    (
                        plan_id,
                        organization_id,
                        workspace_kind,
                        scenario_id,
                        json.dumps(request, ensure_ascii=False),
                        json.dumps(stored, ensure_ascii=False),
                        created_at,
                        created_at,
                    ),
                )
            return stored
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_enterprise_operation_plans(
        self,
        organization_id: str,
        limit: int = 10,
    ) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT result_json, outcome_json FROM enterprise_operation_plans
                    WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?
                    """,
                    (organization_id, limit),
                ).fetchall()
            plans = []
            for row in rows:
                result = json.loads(row["result_json"])
                result["outcome"] = (
                    json.loads(row["outcome_json"])
                    if row["outcome_json"]
                    else None
                )
                plans.append(result)
            return plans
        except (sqlite3.Error, json.JSONDecodeError) as error:
            raise PersistenceError() from error

    def get_enterprise_operation_plan(
        self,
        plan_id: str,
        organization_id: str,
    ) -> dict | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT result_json, outcome_json FROM enterprise_operation_plans
                    WHERE id = ? AND organization_id = ?
                    """,
                    (plan_id, organization_id),
                ).fetchone()
            if row is None:
                return None
            result = json.loads(row["result_json"])
            result["outcome"] = (
                json.loads(row["outcome_json"])
                if row["outcome_json"]
                else None
            )
            return result
        except (sqlite3.Error, json.JSONDecodeError) as error:
            raise PersistenceError() from error

    def save_enterprise_operation_outcome(
        self,
        plan_id: str,
        organization_id: str,
        outcome: dict,
    ) -> dict | None:
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    UPDATE enterprise_operation_plans
                    SET outcome_json = ?, status = 'reviewed', updated_at = ?
                    WHERE id = ? AND organization_id = ?
                    """,
                    (
                        json.dumps(outcome, ensure_ascii=False),
                        self._utc_now(),
                        plan_id,
                        organization_id,
                    ),
                )
                if cursor.rowcount == 0:
                    return None
                row = connection.execute(
                    "SELECT result_json FROM enterprise_operation_plans WHERE id = ?",
                    (plan_id,),
                ).fetchone()
            result = json.loads(row["result_json"])
            return {**result, "status": "reviewed", "outcome": outcome}
        except (sqlite3.Error, json.JSONDecodeError) as error:
            raise PersistenceError() from error

    def save_coordination_notice(
        self,
        organization_id: str,
        notice: dict,
    ) -> dict:
        notice_id = f"notice-{uuid4().hex[:12]}"
        created_at = self._utc_now()
        stored = {
            "id": notice_id,
            "organization_id": organization_id,
            **notice,
            "created_at": created_at,
            "demo_only": True,
        }
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO coordination_notices(
                        id, organization_id, title, message, affected_ports_json,
                        valid_until, severity, demo_only, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                    """,
                    (
                        notice_id,
                        organization_id,
                        notice["title"],
                        notice["message"],
                        json.dumps(notice["affected_ports"], ensure_ascii=False),
                        notice["valid_until"],
                        notice["severity"],
                        created_at,
                    ),
                )
            return stored
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_coordination_notices(self, limit: int = 20) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    "SELECT * FROM coordination_notices ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [
                {
                    "id": row["id"],
                    "organization_id": row["organization_id"],
                    "title": row["title"],
                    "message": row["message"],
                    "affected_ports": json.loads(row["affected_ports_json"]),
                    "valid_until": row["valid_until"],
                    "severity": row["severity"],
                    "created_at": row["created_at"],
                    "demo_only": bool(row["demo_only"]),
                }
                for row in rows
            ]
        except (sqlite3.Error, json.JSONDecodeError) as error:
            raise PersistenceError() from error

    def save_shadow_observations(self, observations: list[dict]) -> None:
        if not observations:
            return
        try:
            with self._connect() as connection:
                connection.executemany(
                    """
                    INSERT INTO shadow_model_observations(
                        generated_at, target_time, port_id, port_name,
                        statistical_wait_minutes, shadow_wait_minutes,
                        difference_minutes, status, model_version, reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            observation["generated_at"],
                            observation["target_time"],
                            observation["port_id"],
                            observation["port_name"],
                            observation["statistical_wait_minutes"],
                            observation["shadow_wait_minutes"],
                            observation["difference_minutes"],
                            observation["status"],
                            observation["model_version"],
                            observation["reason"],
                        )
                        for observation in observations
                    ],
                )
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def save_forecast_run(self, run: dict, ports: list[dict]) -> None:
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO forecast_runs(
                        id, generated_at, target_time, query_json, model_version,
                        data_version, data_sources_json, direction, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run["id"],
                        run["generated_at"],
                        run["target_time"],
                        json.dumps(run["query"], ensure_ascii=False, default=str),
                        run["model_version"],
                        run["data_version"],
                        json.dumps(run["data_sources"], ensure_ascii=False),
                        run.get("direction", "hong_kong_to_shenzhen"),
                        self._utc_now(),
                    ),
                )
                connection.executemany(
                    """
                    INSERT OR IGNORE INTO forecast_run_ports(
                        forecast_run_id, port_id, port_name, target_time,
                        statistical_wait_minutes, primary_wait_minutes,
                        prediction_engine, scenario_version,
                        shadow_wait_minutes, shadow_status, shadow_reason,
                        features_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            run["id"],
                            port["port_id"],
                            port["port_name"],
                            run["target_time"],
                            port["statistical_wait_minutes"],
                            port.get(
                                "primary_wait_minutes",
                                port["statistical_wait_minutes"],
                            ),
                            port.get("prediction_engine", "statistical_fallback"),
                            port.get("scenario_version"),
                            port["shadow_wait_minutes"],
                            port["shadow_status"],
                            port["shadow_reason"],
                            json.dumps(port["features"], ensure_ascii=False),
                        )
                        for port in ports
                    ],
                )
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_forecast_run_port(self, forecast_run_id: str, port_id: str) -> dict | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT ports.forecast_run_id, ports.port_id, ports.port_name,
                           ports.target_time, runs.direction,
                           ports.statistical_wait_minutes,
                           ports.primary_wait_minutes,
                           ports.prediction_engine, ports.scenario_version,
                           ports.shadow_wait_minutes, ports.shadow_status,
                           ports.shadow_reason, ports.features_json,
                           ports.observed_wait_minutes, ports.observed_report_id,
                           ports.observed_at, ports.observed_quality_score,
                           ports.label_status
                    FROM forecast_run_ports AS ports
                    JOIN forecast_runs AS runs ON runs.id = ports.forecast_run_id
                    WHERE ports.forecast_run_id = ? AND ports.port_id = ?
                    """,
                    (forecast_run_id, port_id),
                ).fetchone()
            if row is None:
                return None
            record = dict(row)
            record["features"] = json.loads(record.pop("features_json"))
            return record
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def link_feedback_to_forecast(
        self,
        *,
        report_id: str,
        forecast_run_id: str,
        port_id: str,
        actual_wait_minutes: int,
        quality_score: int,
        eligible_for_label: bool,
        ineligibility_reason: str | None = None,
    ) -> dict | None:
        """Link feedback to a forecast, and label it only when quality is high."""
        try:
            with self._connect() as connection:
                run_port = connection.execute(
                    """
                    SELECT observed_report_id FROM forecast_run_ports
                    WHERE forecast_run_id = ? AND port_id = ?
                    """,
                    (forecast_run_id, port_id),
                ).fetchone()
                if run_port is None:
                    return None
                report_row = connection.execute(
                    """
                    SELECT is_real_observation, training_consent, source_type
                    FROM crowdsource_reports WHERE id = ?
                    """,
                    (report_id,),
                ).fetchone()
                if report_row is None:
                    return {
                        "linked": False,
                        "labeled": False,
                        "reason": "反馈记录不存在",
                    }
                existing_link = connection.execute(
                    """
                    SELECT report_id FROM forecast_feedback_links
                    WHERE report_id = ?
                    """,
                    (report_id,),
                ).fetchone()
                if existing_link is not None:
                    return {"linked": False, "labeled": False, "reason": "反馈已关联预测"}
                connection.execute(
                    """
                    INSERT INTO forecast_feedback_links(
                        report_id, forecast_run_id, port_id, linked_at
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (report_id, forecast_run_id, port_id, self._utc_now()),
                )
                provenance_eligible = (
                    bool(report_row["is_real_observation"])
                    and bool(report_row["training_consent"])
                    and report_row["source_type"]
                    in {"crowdsource_observation", "partner", "official"}
                )
                eligible_for_label = eligible_for_label and provenance_eligible
                if not provenance_eligible and ineligibility_reason is None:
                    ineligibility_reason = (
                        "反馈来源或建模同意不符合要求，已保留关联但不作为训练标签"
                    )
                if not eligible_for_label:
                    return {
                        "linked": True,
                        "labeled": False,
                        "reason": ineligibility_reason
                        or "反馈不符合训练条件，已保留关联但不作为训练标签",
                    }
                if run_port["observed_report_id"] is not None:
                    return {
                        "linked": True,
                        "labeled": False,
                        "reason": "该预测已有高质量实际等待标签",
                    }
                connection.execute(
                    """
                    UPDATE forecast_run_ports
                    SET observed_wait_minutes = ?, observed_report_id = ?,
                        observed_at = ?, observed_quality_score = ?,
                        label_status = 'labeled'
                    WHERE forecast_run_id = ? AND port_id = ?
                    """,
                    (
                        actual_wait_minutes,
                        report_id,
                        self._utc_now(),
                        quality_score,
                        forecast_run_id,
                        port_id,
                    ),
                )
                return {"linked": True, "labeled": True, "reason": None}
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_labeled_forecast_rows(self) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT runs.id AS forecast_run_id, runs.generated_at,
                           runs.target_time AS run_target_time, runs.model_version,
                           runs.data_version, ports.port_id, ports.port_name,
                           ports.statistical_wait_minutes,
                           ports.primary_wait_minutes, ports.prediction_engine,
                           ports.scenario_version, ports.shadow_wait_minutes,
                           ports.shadow_status, ports.features_json,
                           ports.observed_wait_minutes, ports.observed_report_id,
                           ports.observed_at, ports.observed_quality_score,
                           reports.direction, reports.channel,
                           reports.is_real_observation, reports.training_consent,
                           reports.source_type, reports.wait_started_at,
                           reports.wait_ended_at
                    FROM forecast_run_ports AS ports
                    JOIN forecast_runs AS runs ON runs.id = ports.forecast_run_id
                    JOIN crowdsource_reports AS reports
                      ON reports.id = ports.observed_report_id
                    WHERE ports.label_status = 'labeled'
                      AND reports.is_real_observation = 1
                      AND reports.training_consent = 1
                      AND reports.source_type IN (
                          'crowdsource_observation', 'partner', 'official'
                      )
                    ORDER BY ports.observed_at ASC, runs.id ASC, ports.port_id ASC
                    """
                ).fetchall()
            return [
                {
                    **dict(row),
                    "features": json.loads(row["features_json"]),
                }
                for row in rows
            ]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_training_label_audit(self) -> dict:
        """Summarize linked feedback without treating Demo data as training truth."""
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT links.report_id, reports.source_type,
                           reports.is_real_observation, reports.training_consent,
                           ports.label_status, ports.observed_report_id
                    FROM forecast_feedback_links AS links
                    JOIN crowdsource_reports AS reports ON reports.id = links.report_id
                    JOIN forecast_run_ports AS ports
                      ON ports.forecast_run_id = links.forecast_run_id
                     AND ports.port_id = links.port_id
                    """
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError() from error

        included = sum(
            1
            for row in rows
            if row["label_status"] == "labeled"
            and row["observed_report_id"] == row["report_id"]
            and row["is_real_observation"]
            and row["training_consent"]
            and row["source_type"] in {
                "crowdsource_observation",
                "partner",
                "official",
            }
        )
        source_counts: dict[str, int] = {}
        for row in rows:
            source_counts[row["source_type"]] = source_counts.get(row["source_type"], 0) + 1
        return {
            "linked_count": len(rows),
            "included_count": included,
            "excluded_count": len(rows) - included,
            "linked_source_counts": source_counts,
        }

    def list_shadow_observations(self, limit: int = 100) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM shadow_model_observations
                    ORDER BY id DESC LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            return [dict(row) for row in rows]
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def get_shadow_observation_summary(self) -> dict:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT generated_at, port_id, port_name, shadow_wait_minutes,
                           difference_minutes, status
                    FROM shadow_model_observations
                    ORDER BY generated_at DESC, id DESC
                    """
                ).fetchall()
        except sqlite3.Error as error:
            raise PersistenceError() from error

        by_port: dict[str, dict] = {}
        for row in rows:
            item = by_port.setdefault(
                row["port_id"],
                {
                    "port_id": row["port_id"],
                    "port_name": row["port_name"],
                    "observation_count": 0,
                    "differences": [],
                },
            )
            item["observation_count"] += 1
            if row["shadow_wait_minutes"] is not None:
                item["differences"].append(float(row["difference_minutes"]))

        ports = []
        for item in sorted(by_port.values(), key=lambda value: value["port_id"]):
            differences = item.pop("differences")
            ports.append(
                {
                    **item,
                    "average_difference_minutes": (
                        round(sum(differences) / len(differences), 2)
                        if differences
                        else None
                    ),
                    "average_absolute_difference_minutes": (
                        round(
                            sum(abs(value) for value in differences) / len(differences),
                            2,
                        )
                        if differences
                        else None
                    ),
                }
            )
        return {
            "total_observations": len(rows),
            "available_observations": sum(
                row["status"] == "available" for row in rows
            ),
            "unavailable_observations": sum(
                row["status"] != "available" for row in rows
            ),
            "latest_observed_at": rows[0]["generated_at"] if rows else None,
            "ports": ports,
        }

    def reset_dynamic_data(self) -> dict:
        try:
            with self._connect() as connection:
                connection.execute("DELETE FROM forecast_feedback_links")
                connection.execute("DELETE FROM forecast_run_ports")
                connection.execute("DELETE FROM forecast_runs")
                connection.execute("DELETE FROM subscription_evaluations")
                connection.execute("DELETE FROM notifications")
                connection.execute("DELETE FROM audit_events")
                connection.execute("DELETE FROM error_events")
                connection.execute("DELETE FROM commercial_transactions")
                connection.execute("DELETE FROM commercial_subscriptions")
                connection.execute("DELETE FROM crowdsource_reports")
                connection.execute("DELETE FROM subscriptions")
                connection.execute("DELETE FROM batch_plans")
                connection.execute("DELETE FROM enterprise_operation_plans")
                connection.execute("DELETE FROM coordination_notices")
                connection.execute("DELETE FROM shadow_model_observations")
                connection.execute("DELETE FROM scenario_overrides")
                self._seed_reports(connection)
                self._seed_subscriptions(connection)
            return {
                "reports": len(self.get_reports()),
                "subscriptions": len(self.list_subscriptions("demo-user")),
                "batch_plans": 0,
                "commercial_subscriptions": 0,
            }
        except sqlite3.Error as error:
            raise PersistenceError() from error
