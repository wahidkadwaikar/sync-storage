export class SyncStorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ValidationError extends SyncStorageError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
  }
}

export class UnauthorizedError extends SyncStorageError {
  constructor(message: string) {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class NotFoundError extends SyncStorageError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND')
  }
}

export class PreconditionFailedError extends SyncStorageError {
  constructor(message: string) {
    super(message, 412, 'PRECONDITION_FAILED')
  }
}

export class InternalError extends SyncStorageError {
  constructor(message: string) {
    super(message, 500, 'INTERNAL_ERROR')
  }
}
