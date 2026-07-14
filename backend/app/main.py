from pathlib import Path
from uuid import uuid4
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import (
    batch_router,
    crowdsource_router,
    commercial_router,
    demo_router,
    enterprise_operations_router,
    health_router,
    prediction_router,
    realtime_router,
    subscription_router,
    scenario_router,
)
from .clock import Clock, HongKongClock
from .ml.shadow import ShadowWaitModel
from .ml.scenario_model import ScenarioWaitModel
from .config import DATABASE_PATH, DATA_DIR
from .exceptions import AppError, ErrorCode
from .repositories import DemoRepository
from .schemas.common import ErrorResponse


logger = logging.getLogger("crossborder.error")


def create_app(
    data_dir: Path = DATA_DIR,
    database_path: Path = DATABASE_PATH,
    clock: Clock | None = None,
) -> FastAPI:
    app = FastAPI(
        title="CrossBorder AI Demo API",
        version="1.3.0",
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
    app.state.scenario_model = ScenarioWaitModel.load_optional()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Demo-Persona-ID"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        request.state.request_id = request_id
        persona_header = request.headers.get("X-Demo-Persona-ID")
        persona = app.state.repository.get_persona(persona_header)
        if persona is None:
            return error_response(
                request,
                status_code=422,
                code=ErrorCode.VALIDATION_ERROR.value,
                message="未知 Demo 身份",
                details={"persona_id": persona_header},
            )
        request.state.demo_persona = {
            **persona,
            "explicit": persona_header is not None,
        }
        response = await call_next(request)
        read_only_posts = {"/api/demo/scenarios/compare"}
        if (
            request.method in {"POST", "PUT", "PATCH", "DELETE"}
            and request.url.path not in read_only_posts
        ):
            app.state.repository.record_audit_event(
                {
                    "request_id": request_id,
                    "persona_id": persona["id"],
                    "organization_id": persona["organization_id"],
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                }
            )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Demo-Persona-ID"] = persona["id"]
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

    def error_response(
        request: Request,
        *,
        status_code: int,
        code: str,
        message: str,
        details,
        category: str | None = None,
        retryable: bool | None = None,
        user_action: str | None = None,
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", uuid4().hex)
        resolved_category = category or (
            "authentication" if status_code == 401
            else "validation" if status_code == 422
            else "permission" if status_code == 403
            else "not_found" if status_code == 404
            else "conflict" if status_code == 409
            else "dependency" if code == ErrorCode.DATABASE_ERROR.value
            else "internal"
        )
        resolved_retryable = retryable if retryable is not None else status_code >= 500
        if user_action is None:
            user_action = (
                "请先登录本地 Demo 身份" if status_code == 401
                else "请检查输入后重试" if status_code == 422
                else "请切换到有权限的 Demo 身份" if status_code == 403
                else "请稍后重试" if resolved_retryable
                else None
            )
        app.state.repository.record_error_event({
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": status_code,
            "error_code": code,
            "category": resolved_category,
        })
        return JSONResponse(
            status_code=status_code,
            content=jsonable_encoder(
                {
                    "error": {
                        "code": code,
                        "message": message,
                        "details": details,
                        "request_id": request_id,
                        "category": resolved_category,
                        "retryable": resolved_retryable,
                        "user_action": user_action,
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
        error: Exception,
    ) -> JSONResponse:
        logger.exception(
            "Unhandled request error request_id=%s method=%s path=%s",
            getattr(request.state, "request_id", "unknown"),
            request.method,
            request.url.path,
            exc_info=error,
        )
        return error_response(
            request,
            status_code=500,
            code=ErrorCode.INTERNAL_ERROR.value,
            message="服务暂时不可用",
            details={},
        )

    app.include_router(health_router)
    app.include_router(demo_router)
    app.include_router(scenario_router)
    app.include_router(realtime_router)
    app.include_router(prediction_router)
    app.include_router(crowdsource_router)
    app.include_router(commercial_router)
    app.include_router(subscription_router)
    app.include_router(batch_router)
    app.include_router(enterprise_operations_router)
    return app


app = create_app()
