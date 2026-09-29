class MythosError(Exception):
    def __init__(self, message: str, code: str, http_status: int = 500) -> None:
        super().__init__(message)
        self.code = code
        self.http_status = http_status


class MythosConfigError(MythosError):
    def __init__(self, message: str) -> None:
        super().__init__(message, "CONFIG_ERROR", 500)


class InvalidLaunchTokenError(MythosError):
    def __init__(self, message: str = "Invalid launch token") -> None:
        super().__init__(message, "INVALID_LAUNCH_TOKEN", 401)


class InsufficientFundsError(MythosError):
    def __init__(self) -> None:
        super().__init__("Insufficient funds in wallet", "INSUFFICIENT_FUNDS", 402)


class SessionNotFoundError(MythosError):
    def __init__(self, jti: str) -> None:
        super().__init__(f"Session not found: {jti}", "SESSION_NOT_FOUND", 404)


class InvalidUsageError(MythosError):
    def __init__(self, message: str) -> None:
        super().__init__(message, "INVALID_USAGE", 400)


class SessionRequiredError(MythosError):
    def __init__(self, message: str = "No Mythos session on this request") -> None:
        super().__init__(message, "SESSION_REQUIRED", 401)


class SessionExpiredError(MythosError):
    def __init__(self, message: str = "Mythos session expired — relaunch the app from Mythos") -> None:
        super().__init__(message, "SESSION_EXPIRED", 401)


class LaunchTokenConsumedError(MythosError):
    def __init__(self) -> None:
        super().__init__("Launch token already consumed", "TOKEN_ALREADY_CONSUMED", 401)


class MythosUpstreamError(MythosError):
    def __init__(self, message: str, upstream_status: int, upstream_code: str | None = None) -> None:
        super().__init__(message, "UPSTREAM_ERROR", 502)
        self.upstream_status = upstream_status
        self.upstream_code = upstream_code


class MythosUnreachableError(MythosError):
    def __init__(self, message: str) -> None:
        super().__init__(message, "MYTHOS_UNREACHABLE", 503)
