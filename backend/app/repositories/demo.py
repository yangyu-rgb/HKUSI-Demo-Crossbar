from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
import json
import sqlite3
import csv

from ..exceptions import PersistenceError
from ..clock import Clock, HongKongClock


SCHEMA_VERSION = 3


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
        self._port_state = load_json(data_dir / "realtime" / "ports_status.json")
        self._locations = load_json(data_dir / "routes" / "locations.json")
        self._transit_matrix = load_json(data_dir / "routes" / "transit_matrix.json")
        self._history_path = data_dir / "history" / "port_wait_history.csv"
        self._history = self._load_history()
        self._weather = load_json(data_dir / "factors" / "weather.json")
        self._holidays = load_json(data_dir / "factors" / "holidays.json")
        self._initialize_database()

    def _utc_now(self) -> str:
        return self._clock.now().astimezone(timezone.utc).isoformat()

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
                is_new_database = connection.execute(
                    "SELECT COUNT(*) FROM schema_version"
                ).fetchone()[0] == 0
                connection.execute(
                    "INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)",
                    (SCHEMA_VERSION, self._utc_now()),
                )
                if is_new_database:
                    report_ids = [
                        item["id"]
                        for item in load_json(
                            self._data_dir / "crowdsource" / "user_reports.json"
                        )
                    ]
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

    def _seed_reports(self, connection: sqlite3.Connection) -> None:
        reports = load_json(self._data_dir / "crowdsource" / "user_reports.json")
        now = self._clock.now().replace(microsecond=0)
        for report in reports:
            effective_at = now - timedelta(minutes=report["age_minutes"])
            connection.execute(
                """
                INSERT INTO crowdsource_reports(
                    id, user_id, port, actual_wait_time, crowd_level,
                    effective_at, time_label, comment, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "port": row["port"],
            "actual_wait_time": row["actual_wait_time"],
            "crowd_level": row["crowd_level"],
            "timestamp": row["effective_at"],
            "time_label": row["time_label"],
            "comment": row["comment"],
            "_created_at": row["created_at"],
        }

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

    def get_port_state(self) -> dict:
        return deepcopy(self._port_state)

    def get_locations(self) -> dict:
        return deepcopy(self._locations)

    def get_weather(self) -> dict:
        return deepcopy(self._weather)

    def get_holidays(self) -> dict:
        return deepcopy(self._holidays)

    def get_history_path(self) -> Path:
        return self._history_path

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

    def get_access_leg(self, origin_id: str, port_id: str) -> dict:
        return deepcopy(self._transit_matrix["access"][origin_id][port_id])

    def get_onward_leg(self, port_id: str, destination_id: str) -> dict:
        return deepcopy(self._transit_matrix["onward"][port_id][destination_id])

    def get_reports(self, limit: int | None = None) -> list[dict]:
        query = "SELECT * FROM crowdsource_reports ORDER BY created_at ASC, id ASC"
        parameters: tuple = ()
        if limit is not None:
            query = """
                SELECT * FROM (
                    SELECT * FROM crowdsource_reports
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
            **report,
            "id": report.get("id", f"report-{uuid4().hex[:12]}"),
            "_created_at": self._utc_now(),
        }
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO crowdsource_reports(
                        id, user_id, port, actual_wait_time, crowd_level,
                        effective_at, time_label, comment, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    def save_batch_plan(self, company: str, service_date: str, request: dict, result: dict) -> str:
        plan_id = f"plan-{uuid4().hex[:12]}"
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO batch_plans(
                        id, company, service_date, request_json, result_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        plan_id,
                        company,
                        service_date,
                        json.dumps(request, ensure_ascii=False),
                        json.dumps(result, ensure_ascii=False),
                        self._utc_now(),
                    ),
                )
            return plan_id
        except sqlite3.Error as error:
            raise PersistenceError() from error

    def list_batch_plans(self, company: str, limit: int) -> list[dict]:
        try:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT * FROM batch_plans
                    WHERE company = ?
                    ORDER BY created_at DESC LIMIT ?
                    """,
                    (company, limit),
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

    def reset_dynamic_data(self) -> dict:
        try:
            with self._connect() as connection:
                connection.execute("DELETE FROM crowdsource_reports")
                connection.execute("DELETE FROM subscriptions")
                connection.execute("DELETE FROM batch_plans")
                connection.execute("DELETE FROM shadow_model_observations")
                self._seed_reports(connection)
                self._seed_subscriptions(connection)
            return {
                "reports": len(self.get_reports()),
                "subscriptions": len(self.list_subscriptions("demo-user")),
                "batch_plans": 0,
            }
        except sqlite3.Error as error:
            raise PersistenceError() from error
