export function stringOrNull(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!obj) return null;
  for (const key of keys) {
    if (!(key in obj) || obj[key] == null) continue;
    const value = String(obj[key]).trim();
    if (value.length > 0 && value !== 'null') return value;
  }
  return null;
}

export function unwrap(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(unwrap);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = unwrap(v);
    }
    return result;
  }
  return value;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') return tryParseObject(value);
  return null;
}

export function tryParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function compactJson(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

export function parseTimestamp(raw: unknown): Date | null {
  if (typeof raw === 'number') {
    const n = raw;
    return new Date(n > 9_999_999_999 ? n : n * 1000);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const asNum = Number(trimmed);
    if (!Number.isNaN(asNum) && trimmed !== '') {
      return new Date(asNum > 9_999_999_999 ? asNum : asNum * 1000);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return null;
}
