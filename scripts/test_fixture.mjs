export function testFixtureRun(name, { now = new Date() } = {}) {
  if (!name) return null;
  if (name !== "future-reset") throw new Error(`Unknown test fixture: ${name}`);

  const publishedAt = now.toISOString();
  const tweetId = `watchdog-test-${publishedAt.replace(/\D/g, "").slice(0, 14)}`;
  const item = {
    id: tweetId,
    external_id: tweetId,
    content: "[TEST] Codex usage limits will reset tomorrow morning. Spend remaining tokens before the reset.",
    author: "codex-reset-watchdog-test",
    url: "https://example.invalid/codex-reset-watchdog/test-future-reset",
    published_at: publishedAt,
    metadata: {
      is_reply: false,
      author_user_name: "codex-reset-watchdog-test",
      raw_author_name: "Codex Reset Watchdog Test",
    },
  };
  const payload = {
    source: {
      name: "Codex Reset Watchdog test fixture",
      user_name: "codex-reset-watchdog-test",
      source_url: "test-fixture:future-reset",
    },
    items: [item],
    limit: 1,
  };

  return {
    payload,
    rawItems: payload.items,
    apiPages: [{
      source: "test_fixture",
      endpoint: "test-fixture:future-reset",
      status: "ok",
      message: "Synthetic future reset item for notification smoke tests.",
      item_count: 1,
      limit: 1,
      response_keys: Object.keys(payload).sort(),
      source_name: payload.source.name,
      source_url: payload.source.source_url,
    }],
  };
}
