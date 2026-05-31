#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_STATE_FILE_PATH,
  DedupeStore,
  buildDayclawItemsUrl,
  buildFetchedItem,
  buildReviewItem,
  eventKeyForTweet,
  extractItems,
  itemsFromPayload,
  normalizeSourceItem,
  parseArgs,
  processCandidates,
  shouldReportOperationalFailure,
} from "./check_once.mjs";

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-reset-watchdog-"));
  try {
    const high = {
      id: "item-100",
      external_id: "100",
      title: "Heads up, we'll reset Codex usage limits later today.",
      content: "Heads up, we'll reset Codex usage limits later today.",
      author: "target",
      url: "https://x.com/target/status/100",
      published_at: "2026-05-30T10:00:00",
      metadata: { is_reply: false, author_user_name: "target", raw_author_name: "Tibo" },
    };
    const falsePositive = {
      id: "item-101",
      external_id: "101",
      content: "git reset fixed my Codex branch.",
      author: "target",
      url: "https://x.com/target/status/101",
      published_at: "2026-05-30T10:01:00",
      metadata: { is_reply: false, author_user_name: "target" },
    };
    const reply = {
      id: "item-200",
      external_id: "200",
      content: "yes, later today",
      author: "target",
      url: "https://x.com/target/status/200",
      published_at: "2026-05-30T10:02:00",
      metadata: { is_reply: true, author_user_name: "target" },
    };

    const payload = {
      source: { name: "@target", user_name: "target", source_url: "https://x.com/target" },
      items: [high, falsePositive, reply],
      limit: 10,
    };
    const candidates = extractItems(payload);
    assert.equal(candidates.length, 3);
    assert.equal(candidates[0].id, "100");
    assert.equal(candidates[2].text, "yes, later today");
    assert.equal(itemsFromPayload({ data: { items: [high] } }).length, 1);
    assert.equal(buildDayclawItemsUrl({ handle: "@target" }), "https://apitest.dayclaw.com/api/source/public/x/target/items");

    const normalized = normalizeSourceItem(high);
    assert.equal(normalized.author_username, "target");
    assert.equal(eventKeyForTweet(normalized), "100");
    assert.equal(buildFetchedItem(normalized).text, high.content);
    assert.equal(buildReviewItem(normalizeSourceItem(reply)).context_status, "not_available_in_public_feed");

    const store = new DedupeStore(path.join(tmp, "state.json"));
    const result = await processCandidates(candidates, {
      store,
      args: { dryRun: false, includeReplies: true },
    });
    assert.equal(result.reviewItems.length, 3);
    assert.equal(result.reviewItems[0].text, high.content);
    assert.equal(result.reviewItems[1].text, falsePositive.content);
    assert.equal(result.reviewItems[2].is_reply, true);
    assert.equal(result.results.every((row) => row.status === "queued_for_llm"), true);

    const deduped = await processCandidates(candidates, {
      store,
      args: { dryRun: false, includeReplies: true },
    });
    assert.equal(deduped.reviewItems.length, 0);
    assert.equal(deduped.results.every((row) => row.status === "already_seen"), true);

    const noRepliesStore = new DedupeStore(path.join(tmp, "no-replies-state.json"));
    const noReplies = await processCandidates(candidates, {
      store: noRepliesStore,
      args: { dryRun: true, includeReplies: false },
    });
    assert.equal(noReplies.reviewItems.length, 2);
    assert.equal(noReplies.results.at(-1).status, "ignored_reply");

    const failure = store.recordOperationalFailure("dayclaw_network", { root_cause: "dns_resolution_failure" });
    assert.equal(failure.count, 1);
    store.clearOperationalFailure("dayclaw_network");
    assert.equal(store.load().operational_failures.dayclaw_network, undefined);

    const blockedParent = path.join(tmp, "not-a-directory");
    fs.writeFileSync(blockedParent, "file blocks directory creation", "utf8");
    const fallbackStore = new DedupeStore(path.join(blockedParent, "state.json"));
    fallbackStore.fallbackPath = path.join(tmp, DEFAULT_STATE_FILE_PATH);
    fallbackStore.markSeen("fallback-works");
    assert.equal(fallbackStore.info().fallback_used, true);
    assert.equal(fallbackStore.isSeen("fallback-works"), true);

    assert.equal(shouldReportOperationalFailure(1, 3, 24), false);
    assert.equal(shouldReportOperationalFailure(2, 3, 24), false);
    assert.equal(shouldReportOperationalFailure(3, 3, 24), true);
    assert.equal(shouldReportOperationalFailure(4, 3, 24), false);
    assert.equal(shouldReportOperationalFailure(27, 3, 24), true);
    assert.equal(parseArgs(["--diagnose-network"]).diagnoseNetwork, true);
    assert.equal(parseArgs(["--handle", "target"]).sourceUrl, "https://apitest.dayclaw.com/api/source/public/x/target/items");
    assert.equal(parseArgs(["--source-url", "https://example.test/items"]).sourceUrl, "https://example.test/items");

    console.log("self_test passed");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

await main();
