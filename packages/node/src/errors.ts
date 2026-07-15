export class MythosError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MythosError';
  }
}

export class MythosConfigError extends MythosError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'MythosConfigError';
  }
}

export class InvalidLaunchTokenError extends MythosError {
  constructor(message = 'Invalid launch token') {
    super(message, 'INVALID_LAUNCH_TOKEN');
    this.name = 'InvalidLaunchTokenError';
  }
}

export class InsufficientFundsError extends MythosError {
  constructor() {
    super('Insufficient funds in wallet', 'INSUFFICIENT_FUNDS');
    this.name = 'InsufficientFundsError';
  }
}

export class SessionNotFoundError extends MythosError {
  constructor(jti: string) {
    super(`Session not found: ${jti}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class InvalidUsageError extends MythosError {
  constructor(message: string) {
    super(message, 'INVALID_USAGE');
    this.name = 'InvalidUsageError';
  }
}
