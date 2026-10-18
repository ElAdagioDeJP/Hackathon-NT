import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, createLimiter, RateLimitError } from "./rate-limit";

test("limits runs per key, in-flight duplicates and global concurrency", async () => {
  let clock = 0;
  const limiter = createLimiter({ max: 2, windowMs: 60_000, concurrent: 2, now: () => clock });
  const ok = () => Promise.resolve("done");

  assert.equal(await limiter.run("a", ok), "done");
  assert.equal(await limiter.run("a", ok), "done");
  await assert.rejects(() => limiter.run("a", ok), (e: RateLimitError) =>
    e instanceof RateLimitError && /Too many/.test(e.message) && e.retryAfterSeconds === 60,
  );
  clock = 60_000;
  assert.equal(await limiter.run("a", ok), "done");

  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slow = () => gate.then(() => "slow");
  const first = limiter.run("b", slow);
  await assert.rejects(() => limiter.run("b", ok), /already running/);
  const second = limiter.run("c", slow);
  await assert.rejects(() => limiter.run("d", ok), /busy/);
  release();
  assert.deepEqual(await Promise.all([first, second]), ["slow", "slow"]);
  assert.equal(await limiter.run("d", ok), "done");

  // A failed run frees its slot.
  await assert.rejects(() => limiter.run("e", () => Promise.reject(new Error("boom"))), /boom/);
  assert.equal(await limiter.run("e", ok), "done");
});

test("clientIp takes the first forwarded hop", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(new Headers()), "unknown");
});
