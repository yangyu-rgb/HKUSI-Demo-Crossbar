"""Small adapter contracts that keep the classroom Demo replaceable.

The project deliberately ships only local implementations.  These protocols
document the seams a reviewed data source or persistence adapter must satisfy
without introducing production infrastructure into the Demo runtime.
"""

from typing import Any, Protocol


class DataProvider(Protocol):
    def get(self) -> dict | list: ...

    def status(self) -> dict: ...

    def version(self) -> str: ...


class PredictionRepository(Protocol):
    def get_port_state(self) -> dict: ...

    def get_history(self, port_name: str) -> list[dict]: ...

    def get_events(self) -> dict: ...

    def get_reports(self) -> list[dict]: ...

    def get_prediction_input_context(self, target_time: Any) -> dict: ...


class OperationsRepository(Protocol):
    def get_operations_summary(self, window_hours: int, current_time: Any) -> dict: ...

