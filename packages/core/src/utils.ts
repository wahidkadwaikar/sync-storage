import type { JsonValue } from './types.js'

export function nowIso(date: Date = new Date()): string {
  return date.toISOString()
}

export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) {
    return false
  }

  return expiresAt <= now.toISOString()
}

export function serializeJson(value: JsonValue): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new Error('Value is not JSON serializable')
  }

  return serialized
}

export function parseJson<T extends JsonValue = JsonValue>(valueJson: string): T {
  return JSON.parse(valueJson) as T
}

export function etagFromVersion(version: number): string {
  return `"${version}"`
}

export function normalizeIfMatch(ifMatch: string | undefined | null): number | null {
  if (!ifMatch) {
    return null
  }

  const trimmed = ifMatch.trim()
  const withoutQuotes =
    trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed
  const parsed = Number.parseInt(withoutQuotes, 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

export function encodeCursor(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string | null | undefined): string | null {
  if (!cursor) {
    return null
  }

  return Buffer.from(cursor, 'base64url').toString('utf8')
}

export function clampLimit(limit: number | undefined, max: number, fallback: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return fallback
  }

  const sanitized = Math.max(1, Math.trunc(limit))
  return Math.min(sanitized, max)
}
