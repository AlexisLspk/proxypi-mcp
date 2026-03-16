import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { HealingRecord, MemoryStore } from "../types.js";
import { logger } from "../utils/logger.js";

// Store in ~/.proxipi/memory.json so it persists across sessions
const STORE_DIR = join(homedir(), ".proxipi");
const STORE_PATH = join(STORE_DIR, "memory.json");

function ensureDir() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function load(): MemoryStore {
  try {
    ensureDir();
    if (!existsSync(STORE_PATH)) return { records: [] };
    const raw = readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as MemoryStore;
  } catch {
    return { records: [] };
  }
}

function save(store: MemoryStore) {
  try {
    ensureDir();
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    logger.warn("Failed to persist memory", err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function recordHealing(record: HealingRecord) {
  const store = load();
  store.records.push(record);
  // Keep last 500 records
  if (store.records.length > 500) {
    store.records = store.records.slice(-500);
  }
  save(store);
  logger.info(`memory saved — ${store.records.length} records total`);
}

export function findSimilarFix(
  apiHost: string,
  errorStatus: number,
  urlPath: string
): HealingRecord | undefined {
  const store = load();
  // Find the most recent successful fix for this host + path + error status
  return store.records
    .filter(
      (r) =>
        r.apiHost === apiHost &&
        r.errorStatus === errorStatus &&
        r.success &&
        extractPathFromUrl(r.originalRequest.url) === urlPath
    )
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

function extractPathFromUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function getHistory(apiHost?: string): HealingRecord[] {
  const store = load();
  if (!apiHost) return store.records.slice(-50);
  return store.records
    .filter((r) => r.apiHost === apiHost)
    .slice(-50);
}

export function clearHistory() {
  save({ records: [] });
}

export function getStorePath(): string {
  return STORE_PATH;
}
