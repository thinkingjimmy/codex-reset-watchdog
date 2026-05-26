#!/usr/bin/env node
/**
 * - [INPUT]: 依赖 check_once.mjs 导出的 tweet 规范化、上下文拼接、状态存储和候选批处理能力。
 * - [OUTPUT]: 对外提供零网络本地 self_test，证明所有新 tweet/reply 都进入 LLM-first review_items。
 * - [POS]: scripts 的回归哨兵，防止运行入口退回规则先筛的旧路径。
 * - [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DedupeStore,
  attachThreadContext,
  buildReviewItem,
  eventKeyForTweet,
  extractTweets,
  processCandidates,
  tweetsFromPayload,
} from "./check_once.mjs";

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-reset-watchdog-"));
  try {
    const high = {
      id: "100",
      text: "Heads up, we'll reset Codex usage limits later today.",
      author: { userName: "target" },
      conversationId: "100",
    };
    const falsePositive = {
      id: "101",
      text: "git reset fixed my Codex branch.",
      author: { userName: "target" },
      conversationId: "101",
    };
    const reply = {
      id: "200",
      text: "yes, later today",
      author: { userName: "target" },
      isReply: true,
      conversationId: "150",
      inReplyToId: "150",
    };

    const candidates = extractTweets({ tweets: [high, falsePositive, reply] });
    assert.equal(candidates.length, 3);
    assert.equal(eventKeyForTweet(candidates[2]), "150");
    assert.equal(tweetsFromPayload({ data: { tweets: [high] } }).length, 1);
    assert.equal(tweetsFromPayload({ result: { items: [falsePositive] } }).length, 1);

    const replyWithContext = attachThreadContext(candidates[2], [
      { id: "150", text: "Will you reset Codex usage limits for affected users?", author: { userName: "someone" } },
      { id: "200", text: "yes, later today", author: { userName: "target" } },
    ]);
    const reviewItem = buildReviewItem(replyWithContext, { contextStatus: "used", contextItems: 2 });
    assert.match(reviewItem.reply_context, /reset Codex usage limits/);

    const store = new DedupeStore(path.join(tmp, "state.json"));
    const result = await processCandidates(candidates, {
      store,
      args: {
        dryRun: false,
        hydrateReplyContext: true,
        threadContextMaxFetches: 12,
        threadContextMaxPages: 1,
      },
      fetchThreadContextImpl: async () => [
        { id: "150", text: "Will you reset Codex usage limits for affected users?", author: { userName: "someone" } },
        { id: "200", text: "yes, later today", author: { userName: "target" } },
      ],
    });
    assert.equal(result.reviewItems.length, 3);
    assert.equal(result.reviewItems[0].text, high.text);
    assert.equal(result.reviewItems[1].text, falsePositive.text);
    assert.equal(result.reviewItems[2].reply_context.includes("reset Codex usage limits"), true);
    assert.equal(result.results.every((row) => row.status === "queued_for_llm"), true);

    const deduped = await processCandidates(candidates, {
      store,
      args: {
        dryRun: false,
        hydrateReplyContext: true,
        threadContextMaxFetches: 12,
        threadContextMaxPages: 1,
      },
      fetchThreadContextImpl: async () => [],
    });
    assert.equal(deduped.reviewItems.length, 0);
    assert.equal(deduped.results.every((row) => row.status === "already_seen"), true);

    const failure = store.recordOperationalFailure("twitterapi_network", { root_cause: "dns_resolution_failure" });
    assert.equal(failure.count, 1);
    store.clearOperationalFailure("twitterapi_network");
    assert.equal(store.load().operational_failures.twitterapi_network, undefined);

    console.log("self_test passed");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

await main();
