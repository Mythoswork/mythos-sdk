class MythosError(Exception):
    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class MythosConfigError(MythosError):
    def __init__(self, message: str) -> None:
        super().__init__(message, "CONFIG_ERROR")


class InvalidLaunchTokenError(MythosError):
    def __init__(self, message: str = "Invalid launch token") -> None:
        super().__init__(message, "INVALID_LAUNCH_TOKEN")


class InsufficientFundsError(MythosError):
    def __init__(self) -> None:
        super().__init__("Insufficient funds in wallet", "INSUFFICIENT_FUNDS")


class SessionNotFoundError(MythosError):
    def __init__(self, jti: str) -> None:
        super().__init__(f"Session not found: {jti}", "SESSION_NOT_FOUND")


class InvalidUsageError(MythosError):
    def __init__(self, message: str) -> None:
        super().__init__(message, "INVALID_USAGE")
