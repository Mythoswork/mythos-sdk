export class MythosError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus = 500,
  ) {
    super(message);
    this.name = 'MythosError';
  }
}

export class MythosConfigError extends MythosError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 500);
    this.name = 'MythosConfigError';
  }
}

export class InvalidLaunchTokenError extends MythosError {
  constructor(message = 'Invalid launch token') {
    super(message, 'INVALID_LAUNCH_TOKEN', 401);
    this.name = 'InvalidLaunchTokenError';
  }
}

export class InsufficientFundsError extends MythosError {
  constructor() {
    super('Insufficient funds in wallet', 'INSUFFICIENT_FUNDS', 402);
    this.name = 'InsufficientFundsError';
  }
}

export class SessionNotFoundError extends MythosError {
  constructor(jti: string) {
    super(`Session not found: ${jti}`, 'SESSION_NOT_FOUND', 404);
    this.name = 'SessionNotFoundError';
  }
}

export class InvalidUsageError extends MythosError {
  constructor(message: string) {
    super(message, 'INVALID_USAGE', 400);
    this.name = 'InvalidUsageError';
  }
}

export class SessionRequiredError extends MythosError {
  constructor(message = 'No Mythos session on this request') {
    super(message, 'SESSION_REQUIRED', 401);
    this.name = 'SessionRequiredError';
  }
}

export class SessionExpiredError extends MythosError {
  constructor(message = 'Mythos session expired — relaunch the app from Mythos') {
    super(message, 'SESSION_EXPIRED', 401);
    this.name = 'SessionExpiredError';
  }
}

export class LaunchTokenConsumedError extends MythosError {
  constructor() {
    super('Launch token already consumed', 'TOKEN_ALREADY_CONSUMED', 401);
    this.name = 'LaunchTokenConsumedError';
  }
}

export class MythosUpstreamError extends MythosError {
  constructor(
    message: string,
    public readonly upstreamStatus: number,
    public readonly upstreamCode?: string,
  ) {
    super(message, 'UPSTREAM_ERROR', 502);
    this.name = 'MythosUpstreamError';
  }
}

export class MythosUnreachableError extends MythosError {
  constructor(message: string) {
    super(message, 'MYTHOS_UNREACHABLE', 503);
    this.name = 'MythosUnreachableError';
  }
}
