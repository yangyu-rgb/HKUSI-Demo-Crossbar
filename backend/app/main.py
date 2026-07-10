from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import (
    batch_router,
    crowdsource_router,
    demo_router,
    health_router,
    prediction_router,
    realtime_router,
    subscription_router,
)
from .clock import Clock, HongKongClock
from .ml.shadow import ShadowWaitModel
from .config import DATABASE_PATH, DATA_DIR
from .exceptions import AppError, ErrorCode
from .repositories import DemoRepository
from .schemas.common import ErrorResponse


def create_app(
    data_dir: Path = DATA_DIR,
    database_path: Path = DATABASE_PATH,
    clock: Clock | None = None,
) -> FastAPI:
    app = FastAPI(
        title="CrossBorder AI Demo API",
        version="1.2.0",
        responses={
            404: {"model": ErrorResponse, "description": "请求的资源不存在"},
            409: {"model": ErrorResponse, "description": "请求与当前状态冲突"},
            422: {"model": ErrorResponse, "description": "领域规则或请求参数验证失败"},
            500: {"model": ErrorResponse, "description": "内部服务或持久化错误"},
        },
    )
    app.state.clock = clock or HongKongClock()
    app.state.repository = DemoRepository(data_dir, database_path, app.state.clock)
    app.state.shadow_model = ShadowWaitModel.load_optional(
        artifact_path=data_dir / "runtime" / "models" / "wait_model_v1.joblib",
        metadata_path=data_dir / "models" / "wait_model_v1.metadata.json",
        dataset_path=data_dir / "history" / "port_wait_history.csv",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    def error_response(
        request: Request,
        *,
        status_code: int,
        code: str,
        message: str,
        details,
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", uuid4().hex)
        return JSONResponse(
            status_code=status_code,
            content=jsonable_encoder(
                {
                    "error": {
                        "code": code,
                        "message": message,
                        "details": details,
                        "request_id": request_id,
                    }
                }
            ),
            headers={"X-Request-ID": request_id},
        )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, error: AppError) -> JSONResponse:
        return error_response(
            request,
            status_code=error.status_code,
            code=error.code.value,
            message=error.message,
            details=error.details,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        return error_response(
            request,
            status_code=422,
            code=ErrorCode.VALIDATION_ERROR.value,
            message="请求参数无效",
            details=error.errors(),
        )

    @app.exception_handler(HTTPException)
    async def http_error_handler(request: Request, error: HTTPException) -> JSONResponse:
        code = ErrorCode.NOT_FOUND if error.status_code == 404 else ErrorCode.INTERNAL_ERROR
        return error_response(
            request,
            status_code=error.status_code,
            code=code.value,
            message=str(error.detail),
            details={},
        )

    @app.exception_handler(Exception)
    async def unexpected_error_handler(
        request: Request,
        _error: Exception,
    ) -> JSONResponse:
        return error_response(
            request,
            status_code=500,
            code=ErrorCode.INTERNAL_ERROR.value,
            message="服务暂时不可用",
            details={},
        )

    app.include_router(health_router)
    app.include_router(demo_router)
    app.include_router(realtime_router)
    app.include_router(prediction_router)
    app.include_router(crowdsource_router)
    app.include_router(subscription_router)
    app.include_router(batch_router)
    return app


app = create_app()
