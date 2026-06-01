#!/usr/bin/env node
import dns from "node:dns/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DAYCLAW_ITEMS_BASE_URL = "https://api.dayclaw.com/api/source/public/x";
export const DEFAULT_TARGET_X_HANDLE = "thsottiaux";
export const DEFAULT_STATE_FILE_PATH = "var/state.json";
export const NETWORK_FAILURE_KEY = "dayclaw_network";

export class DayclawTransientError extends Error {
  constructor({ operation, url, attempts, cause }) {
    super(String(cause?.message || cause || "Dayclaw transient network error"));
    this.name = "DayclawTransientError";
    this.operation = operation;
    this.url = url;
    this.attempts = attempts;
    this.cause = cause;
    this.rootCause = networkRootCause(cause);
  }

  toSummary() {
    return { type: this.cause?.name || "Error", operation: this.operation, url: this.url, attempts: this.attempts, root_cause: this.rootCause, detail: sanitizeException(this.cause) };
  }
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function stripEnvQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadEnvFileIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (String(process.env[key] || "").trim()) continue;
    process.env[key] = stripEnvQuotes(line.slice(equalsIndex + 1));
  }
}

export function loadRuntimeEnvironment(root = repoRoot()) {
  loadEnvFileIfPresent(path.join(root, ".env"));
  loadEnvFileIfPresent(path.join(root, "env"));
  loadEnvFileIfPresent(path.join(process.cwd(), ".env"));
}

export function envBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

