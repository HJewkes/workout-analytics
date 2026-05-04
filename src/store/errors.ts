/**
 * Error classes for the storage layer.
 *
 * Three classes — no `NotFoundError` (D16, AC-15). Missing rows resolve to
 * `undefined`/empty arrays from the read APIs, which is part of the interface
 * contract.
 *
 * Each constructor accepts the standard Node 16+ `{ cause }` options bag so
 * callers can wrap underlying SQLite/zod errors without losing the chain.
 */

export class StoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StoreError';
  }
}

export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ValidationError';
  }
}
