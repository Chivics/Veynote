import test from "node:test";
import assert from "node:assert/strict";
import { createIdleSession } from "../src/utils/idleSession.js";

function setup(minutes = 5) {
  let time = 1000000, locks = 0, reports = 0;
  const callbacks = new Map(); let id = 0;
  const idle = createIdleSession({ minutes, lastActivityAt: new Date(time).toISOString(), now: () => time, onLock: () => locks++, onActivity: () => reports++, schedule: callback => { callbacks.set(++id, callback); return id; }, cancel: key => callbacks.delete(key) });
  return { idle, callbacks, advance(ms) { time += ms; }, get locks() { return locks; }, get reports() { return reports; } };
}
test("suspended tabs lock before resumed input can extend their deadline", () => {
  const f = setup(); f.advance(5 * 60000); assert.equal(f.idle.activity(), false);
  assert.equal(f.locks, 1); assert.equal(f.reports, 0); f.idle.check(); assert.equal(f.locks, 1);
});
test("human activity renews the deadline and reports are coalesced without polling", () => {
  const f = setup(); f.advance(60000); assert.equal(f.idle.activity(), true); assert.equal(f.reports, 1);
  f.idle.activity(); assert.equal(f.reports, 1); f.advance(30000); f.idle.activity(); assert.equal(f.reports, 2);
  f.advance(299999); assert.equal(f.idle.check(), false); f.advance(1); assert.equal(f.idle.check(), true);
});
test("disabled idle protection has no timer or activity requests; disposal cancels timers", () => {
  const disabled = setup(0); disabled.advance(30 * 86400000); assert.equal(disabled.idle.activity(), true); assert.equal(disabled.callbacks.size, 0); assert.equal(disabled.reports, 0);
  const active = setup(); assert.equal(active.callbacks.size, 1); active.idle.dispose(); assert.equal(active.callbacks.size, 0);
});
test("activity in another tab renews the same device deadline without requests or unlocking", () => {
  const f = setup(); f.advance(4 * 60000); f.idle.syncActivity(1240000); f.advance(60000); assert.equal(f.idle.check(), false); assert.equal(f.reports, 0);
  f.advance(4 * 60000); assert.equal(f.idle.check(), true); f.idle.syncActivity(1600000); assert.equal(f.idle.activity(), false);
});