export function envInt(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number.parseInt(value.trim(), 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer, got ${JSON.stringify(value)}`);
  return parsed;
}

export function expandHome(value) {
  if (!value) return value;
  const text = String(value);
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function normalizeStatePath(value) {
  const expanded = expandHome(value || DEFAULT_STATE_FILE_PATH);
  return path.isAbsolute(expanded) ? expanded : path.resolve(repoRoot(), expanded);
}

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function reportTimezone(value = process.env.REPORT_TIMEZONE) {
  const system = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", timezone = String(value || system).trim() || system;
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0)); return timezone; } catch { return system; }
}
export function parseSourceTimestamp(value) {
  const text = String(value || "").trim(), date = text && new Date(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
function timestampFields(value) {
  const timezone = reportTimezone(), date = parseSourceTimestamp(value), local = date && new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date).replace(" ", "T");
  return { created_at: value, created_at_utc: date?.toISOString() || null, created_at_local: local || null, local_timezone: timezone, source_timezone_assumption: "UTC when no offset is present" };
}

export class DedupeStore {
  constructor(filePath = process.env.STATE_FILE_PATH || DEFAULT_STATE_FILE_PATH) {
    this.requestedPath = filePath;
    this.path = normalizeStatePath(filePath);
    const defaultFallback = normalizeStatePath(DEFAULT_STATE_FILE_PATH);
    this.fallbackPath = this.path === defaultFallback ? path.join(os.tmpdir(), "codex-reset-watchdog-state.json") : defaultFallback;
    this.fallbackUsed = false;
    this.warnings = [];
  }

  emptyState() {
    return { seen_tweets: {}, reported_events: {}, operational_failures: {} };
  }

  load() {
    try {
      return this.readStateAt(this.path);
    } catch (error) {
      if (!this.canFallback(error)) throw error;
      this.activateFallback(error);
      return this.readStateAt(this.path);
    }
  }

  save(state) {
    try {
      this.writeStateAt(this.path, state);
    } catch (error) {
      if (!this.canFallback(error)) throw error;
      this.activateFallback(error);
      this.writeStateAt(this.path, state);
    }
  }

  readStateAt(filePath) {
    if (!fs.existsSync(filePath)) return this.emptyState();
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return this.emptyState();
    const seen = Array.isArray(raw.seen_tweets)
      ? Object.fromEntries(raw.seen_tweets.map((tweetId) => [String(tweetId), 0]))
      : objectOrEmpty(raw.seen_tweets);
    return {
      seen_tweets: seen,
      reported_events: objectOrEmpty(raw.reported_events),
      operational_failures: objectOrEmpty(raw.operational_failures),
    };
  }

  writeStateAt(filePath, state) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
    try {
      fs.writeFileSync(tempPath, `${prettyJson(state)}\n`, "utf8");
      fs.renameSync(tempPath, filePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  canFallback(error) {
    return this.path !== this.fallbackPath && ["EACCES", "EEXIST", "ENOENT", "ENOTDIR", "EPERM", "EROFS"].includes(error?.code);
  }

  activateFallback(error) {
    this.fallbackUsed = true;
    this.warnings.push(
      `State path ${this.path} is not writable/readable (${error.code}); using ${this.fallbackPath} instead.`,
    );
    this.path = this.fallbackPath;
  }

  info() {
    return {
      path: this.path,
      requested_path: String(this.requestedPath),
      fallback_used: this.fallbackUsed,
      warnings: this.warnings,
    };
  }

  count() {
    return Object.keys(this.load().seen_tweets).length;
  }

  isSeen(tweetId) {
    return Object.hasOwn(this.load().seen_tweets, String(tweetId));
  }

  markSeen(tweetId) {
    const state = this.load();
    state.seen_tweets[String(tweetId)] ??= Math.floor(Date.now() / 1000);
    this.save(state);
  }

  markManySeen(tweetIds) {
    const state = this.load();
    const now = Math.floor(Date.now() / 1000);
    for (const tweetId of tweetIds) state.seen_tweets[String(tweetId)] ??= now;
    this.save(state);
  }

  recordOperationalFailure(key, detail) {
    const state = this.load();
    const now = Math.floor(Date.now() / 1000);
    const prior = objectOrEmpty(state.operational_failures[key]);
    const record = {
      count: Number(prior.count || 0) + 1,
      first_failed_at: Number(prior.first_failed_at || now),
      last_failed_at: now,
      detail,
    };
    state.operational_failures[key] = record;
    this.save(state);
    return record;
  }

  clearOperationalFailure(key) {
    const state = this.load();
    if (!Object.hasOwn(state.operational_failures, key)) return;
    delete state.operational_failures[key];
    this.save(state);
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeException(error) {
  const detail = String(error?.message || error || "").replace(/\s+/g, " ").trim();
  return detail.length > 500 ? `${detail.slice(0, 500).trim()}...` : detail;
}

function errorChainText(error) {
  const parts = [];
  const seen = new Set();
  let current = error;
  for (let depth = 0; current && depth < 4 && !seen.has(current); depth += 1) {
    seen.add(current);
    for (const key of ["name", "code", "errno", "syscall", "hostname", "message"]) {
      if (current[key]) parts.push(String(current[key]));
    }
    current = current.cause;
  }
  return parts.join(" ").toLowerCase();
}

function networkRootCause(error) {
  const detail = errorChainText(error);
  const dnsMarkers = ["nameresolutionerror", "nodename nor servname", "temporary failure in name resolution", "name or service not known", "getaddrinfo", "enotfound"];
  if (dnsMarkers.some((marker) => detail.includes(marker))) return "dns_resolution_failure";
  if (error?.name === "AbortError" || detail.includes("timeout") || detail.includes("etimedout")) return "timeout";
  if (detail.includes("econnrefused") || detail.includes("connection refused")) return "connection_refused";
  if (detail.includes("econnreset") || detail.includes("socket hang up")) return "connection_reset";
  if (detail.includes("eacces") || detail.includes("eperm") || detail.includes("permission denied")) return "network_permission_denied";
  if (detail.includes("certificate") || detail.includes("tls") || detail.includes("ssl")) return "tls_error";
  return "connection_error";
}

function retryDelayMs(attempt) {
  const base = Math.max(envInt("DAYCLAW_RETRY_SLEEP_SECONDS", 5), 0);
  const cap = Math.max(envInt("DAYCLAW_RETRY_MAX_SLEEP_SECONDS", 30), 0);
  if (base === 0 || cap === 0) return 0;
  return Math.min(cap, base * 2 ** Math.max(attempt - 1, 0)) * 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildDayclawItemsUrl({ handle, sourceUrl, baseUrl = DAYCLAW_ITEMS_BASE_URL }) {
  if (sourceUrl) return new URL(sourceUrl).href;
  const cleanHandle = String(handle || DEFAULT_TARGET_X_HANDLE).replace(/^@/, "");
  return new URL(`${encodeURIComponent(cleanHandle)}/items`, `${baseUrl.replace(/\/+$/, "")}/`).href;
}

async function fetchJsonOnce(url, timeoutSeconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    let payload = null;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      throw new Error(`Dayclaw returned non-JSON response with status ${response.status}`);
    }
    if (!response.ok) {
      const message = payload?.message || payload?.error || payload?.detail || response.statusText || "HTTP error";
      const error = new Error(`Dayclaw HTTP ${response.status}: ${message}`);
      error.status = response.status;
      throw error;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Dayclaw response is not a JSON object");
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJsonWithRetries(url, { timeout = 20, operation = "source_items" } = {}) {
  const attempts = Math.max(envInt("DAYCLAW_RETRY_ATTEMPTS", 3), 1);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJsonOnce(url, timeout);
    } catch (error) {
      lastError = error;
      const retryableStatus = [429, 500, 502, 503, 504].includes(Number(error.status || 0));
      const retryable = retryableStatus || isTransientNetworkError(error);
      if (!retryable || attempt >= attempts) break;
      const delay = retryDelayMs(attempt);
      if (delay) await sleep(delay);
    }
  }

  if (isTransientNetworkError(lastError)) {
    throw new DayclawTransientError({ operation, url, attempts, cause: lastError });
  }
  throw lastError;
}

export async function diagnoseNetwork({ sourceUrl, timeout = 10 }) {
  const url = new URL(sourceUrl);
  const diagnostic = {
    host: url.hostname,
    endpoint: url.href,
    dns: { ok: false },
    http: { reached: false },
    network_ok: false,
  };

  try {
    const lookup = await dns.lookup(url.hostname);
    diagnostic.dns = { ok: true, address: lookup.address, family: lookup.family };
  } catch (error) {
    diagnostic.dns = {
      ok: false,
      error_type: error?.name || "Error",
      root_cause: networkRootCause(error),
      detail: sanitizeException(error),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    diagnostic.http = {
      reached: true,
      status: response.status,
      status_text: response.statusText,
      ok: response.ok,
      elapsed_ms: Date.now() - started,
    };
  } catch (error) {
    diagnostic.http = {
      reached: false,
      error_type: error?.name || "Error",
      root_cause: networkRootCause(error),
      detail: sanitizeException(error),
      elapsed_ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }

  diagnostic.network_ok = Boolean(diagnostic.dns.ok && diagnostic.http.reached);
  diagnostic.hint = diagnostic.network_ok
    ? "Network reaches the Dayclaw public source. If the main check still fails, inspect HTTP status, source URL, and api_pages."
    : "This environment cannot reach api.dayclaw.com. In Codex, use the project codex-reset-watchdog-net permission profile or otherwise allow outbound HTTPS to this host; full filesystem access is not required.";
  return diagnostic;
}

function isTransientNetworkError(error) {
  if (!error || error.status) return false;
  return error.name === "AbortError" || error instanceof TypeError || String(error.message || "").includes("fetch failed");
}

function firstArrayAt(payload, paths) {
  for (const pathParts of paths) {
    let current = payload;
    for (const part of pathParts) current = current?.[part];
    if (Array.isArray(current)) return current;
  }
  return [];
}

export function itemsFromPayload(payload) {
  return firstArrayAt(payload, [
    ["items"],
    ["data", "items"],
    ["result", "items"],
  ]);
}

export function normalizeSourceItem(raw) {
  const metadata = objectOrEmpty(raw?.metadata);
  const id = String(raw?.external_id || raw?.id || "").trim();
  const text = String(raw?.content ?? raw?.title ?? "").trim();
  if (!id || !text) return null;
  return {
    id,
    text,
    author_username: metadata.author_user_name || raw.author || null,
    author_name: metadata.raw_author_name || null,
    url: raw.url || (raw.author ? `https://x.com/${raw.author}/status/${id}` : null),
    created_at: raw.published_at || null,
    raw,
    context_text: "",
    context_tweets: [],
  };
}

