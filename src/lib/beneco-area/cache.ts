import { createHash } from "node:crypto";
import type { AreaResolution, AreaTask } from "./types/internal.ts";

export function fingerprintText(text: string): string {
  return createHash("sha256").update(normalizeAreaText(text)).digest("hex");
}

function normalizeAreaText(text: string): string {
  return text.trim().replace(/\r\n?/g, "\n");
}

export interface CachedResolution {
  outageId: number;
  kind: AreaTask["kind"];
  fingerprint: string;
  resolution: AreaResolution;
  updatedAt: number;
}

export interface AreaResolutionCache {
  get(outageId: number): CachedResolution | undefined;
  set(entry: CachedResolution): void;
  delete(outageId: number): void;
  keys(): Iterable<number>;
}

export function pruneCache(
  cache: AreaResolutionCache,
  liveOutageIds: ReadonlySet<number>,
): void {
  for (const id of cache.keys()) {
    if (!liveOutageIds.has(id)) cache.delete(id);
  }
}

export class InMemoryAreaResolutionCache implements AreaResolutionCache {
  private readonly store = new Map<number, CachedResolution>();

  get(outageId: number): CachedResolution | undefined {
    return this.store.get(outageId);
  }

  set(entry: CachedResolution): void {
    this.store.set(entry.outageId, entry);
  }

  delete(outageId: number): void {
    this.store.delete(outageId);
  }

  keys(): Iterable<number> {
    return this.store.keys();
  }
}
