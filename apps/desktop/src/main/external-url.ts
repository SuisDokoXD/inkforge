import { shell } from "electron";

export function isHttpOrHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function openExternalHttpUrl(url: string): Promise<boolean> {
  if (!isHttpOrHttpsUrl(url)) return false;
  await shell.openExternal(url);
  return true;
}