export function extractItems(payload) {
  return itemsFromPayload(payload)
    .filter((item) => item && typeof item === "object")
    .map(normalizeSourceItem)
    .filter(Boolean);
}

function payloadStatus(payload) {
  if (Array.isArray(payload?.items)) return "ok";
  return payload.status ?? payload.data?.status ?? payload.result?.status ?? null;
}

function payloadMessage(payload) {
  return payload.message ?? payload.data?.message ?? payload.result?.message ?? null;
}

function apiPageSummary(payload, itemCount, sourceUrl) {
  return {
    source: "dayclaw_public_items",
    endpoint: sourceUrl,
    status: payloadStatus(payload),
    message: payloadMessage(payload),
    item_count: itemCount,
    limit: payload.limit ?? null,
    response_keys: Object.keys(payload).sort(),
    source_name: payload.source?.name || null,
    source_url: payload.source?.source_url || null,
  };
}

export async function fetchSourceItems({ sourceUrl, timeout = 20 }) {
  const payload = await getJsonWithRetries(sourceUrl, { timeout, operation: "source_items" });
  const items = itemsFromPayload(payload);
  return { payload, rawItems: items, apiPages: [apiPageSummary(payload, items.length, sourceUrl)] };
}

function tweetIdAsBigInt(tweetId) {
  try {
    return tweetId ? BigInt(String(tweetId)) : null;
  } catch {
    return null;
  }
}

