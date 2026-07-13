from enum import Enum
from typing import Any


class ErrorCode(str, Enum):
    AUTH_REQUIRED = "AUTH_REQUIRED"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    LOCATION_NOT_FOUND = "LOCATION_NOT_FOUND"
    PORT_NOT_FOUND = "PORT_NOT_FOUND"
    DUPLICATE_REPORT = "DUPLICATE_REPORT"
    SUBSCRIPTION_NOT_FOUND = "SUBSCRIPTION_NOT_FOUND"
    SUBSCRIPTION_EVALUATION_NOT_FOUND = "SUBSCRIPTION_EVALUATION_NOT_FOUND"
    NOTIFICATION_NOT_FOUND = "NOTIFICATION_NOT_FOUND"
    PLAN_NOT_FOUND = "PLAN_NOT_FOUND"
    TARGET_TIME_OUT_OF_RANGE = "TARGET_TIME_OUT_OF_RANGE"
    DATABASE_ERROR = "DATABASE_ERROR"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    FORBIDDEN = "FORBIDDEN"


class AppError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status_code: int = 422,
        details: Any = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details if details is not None else {}


class DomainValidationError(AppError):
    def __init__(
        self,
        message: str,
        *,
        code: ErrorCode = ErrorCode.VALIDATION_ERROR,
        details: Any = None,
    ):
        super().__init__(code, message, status_code=422, details=details)


class ResourceNotFoundError(AppError):
    def __init__(self, code: ErrorCode, message: str, *, details: Any = None):
        super().__init__(code, message, status_code=404, details=details)


class ConflictError(AppError):
    def __init__(self, code: ErrorCode, message: str, *, details: Any = None):
        super().__init__(code, message, status_code=409, details=details)


class PersistenceError(AppError):
    def __init__(self, message: str = "数据存储暂时不可用"):
        super().__init__(
            ErrorCode.DATABASE_ERROR,
            message,
            status_code=500,
        )


class PermissionDeniedError(AppError):
    def __init__(self, message: str = "当前 Demo 身份无权执行此操作"):
        super().__init__(ErrorCode.FORBIDDEN, message, status_code=403)


class AuthenticationRequiredError(AppError):
    def __init__(self, message: str = "请先登录本地 Demo 身份"):
        super().__init__(ErrorCode.AUTH_REQUIRED, message, status_code=401)
