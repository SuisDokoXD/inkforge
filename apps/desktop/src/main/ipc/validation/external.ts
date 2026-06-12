import type { ExternalOpenUrlInput } from "@inkforge/shared";
import { asObject, requiredString } from "./core";

function isHttpOrHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseExternalOpenUrlInput(value: unknown): ExternalOpenUrlInput {
  const channel = "external:open-url";
  const obj = asObject(value, channel);
  const url = requiredString(obj, "url", channel);
  if (!isHttpOrHttpsUrl(url)) {
    throw new Error(`${channel}.url must be an http/https URL`);
  }
  return {
    url,
  };
}