export function tweetSortKeyCompare(left, right) {
  const leftTime = Date.parse(left?.created_at || left?.raw?.published_at || "");
  const rightTime = Date.parse(right?.created_at || right?.raw?.published_at || "");
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  const leftInt = tweetIdAsBigInt(left?.id);
  const rightInt = tweetIdAsBigInt(right?.id);
  if (leftInt !== null && rightInt !== null) return leftInt < rightInt ? -1 : leftInt > rightInt ? 1 : 0;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function isReplyLike(raw) {
  const metadata = objectOrEmpty(raw?.metadata);
  if (typeof metadata.is_reply === "boolean") return metadata.is_reply;
  if (typeof raw?.isReply === "boolean") return raw.isReply;
  return Boolean(raw?.inReplyToId || raw?.in_reply_to_status_id);
}

export function buildTweetUrl(tweet) {
  if (tweet.url) return tweet.url;
  if (tweet.author_username && tweet.id) return `https://x.com/${tweet.author_username}/status/${tweet.id}`;
  if (tweet.id) return `https://x.com/i/web/status/${tweet.id}`;
  return null;
}

export function eventKeyForTweet(tweet) {
  const raw = tweet.raw || {};
  return String(raw.conversationId || raw.conversation_id || raw.inReplyToId || raw.in_reply_to_status_id || tweet.id);
}

export function buildReviewItem(tweet) {
  const raw = tweet.raw || {};
  return {
    tweet_id: tweet.id,
    event_key: eventKeyForTweet(tweet),
    url: buildTweetUrl(tweet),
    ...timestampFields(tweet.created_at),
    author: tweet.author_username,
    author_name: tweet.author_name,
    is_reply: isReplyLike(raw),
    in_reply_to_id: raw.inReplyToId || raw.in_reply_to_status_id || null,
    in_reply_to_username: raw.inReplyToUsername || null,
    text: tweet.text,
    reply_context: tweet.context_text || "",
    context_status: isReplyLike(raw) ? "not_available_in_public_feed" : "not_reply",
    context_items: 0,
  };
}

export function buildFetchedItem(tweet) {
  const raw = tweet.raw || {};
  return { tweet_id: tweet.id, url: buildTweetUrl(tweet), ...timestampFields(tweet.created_at), author: tweet.author_username, is_reply: isReplyLike(raw), text: tweet.text };
}

export async function processCandidates(candidates, { store, args }) {
  const results = [];
  const reviewItems = [];

  for (const tweet of candidates) {
    if (store.isSeen(tweet.id)) {
      results.push({ tweet_id: tweet.id, status: "already_seen" });
      continue;
    }
    if (!args.includeReplies && isReplyLike(tweet.raw)) {
      results.push({ tweet_id: tweet.id, status: "ignored_reply", is_reply: true });
      continue;
    }

    const item = buildReviewItem(tweet);
    if (!args.dryRun) store.markSeen(tweet.id);
    reviewItems.push(item);
    results.push({
      tweet_id: tweet.id,
      status: "queued_for_llm",
      event_key: item.event_key,
      url: item.url,
      is_reply: item.is_reply,
      context_status: item.context_status,
      context_items: item.context_items,
    });
  }

  return { results, reviewItems, contextFetches: 0 };
}

function parseBoolArg(value) {
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Expected boolean, got ${JSON.stringify(value)}`);
}

function takeArg(argv, index) {
  const value = argv[index];
  const equalsIndex = value.indexOf("=");
  if (equalsIndex !== -1) return [value.slice(0, equalsIndex), value.slice(equalsIndex + 1), index];
  return [value, argv[index + 1], index + 1];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { handle: String(process.env.TARGET_X_HANDLE || DEFAULT_TARGET_X_HANDLE).trim().replace(/^@/, ""), sourceUrl: String(process.env.DAYCLAW_SOURCE_ITEMS_URL || process.env.SOURCE_ITEMS_URL || "").trim(), includeReplies: envBool("INCLUDE_REPLIES", true), alertOnFirstRun: envBool("ALERT_ON_FIRST_RUN", false), primeState: false, dryRun: false, diagnoseNetwork: false, json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--prime-state") args.primeState = true;
    else if (current === "--dry-run") args.dryRun = true;
    else if (current === "--diagnose-network") args.diagnoseNetwork = true;
    else if (current === "--json") args.json = true;
    else if (current === "--alert-on-first-run") args.alertOnFirstRun = true;
    else if (current.startsWith("--handle")) {
      const [, value, nextIndex] = takeArg(argv, index); args.handle = String(value || "").replace(/^@/, ""); args.sourceUrl = ""; index = nextIndex;
    } else if (current.startsWith("--source-url") || current.startsWith("--api-url")) {
      const [, value, nextIndex] = takeArg(argv, index); args.sourceUrl = String(value || ""); index = nextIndex;
    } else if (current.startsWith("--include-replies")) {
      const [, value, nextIndex] = takeArg(argv, index); args.includeReplies = parseBoolArg(value); index = nextIndex;
    } else if (current.startsWith("--hydrate-reply-context") || current.startsWith("--enrich-reply-context")) {
      const [, value, nextIndex] = takeArg(argv, index); args.hydrateReplyContext = parseBoolArg(value); index = nextIndex;
    } else if (current.startsWith("--fetch-strategy") || current.startsWith("--max-pages")) {
      const [, , nextIndex] = takeArg(argv, index); index = nextIndex;
    } else {
      throw new Error(`Unknown argument: ${current}`);
    }
  }

  args.sourceUrl = buildDayclawItemsUrl({ handle: args.handle, sourceUrl: args.sourceUrl });
  return args;
}

function targetLabel(args) {
  return args.handle ? `@${args.handle}` : args.sourceUrl;
}

function transientNetworkSummary(error, store, args) {
  let failure = { count: 0 };
  let stateError = null;
  try {
    failure = store.recordOperationalFailure(NETWORK_FAILURE_KEY, error.toSummary());
  } catch (recordError) {
    stateError = sanitizeException(recordError);
  }
  const threshold = Math.max(envInt("OPERATIONAL_ERROR_REPORT_THRESHOLD", 3), 1);
  const reportEvery = Math.max(envInt("OPERATIONAL_ERROR_REPORT_EVERY_FAILURES", 24), 1);
  const failureCount = Number(failure.count);
  const reportToTriage = stateError ? true : shouldReportOperationalFailure(failureCount, threshold, reportEvery);
  return {
    status: "transient_network_error",
    target: targetLabel(args),
    source_url: args.sourceUrl,
    fetched: 0,
    new_items: 0,
    review_count: 0,
    has_review_items: false,
    review_items: [],
    report_timezone: reportTimezone(),
    run_time: timestampFields(new Date().toISOString()),
    llm_instruction: OPERATIONAL_LLM_INSTRUCTION,
    notification_surface: "codex_automation_triage",
    dry_run: Boolean(args.dryRun),
    state: store.info(),
    operational_error: {
      ...error.toSummary(),
      consecutive_failures: failureCount,
      report_to_triage: reportToTriage,
      report_threshold: threshold,
      report_every_failures: reportEvery,
      retry_next_run: true,
      state_error: stateError,
      message: "Transient Dayclaw network failure; keep automation active and retry on the next run.",
    },
    results: [],
  };
}

export function shouldReportOperationalFailure(count, threshold, reportEvery) {
  if (count < threshold) return false;
  if (count === threshold) return true;
  return (count - threshold) % reportEvery === 0;
}

function runtimeErrorSummary(error, args, store = null) {
  return {
    status: "error",
    target: targetLabel(args),
    source_url: args.sourceUrl || null,
    fetched: 0,
    new_items: 0,
    review_count: 0,
    has_review_items: false,
    review_items: [],
    report_timezone: reportTimezone(),
    run_time: timestampFields(new Date().toISOString()),
    llm_instruction: OPERATIONAL_LLM_INSTRUCTION,
    notification_surface: "codex_automation_triage",
    dry_run: Boolean(args.dryRun),
    state: store?.info?.() || null,
    operational_error: {
      type: error?.name || "Error",
      detail: sanitizeException(error),
      report_to_triage: true,
    },
    results: [],
  };
}

function emptyFetchWarning(apiPages) {
  if (!apiPages.length) return "Dayclaw public source returned no pages; check source URL.";
  return "Dayclaw public source succeeded but no items were extracted. Inspect api_pages.response_keys and endpoint.";
}
const OPERATIONAL_LLM_INSTRUCTION = "This is a watchdog operational/source error, not a Codex reset signal. Never label it as a possible future Codex reset. If report_to_triage=true, report an operational issue such as ⚠️ Watchdog source unreachable or ⚠️ Watchdog runtime error; otherwise return a compact operational no-action summary. Do not output process narration.";

export async function main() {
  loadRuntimeEnvironment();
  let args = null;
  try {
    args = parseArgs();
  } catch (error) {
    const wantsJson = process.argv.includes("--json");
    const fallbackArgs = {
      handle: String(process.env.TARGET_X_HANDLE || DEFAULT_TARGET_X_HANDLE).replace(/^@/, ""),
      sourceUrl: String(process.env.DAYCLAW_SOURCE_ITEMS_URL || process.env.SOURCE_ITEMS_URL || ""),
      dryRun: process.argv.includes("--dry-run"),
    };
    const summary = runtimeErrorSummary(error, fallbackArgs);
    if (wantsJson) console.log(prettyJson(summary));
    else console.log(summary.operational_error.detail);
    return 1;
  }

  if (args.diagnoseNetwork) {
    const diagnostic = await diagnoseNetwork({ sourceUrl: args.sourceUrl });
    const summary = {
      status: "network_diagnostic",
      target: targetLabel(args),
      source_url: args.sourceUrl,
      ...diagnostic,
    };
    if (args.json) console.log(prettyJson(summary));
    else console.log(summary.hint);
    return 0;
  }

  const store = new DedupeStore();
  let payload = null;
  let rawItems = [];
  let apiPages = [];

  try {
    const fetched = await fetchSourceItems({ sourceUrl: args.sourceUrl });
    payload = fetched.payload;
    rawItems = fetched.rawItems;
    apiPages = fetched.apiPages;
    store.clearOperationalFailure(NETWORK_FAILURE_KEY);
  } catch (error) {
    const summary =
      error instanceof DayclawTransientError
        ? transientNetworkSummary(error, store, args)
        : runtimeErrorSummary(error, args, store);
    if (args.json) console.log(prettyJson(summary));
    else console.log(summary.operational_error?.message || summary.operational_error?.detail || "Runtime error");
    if (error instanceof DayclawTransientError) {
      return envBool("TRANSIENT_NETWORK_ERRORS_EXIT_ZERO", true) ? 0 : 75;
    }
    return 1;
  }

  try {
    const candidates = rawItems.map(normalizeSourceItem).filter(Boolean).sort(tweetSortKeyCompare);
    const initialRun = store.count() === 0;
    if (args.primeState || (initialRun && !args.alertOnFirstRun && !args.dryRun)) {
      store.markManySeen(candidates.map((tweet) => tweet.id));
      const summary = {
        status: initialRun ? "primed" : "state_updated",
        target: targetLabel(args),
        source_url: args.sourceUrl,
        fetch_strategy: "dayclaw_public_items",
        fetched: candidates.length,
        marked_seen: candidates.length,
        api_pages: apiPages,
        api_warning: candidates.length === 0 ? emptyFetchWarning(apiPages) : null,
        report_timezone: reportTimezone(),
        state: store.info(),
        review_count: 0,
        has_review_items: false,
        review_items: [],
        fetched_items: candidates.map(buildFetchedItem),
        note: "First run baseline: no old items were sent to LLM review. Set ALERT_ON_FIRST_RUN=true to review historical items.",
      };
      console.log(args.json ? prettyJson(summary) : `Primed ${candidates.length} items; no review items emitted.`);
      return 0;
    }
    const { results, reviewItems, contextFetches } = await processCandidates(candidates, { store, args });
    const summary = {
      status: "ok",
      target: targetLabel(args),
      source_url: args.sourceUrl,
      fetch_strategy: "dayclaw_public_items",
      fetched: candidates.length,
      new_items: reviewItems.length,
      api_pages: apiPages,
      api_warning: candidates.length === 0 ? emptyFetchWarning(apiPages) : null,
      report_timezone: reportTimezone(),
      source: payload?.source || null,
      state: store.info(),
      reply_context_fetches: contextFetches,
      run_time: timestampFields(new Date().toISOString()),
      review_count: reviewItems.length,
      has_review_items: reviewItems.length > 0,
      review_items: reviewItems,
      fetched_items: candidates.map(buildFetchedItem),
      llm_instruction:
        "Use run_time plus created_at_local/local_timezone. Use 🚨 only for actionable future reset/refill/restored allowance signals. Treat completed or past reset posts as historical/no-action. If no new_items and no actionable future/unclear signal remains, return a compact no-action summary without the full repeated table. Report a Codex Triage finding only for qualifying new review_items. Do not output process narration, raw JSON, or routine memory notes.",
      notification_surface: "codex_automation_triage",
      dry_run: Boolean(args.dryRun),
      results,
    };

    if (args.json) console.log(prettyJson(summary));
    else console.log(`Checked ${summary.target}: ${summary.new_items} new items queued for LLM review.`);
    return 0;
  } catch (error) {
    const summary = runtimeErrorSummary(error, args, store);
    if (args.json) console.log(prettyJson(summary));
    else console.log(summary.operational_error.detail);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(await main());
