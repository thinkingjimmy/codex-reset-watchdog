#!/usr/bin/env node
/**
 * - [INPUT]: 依赖 Node.js 内置 fs/path/os/fetch，读取 env/.env、TwitterAPI.io 和 JSON state。
 * - [OUTPUT]: 对外提供 check_once CLI、TwitterAPI.io 抓取函数、tweet 批次整理和 LLM-first JSON 汇总。
 * - [POS]: scripts 的零依赖运行入口，只搬运事实与维护记忆，语义判断交给 Codex Automation LLM。
 * - [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LAST_TWEETS_URL = "https://api.twitterapi.io/twitter/user/last_tweets";
export const THREAD_CONTEXT_URL = "https://api.twitterapi.io/twitter/tweet/thread_context";
export const DEFAULT_STATE_FILE_PATH = "~/.cache/codex-reset-watchdog/state.json";
export const NETWORK_FAILURE_KEY = "twitterapi_network";

const API_KEY_PLACEHOLDERS = new Set([
  "",
  "REPLACE_WITH_YOUR_TWITTERAPI_IO_KEY",
  "YOUR_TWITTERAPI_IO_KEY",
  "PASTE_YOUR_TWITTERAPI_IO_KEY_HERE",
]);

export class TwitterAPITransientError extends Error {
  constructor({ operation, url, attempts, cause }) {
    super(String(cause?.message || cause || "TwitterAPI.io transient network error"));
    this.name = "TwitterAPITransientError";
    this.operation = operation;
    this.url = url;
    this.attempts = attempts;
    this.cause = cause;
    this.rootCause = networkRootCause(cause);
  }

  toSummary() {
    return {
      type: this.cause?.name || "Error",
      operation: this.operation,
      url: this.url,
      attempts: this.attempts,
      root_cause: this.rootCause,
      detail: sanitizeException(this.cause),
    };
  }
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function stripEnvQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
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

  const secretCandidates = [
    process.env.CODEX_RESET_WATCH_SECRETS_FILE,
    process.env.TWITTERAPI_IO_SECRETS_FILE,
    path.join(root, ".secrets.env"),
    path.join(root, "secrets.env"),
    path.join(root, "secrets", "secrets.env"),
    path.join(os.homedir(), ".config", "codex-reset-watchdog", "secrets.env"),
  ];
  for (const candidate of secretCandidates) loadEnvFileIfPresent(expandHome(candidate));
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

function readFirstNonemptyLine(filePath) {
  if (!filePath) return "";
  const expanded = expandHome(filePath);
  if (!fs.existsSync(expanded) || !fs.statSync(expanded).isFile()) return "";
  for (const rawLine of fs.readFileSync(expanded, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line && !line.startsWith("#")) return line;
  }
  return "";
}

export function requireApiKey(root = repoRoot()) {
  const envKey = String(process.env.TWITTERAPI_IO_KEY || "").trim();
  if (!API_KEY_PLACEHOLDERS.has(envKey)) return envKey;

  const keyFileCandidates = [
    process.env.TWITTERAPI_IO_KEY_FILE,
    path.join(root, "secrets", "twitterapi_io_key"),
    path.join(root, ".twitterapi_io_key"),
    path.join(os.homedir(), ".config", "codex-reset-watchdog", "twitterapi_io_key"),
  ];
  for (const candidate of keyFileCandidates) {
    const key = readFirstNonemptyLine(candidate);
    if (key) return key;
  }

  const error = new Error(
    "TwitterAPI.io API key is required. Copy env.example to env or .env and replace TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE with your real key.",
  );
  error.code = "CONFIG_ERROR";
  throw error;
}

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export class DedupeStore {
  constructor(filePath = process.env.STATE_FILE_PATH || DEFAULT_STATE_FILE_PATH) {
    this.path = expandHome(filePath);
  }

  emptyState() {
    return { seen_tweets: {}, reported_events: {}, operational_failures: {} };
  }

  load() {
    if (!fs.existsSync(this.path)) return this.emptyState();
    const raw = JSON.parse(fs.readFileSync(this.path, "utf8"));
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

  save(state) {
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    const tempPath = path.join(path.dirname(this.path), `.${path.basename(this.path)}.${process.pid}.tmp`);
    try {
      fs.writeFileSync(tempPath, `${prettyJson(state)}\n`, "utf8");
      fs.renameSync(tempPath, this.path);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
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

function networkRootCause(error) {
  const detail = String(error?.message || error || "").toLowerCase();
  const dnsMarkers = [
    "nameresolutionerror",
    "nodename nor servname",
    "temporary failure in name resolution",
    "name or service not known",
    "getaddrinfo",
    "enotfound",
  ];
  if (dnsMarkers.some((marker) => detail.includes(marker))) return "dns_resolution_failure";
  if (error?.name === "AbortError" || detail.includes("timeout")) return "timeout";
  return "connection_error";
}

function retryDelayMs(attempt) {
  const base = Math.max(envInt("TWITTERAPI_IO_RETRY_SLEEP_SECONDS", 5), 0);
  const cap = Math.max(envInt("TWITTERAPI_IO_RETRY_MAX_SLEEP_SECONDS", 30), 0);
  if (base === 0 || cap === 0) return 0;
  return Math.min(cap, base * 2 ** Math.max(attempt - 1, 0)) * 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, timeoutSeconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "X-API-Key": requireApiKey() } });
    const body = await response.text();
    let payload = null;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      throw new Error(`TwitterAPI.io returned non-JSON response with status ${response.status}`);
    }
    if (!response.ok) {
      const message = payload?.message || payload?.error || response.statusText || "HTTP error";
      const error = new Error(`TwitterAPI.io HTTP ${response.status}: ${message}`);
      error.status = response.status;
      throw error;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("TwitterAPI.io response is not a JSON object");
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJsonWithRetries(endpoint, { params, timeout = 20, operation }) {
  const attempts = Math.max(envInt("TWITTERAPI_IO_RETRY_ATTEMPTS", 3), 1);
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJsonWithTimeout(url, timeout);
    } catch (error) {
      lastError = error;
      const retryableStatus = [429, 500, 502, 503, 504].includes(Number(error.status || 0));
      const transientNetwork = isTransientNetworkError(error);
      const retryable = retryableStatus || transientNetwork;
      if (!retryable || attempt >= attempts) break;
      const delay = retryDelayMs(attempt);
      if (delay) await sleep(delay);
    }
  }

  if (isTransientNetworkError(lastError)) {
    throw new TwitterAPITransientError({ operation, url: endpoint, attempts, cause: lastError });
  }
  throw lastError;
}

function isTransientNetworkError(error) {
  if (!error || error.status || error.code === "CONFIG_ERROR") return false;
  return error.name === "AbortError" || error instanceof TypeError || String(error.message || "").includes("fetch failed");
}

export async function fetchLastTweets({ handle, userId, includeReplies, maxPages, timeout = 20 }) {
  if (!handle && !userId) throw new Error("Either --handle/TARGET_X_HANDLE or --user-id/TARGET_X_USER_ID is required");
  const baseParams = { includeReplies: String(Boolean(includeReplies)) };
  if (userId) baseParams.userId = userId;
  else baseParams.userName = String(handle).replace(/^@/, "");

  const tweets = [];
  let cursor = "";
  for (let page = 0; page < Math.max(maxPages, 1); page += 1) {
    const payload = await getJsonWithRetries(LAST_TWEETS_URL, {
      params: cursor ? { ...baseParams, cursor } : baseParams,
      timeout,
      operation: "last_tweets",
    });
    if (payload.status === "error") throw new Error(payload.message || "TwitterAPI.io returned error status");
    const pageTweets = Array.isArray(payload.tweets) ? payload.tweets : [];
    tweets.push(...pageTweets.filter((item) => item && typeof item === "object"));
    if (!payload.has_next_page) break;
    cursor = String(payload.next_cursor || "");
    if (!cursor) break;
  }
  return tweets;
}

export async function fetchThreadContext(tweetId, { maxPages, timeout = 20 }) {
  const context = [];
  let cursor = "";
  for (let page = 0; page < Math.max(maxPages, 1); page += 1) {
    const payload = await getJsonWithRetries(THREAD_CONTEXT_URL, {
      params: cursor ? { tweetId, cursor } : { tweetId },
      timeout,
      operation: "thread_context",
    });
    if (payload.status === "error") throw new Error(payload.message || "TwitterAPI.io thread_context returned error status");
    const pageItems = Array.isArray(payload.replies)
      ? payload.replies
      : Array.isArray(payload.tweets)
        ? payload.tweets
        : [];
    context.push(...pageItems.filter((item) => item && typeof item === "object"));
    if (!payload.has_next_page) break;
    cursor = String(payload.next_cursor || "");
    if (!cursor) break;
  }
  return context;
}

function tweetIdAsBigInt(tweetId) {
  try {
    return tweetId ? BigInt(String(tweetId)) : null;
  } catch {
    return null;
  }
}

export function tweetSortKeyCompare(left, right) {
  const leftId = String(left?.id || left?.id_str || "");
  const rightId = String(right?.id || right?.id_str || "");
  const leftInt = tweetIdAsBigInt(leftId);
  const rightInt = tweetIdAsBigInt(rightId);
  if (leftInt !== null && rightInt !== null) return leftInt < rightInt ? -1 : leftInt > rightInt ? 1 : 0;
  return String(left?.createdAt || left?.created_at || leftId).localeCompare(
    String(right?.createdAt || right?.created_at || rightId),
  );
}

export function extractAuthorUsername(raw) {
  const author = raw.author && typeof raw.author === "object" ? raw.author : {};
  return author.userName || author.username || author.screen_name || raw.screen_name || null;
}

export function extractAuthorName(raw) {
  const author = raw.author && typeof raw.author === "object" ? raw.author : {};
  return author.name || author.display_name || raw.display_name || null;
}

export function extractTweets(payload) {
  const items = [];
  if (payload?.tweet && typeof payload.tweet === "object") items.push(payload.tweet);
  if (Array.isArray(payload?.tweets)) items.push(...payload.tweets.filter((item) => item && typeof item === "object"));
  if (Array.isArray(payload?.replies)) items.push(...payload.replies.filter((item) => item && typeof item === "object"));
  if (!items.length && payload?.id && payload?.text !== undefined) items.push(payload);

  return items.flatMap((raw) => {
    const id = String(raw.id || raw.id_str || "").trim();
    const text = String(raw.text || raw.full_text || "");
    if (!id || text === "") return [];
    return [
      {
        id,
        text,
        author_username: extractAuthorUsername(raw),
        author_name: extractAuthorName(raw),
        url: raw.url || null,
        created_at: raw.createdAt || raw.created_at || raw.created_ms || raw.snowflake_created_ms || null,
        raw,
        context_text: "",
        context_tweets: [],
      },
    ];
  });
}

export function isRepostLike(raw) {
  const tweetType = String(raw?.type || raw?.tweet_type || "").toLowerCase();
  if (tweetType === "retweet" || tweetType === "repost") return true;
  if (raw?.retweeted_tweet) return true;
  return String(raw?.text || "").startsWith("RT @");
}

export function isReplyLike(raw) {
  if (!raw) return false;
  if (typeof raw.isReply === "boolean") return raw.isReply;
  if (typeof raw.isReply === "string" && ["1", "true", "yes"].includes(raw.isReply.trim().toLowerCase())) return true;
  return Boolean(raw.inReplyToId || raw.in_reply_to_status_id || raw.inReplyToUsername);
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

export function buildThreadContextText(contextTweets, { currentTweetId, maxChars = 2400 }) {
  const currentInt = tweetIdAsBigInt(currentTweetId);
  const parts = [...contextTweets]
    .sort(tweetSortKeyCompare)
    .flatMap((raw) => {
      const tweetId = String(raw.id || raw.id_str || "");
      if (tweetId && tweetId === String(currentTweetId)) return [];
      const tweetInt = tweetIdAsBigInt(tweetId);
      if (currentInt !== null && tweetInt !== null && tweetInt > currentInt) return [];
      const text = String(raw.text || raw.full_text || "").trim();
      if (!text) return [];
      return [`@${extractAuthorUsername(raw) || "unknown"}: ${text}`];
    });
  const maxTweets = envInt("THREAD_CONTEXT_MAX_TWEETS", 8);
  const selected = maxTweets > 0 ? parts.slice(-maxTweets) : parts;
  const value = selected.join("\n");
  return value.length > maxChars ? `${value.slice(0, Math.max(maxChars - 20, 0)).trim()} ...[truncated]` : value;
}

export function attachThreadContext(tweet, contextTweets) {
  const rawContext = contextTweets.filter((item) => item && typeof item === "object");
  const maxChars = envInt("THREAD_CONTEXT_MAX_CHARS", envInt("REPLY_CONTEXT_MAX_CHARS", 2400));
  const contextText = buildThreadContextText(rawContext, { currentTweetId: tweet.id, maxChars });
  return {
    ...tweet,
    context_text: contextText,
    context_tweets: rawContext,
    raw: { ...(tweet.raw || {}), _thread_context: rawContext },
  };
}

export function buildReviewItem(tweet, { contextStatus, contextItems, contextError = null }) {
  const raw = tweet.raw || {};
  const item = {
    tweet_id: tweet.id,
    event_key: eventKeyForTweet(tweet),
    url: buildTweetUrl(tweet),
    created_at: tweet.created_at,
    author: tweet.author_username,
    author_name: tweet.author_name,
    is_reply: isReplyLike(raw),
    in_reply_to_id: raw.inReplyToId || raw.in_reply_to_status_id || null,
    in_reply_to_username: raw.inReplyToUsername || null,
    text: tweet.text,
    reply_context: tweet.context_text || "",
    context_status: contextStatus,
    context_items: contextItems,
  };
  if (contextError) item.context_error = contextError;
  return item;
}

export async function processCandidates(candidates, { store, args, fetchThreadContextImpl = fetchThreadContext }) {
  const includeReposts = envBool("INCLUDE_REPOSTS", false);
  const results = [];
  const reviewItems = [];
  let contextFetches = 0;

  for (const tweet of candidates) {
    if (store.isSeen(tweet.id)) {
      results.push({ tweet_id: tweet.id, status: "already_seen" });
      continue;
    }

    if (tweet.raw && isRepostLike(tweet.raw) && !includeReposts) {
      if (!args.dryRun) store.markSeen(tweet.id);
      results.push({ tweet_id: tweet.id, status: "ignored_repost", is_reply: isReplyLike(tweet.raw) });
      continue;
    }

    let reviewTweet = tweet;
    let contextStatus = isReplyLike(tweet.raw) ? "disabled" : "not_reply";
    let contextItems = 0;
    let contextError = null;
    if (args.hydrateReplyContext && isReplyLike(tweet.raw)) {
      if (contextFetches < Math.max(args.threadContextMaxFetches, 0)) {
        contextFetches += 1;
        try {
          const contextTweets = await fetchThreadContextImpl(tweet.id, { maxPages: Math.max(args.threadContextMaxPages, 1) });
          reviewTweet = attachThreadContext(tweet, contextTweets);
          contextItems = contextTweets.length;
          contextStatus = reviewTweet.context_text ? "used" : "empty";
        } catch (error) {
          if (envBool("THREAD_CONTEXT_STRICT", false)) throw error;
          contextStatus = "error";
          contextError = sanitizeException(error);
        }
      } else {
        contextStatus = "skipped_limit";
      }
    }

    const item = buildReviewItem(reviewTweet, { contextStatus, contextItems, contextError });
    if (!args.dryRun) store.markSeen(tweet.id);
    reviewItems.push(item);
    results.push({
      tweet_id: tweet.id,
      status: "queued_for_llm",
      event_key: item.event_key,
      url: item.url,
      is_reply: item.is_reply,
      context_status: contextStatus,
      context_items: contextItems,
    });
  }

  return { results, reviewItems, contextFetches };
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
  const args = {
    handle: String(process.env.TARGET_X_HANDLE || "").trim(),
    userId: String(process.env.TARGET_X_USER_ID || "").trim(),
    includeReplies: envBool("INCLUDE_REPLIES", true),
    maxPages: envInt("CHECK_ONCE_MAX_PAGES", 2),
    hydrateReplyContext: envBool("HYDRATE_REPLY_CONTEXT", envBool("ENRICH_REPLY_CONTEXT", true)),
    threadContextMaxPages: envInt("THREAD_CONTEXT_MAX_PAGES", envInt("REPLY_CONTEXT_MAX_PAGES", 1)),
    threadContextMaxFetches: envInt("THREAD_CONTEXT_MAX_FETCHES", envInt("REPLY_CONTEXT_MAX_FETCHES", 12)),
    alertOnFirstRun: envBool("ALERT_ON_FIRST_RUN", false),
    primeState: false,
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--prime-state") args.primeState = true;
    else if (current === "--dry-run") args.dryRun = true;
    else if (current === "--json") args.json = true;
    else if (current === "--alert-on-first-run") args.alertOnFirstRun = true;
    else if (current.startsWith("--handle")) {
      const [, value, nextIndex] = takeArg(argv, index);
      args.handle = String(value || "").replace(/^@/, "");
      index = nextIndex;
    } else if (current.startsWith("--user-id")) {
      const [, value, nextIndex] = takeArg(argv, index);
      args.userId = String(value || "");
      index = nextIndex;
    } else if (current.startsWith("--include-replies")) {
      const [, value, nextIndex] = takeArg(argv, index);
      args.includeReplies = parseBoolArg(value);
      index = nextIndex;
    } else if (current.startsWith("--max-pages")) {
      const [, value, nextIndex] = takeArg(argv, index);
      args.maxPages = Number.parseInt(value, 10);
      index = nextIndex;
    } else if (current.startsWith("--hydrate-reply-context") || current.startsWith("--enrich-reply-context")) {
      const [, value, nextIndex] = takeArg(argv, index);
      args.hydrateReplyContext = parseBoolArg(value);
      index = nextIndex;
    } else if (current.startsWith("--thread-context-max-pages") || current.startsWith("--reply-context-max-pages")) {
      const [, value, nextIndex] = takeArg(argv, index);
      args.threadContextMaxPages = Number.parseInt(value, 10);
      index = nextIndex;
    } else if (current.startsWith("--thread-context-max-fetches") || current.startsWith("--reply-context-max-fetches")) {
      const [, value, nextIndex] = takeArg(argv, index);
      args.threadContextMaxFetches = Number.parseInt(value, 10);
      index = nextIndex;
    } else {
      throw new Error(`Unknown argument: ${current}`);
    }
  }

  return args;
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
  return {
    status: "transient_network_error",
    target: args.userId || `@${args.handle}`,
    fetched: 0,
    new_items: 0,
    review_count: 0,
    has_review_items: false,
    review_items: [],
    notification_surface: "codex_automation_triage",
    dry_run: Boolean(args.dryRun),
    operational_error: {
      ...error.toSummary(),
      consecutive_failures: Number(failure.count),
      report_to_triage: stateError ? true : Number(failure.count) >= threshold,
      report_threshold: threshold,
      retry_next_run: true,
      state_error: stateError,
      message: "Transient TwitterAPI.io network failure; keep automation active and retry on the next run.",
    },
    results: [],
  };
}

function runtimeErrorSummary(error, args) {
  return {
    status: "error",
    target: args.userId || `@${args.handle}`,
    fetched: 0,
    new_items: 0,
    review_count: 0,
    has_review_items: false,
    review_items: [],
    notification_surface: "codex_automation_triage",
    dry_run: Boolean(args.dryRun),
    operational_error: {
      type: error?.name || "Error",
      detail: sanitizeException(error),
      report_to_triage: true,
    },
    results: [],
  };
}

export async function main() {
  loadRuntimeEnvironment();
  let args = null;
  try {
    args = parseArgs();
  } catch (error) {
    const wantsJson = process.argv.includes("--json");
    const fallbackArgs = {
      handle: String(process.env.TARGET_X_HANDLE || "").replace(/^@/, ""),
      userId: String(process.env.TARGET_X_USER_ID || ""),
      dryRun: process.argv.includes("--dry-run"),
    };
    const summary = runtimeErrorSummary(error, fallbackArgs);
    if (wantsJson) console.log(prettyJson(summary));
    else console.log(summary.operational_error.detail);
    return 1;
  }
  args.handle = args.handle.replace(/^@/, "");
  const store = new DedupeStore();

  let rawTweets = [];
  try {
    rawTweets = await fetchLastTweets({
      handle: args.handle || null,
      userId: args.userId || null,
      includeReplies: args.includeReplies,
      maxPages: Math.max(args.maxPages, 1),
    });
    store.clearOperationalFailure(NETWORK_FAILURE_KEY);
  } catch (error) {
    const summary =
      error instanceof TwitterAPITransientError
        ? transientNetworkSummary(error, store, args)
        : runtimeErrorSummary(error, args);
    if (args.json) console.log(prettyJson(summary));
    else console.log(summary.operational_error?.message || summary.operational_error?.detail || "Runtime error");
    if (error instanceof TwitterAPITransientError) {
      return envBool("TRANSIENT_NETWORK_ERRORS_EXIT_ZERO", true) ? 0 : 75;
    }
    return 1;
  }

  try {
    const candidates = extractTweets({ tweets: rawTweets.sort(tweetSortKeyCompare) });
    const initialRun = store.count() === 0;
    if (args.primeState || (initialRun && !args.alertOnFirstRun && !args.dryRun)) {
      store.markManySeen(candidates.map((tweet) => tweet.id));
      const summary = {
        status: initialRun ? "primed" : "state_updated",
        fetched: candidates.length,
        marked_seen: candidates.length,
        review_count: 0,
        has_review_items: false,
        review_items: [],
        note: "First run baseline: no old tweets were sent to LLM review. Set ALERT_ON_FIRST_RUN=true to review historical tweets.",
      };
      console.log(args.json ? prettyJson(summary) : `Primed ${candidates.length} tweets; no review items emitted.`);
      return 0;
    }

    const { results, reviewItems, contextFetches } = await processCandidates(candidates, { store, args });
    const summary = {
      status: "ok",
      target: args.userId || `@${args.handle}`,
      fetched: candidates.length,
      new_items: reviewItems.length,
      reply_context_fetches: contextFetches,
      review_count: reviewItems.length,
      has_review_items: reviewItems.length > 0,
      review_items: reviewItems,
      llm_instruction:
        "Review every item in review_items. Report a Codex Triage finding only if the tweet/reply or its context probably announces, confirms, schedules, completes, or remediates a Codex usage/quota/rate-limit reset/refill/restored allowance. If none qualify, archive this run with no finding.",
      notification_surface: "codex_automation_triage",
      dry_run: Boolean(args.dryRun),
      results,
    };

    if (args.json) console.log(prettyJson(summary));
    else console.log(`Checked ${summary.target}: ${summary.new_items} new tweets/replies queued for LLM review.`);
    return 0;
  } catch (error) {
    const summary = runtimeErrorSummary(error, args);
    if (args.json) console.log(prettyJson(summary));
    else console.log(summary.operational_error.detail);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const code = await main();
  process.exit(code);
}
