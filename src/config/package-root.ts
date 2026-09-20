import path from "node:path";
import { fileURLToPath } from "node:url";

export function packageRootFromImportMeta(importMetaUrl: string): string {
  const file = fileURLToPath(importMetaUrl);
  const parts = file.split(path.sep);
  const markerIndex = parts.lastIndexOf("dist") >= 0 ? parts.lastIndexOf("dist") : parts.lastIndexOf("src");
  if (markerIndex < 0) {
    throw new Error(`Cannot resolve package root from ${file}`);
  }
  return parts.slice(0, markerIndex).join(path.sep) || path.sep;
}

export function packageRoot(): string {
  return packageRootFromImportMeta(import.meta.url);
}
