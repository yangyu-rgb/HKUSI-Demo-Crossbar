from .batch import router as batch_router
from .crowdsource import router as crowdsource_router
from .commercial import router as commercial_router
from .demo import router as demo_router
from .enterprise_operations import router as enterprise_operations_router
from .health import router as health_router
from .prediction import router as prediction_router
from .realtime import router as realtime_router
from .subscription import router as subscription_router
from .scenario import router as scenario_router

__all__ = [
    "batch_router",
    "crowdsource_router",
    "commercial_router",
    "demo_router",
    "enterprise_operations_router",
    "health_router",
    "prediction_router",
    "realtime_router",
    "subscription_router",
    "scenario_router",
]
