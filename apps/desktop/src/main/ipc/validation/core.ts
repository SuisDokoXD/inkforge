export type UnknownRecord = Record<string, unknown>;

export function fail(channel: string, field: string, expected: string): never {
  throw new Error(`Invalid IPC payload for ${channel}: ${field} must be ${expected}`);
}

export function asObject(value: unknown, channel: string): UnknownRecord {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    fail(channel, "payload", "an object");
  }
  return value as UnknownRecord;
}

export function optionalString(
  obj: UnknownRecord,
  key: string,
  channel: string,
): string | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(channel, key, "a string");
  return value;
}

export function optionalNullableString(
  obj: UnknownRecord,
  key: string,
  channel: string,
): string | null | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") fail(channel, key, "a string or null");
  return value;
}

export function requiredString(obj: UnknownRecord, key: string, channel: string): string {
  const value = optionalString(obj, key, channel);
  if (value === undefined) fail(channel, key, "a string");
  return value;
}

export function requiredNonEmptyString(
  obj: UnknownRecord,
  key: string,
  channel: string,
): string {
  const value = requiredString(obj, key, channel);
  if (value.length === 0) fail(channel, key, "a non-empty string");
  return value;
}

export function optionalNumber(
  obj: UnknownRecord,
  key: string,
  channel: string,
): number | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(channel, key, "a finite number");
  }
  return value;
}

export function requiredNumber(obj: UnknownRecord, key: string, channel: string): number {
  const value = optionalNumber(obj, key, channel);
  if (value === undefined) fail(channel, key, "a finite number");
  return value;
}

export function optionalBoolean(
  obj: UnknownRecord,
  key: string,
  channel: string,
): boolean | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") fail(channel, key, "a boolean");
  return value;
}

export function requiredBoolean(obj: UnknownRecord, key: string, channel: string): boolean {
  const value = optionalBoolean(obj, key, channel);
  if (value === undefined) fail(channel, key, "a boolean");
  return value;
}

export function optionalStringArray(
  obj: UnknownRecord,
  key: string,
  channel: string,
): string[] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, key, "an array of strings");
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      fail(channel, `${key}[${index}]`, "a non-empty string");
    }
    return item;
  });
}

export function requiredStringArray(
  obj: UnknownRecord,
  key: string,
  channel: string,
): string[] {
  const value = optionalStringArray(obj, key, channel);
  if (value === undefined) fail(channel, key, "an array of strings");
  return value;
}

export function optionalEnum<T extends string>(
  obj: UnknownRecord,
  key: string,
  channel: string,
  allowed: readonly T[],
): T | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(channel, key, `one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function requiredEnum<T extends string>(
  obj: UnknownRecord,
  key: string,
  channel: string,
  allowed: readonly T[],
): T {
  const value = optionalEnum(obj, key, channel, allowed);
  if (value === undefined) fail(channel, key, `one of ${allowed.join(", ")}`);
  return value;
}

export function optionalEnumArray<T extends string>(
  obj: UnknownRecord,
  key: string,
  channel: string,
  allowed: readonly T[],
): T[] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, key, "an array");
  return value.map((item, index) => {
    if (typeof item !== "string" || !(allowed as readonly string[]).includes(item)) {
      fail(channel, `${key}[${index}]`, `one of ${allowed.join(", ")}`);
    }
    return item as T;
  });
}

export function optionalRecordOfStrings(
  obj: UnknownRecord,
  key: string,
  channel: string,
): Record<string, string> | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(channel, key, "an object with string values");
  }
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value as UnknownRecord)) {
    if (typeof entryValue !== "string") {
      fail(channel, `${key}.${entryKey}`, "a string");
    }
    result[entryKey] = entryValue;
  }
  return result;
}

export function optionalFilters(
  obj: UnknownRecord,
  channel: string,
): Array<{ name: string; extensions: string[] }> | undefined {
  const value = obj.filters;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, "filters", "an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(channel, `filters[${index}]`, "an object");
    }
    const filter = item as UnknownRecord;
    const name = requiredNonEmptyString(filter, "name", channel);
    const extensions = filter.extensions;
    if (!Array.isArray(extensions)) {
      fail(channel, `filters[${index}].extensions`, "an array of strings");
    }
    return {
      name,
      extensions: extensions.map((extension, extIndex) => {
        if (typeof extension !== "string" || extension.length === 0) {
          fail(channel, `filters[${index}].extensions[${extIndex}]`, "a non-empty string");
        }
        return extension;
      }),
    };
  });
}
