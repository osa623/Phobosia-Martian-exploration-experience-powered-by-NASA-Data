const assert = require("node:assert/strict");
const {
  EVAResources,
  EVA_RESOURCE_KEY,
  EVA_OXYGEN_PERCENT_PER_SECOND,
  EVA_BATTERY_PERCENT_PER_SECOND
} = require("../dist/core/EVAResources.js");

class MemoryStorage {
  values = new Map();
  writes = 0;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes++; this.values.set(key, value); }
}

const storage = new MemoryStorage();
let clock = 1_800_000_000_000;
const resources = new EVAResources(storage, clock);
let state = resources.beginSession(clock);
assert.equal(state.oxygenPercent, 100);
assert.equal(state.batteryPercent, 100);
assert.equal(state.suitActive, true);

state = resources.update(30 * 60, true, clock += 30 * 60 * 1000);
assert(Math.abs(state.oxygenPercent - 75) < 1e-8, "30 outdoor minutes consume one quarter of oxygen");
assert(Math.abs(state.batteryPercent - 75) < 1e-8, "30 outdoor minutes consume one quarter of battery");
assert.equal(EVA_OXYGEN_PERCENT_PER_SECOND, 100 / 7200);
assert.equal(EVA_BATTERY_PERCENT_PER_SECOND, 100 / 7200);

resources.setLocation(false, clock);
const indoorWriteCount = storage.writes;
state = resources.update(45 * 60, false, clock += 45 * 60 * 1000);
assert.equal(state.oxygenPercent, 75, "indoors, including Airlock, oxygen does not drain");
assert.equal(state.batteryPercent, 75, "indoors, including Airlock, battery does not drain");
assert.equal(state.suitActive, true, "the EVA suit remains active indoors during the return cycle");
assert.equal(storage.writes, indoorWriteCount, "indoor frames do not repeatedly write resource state to storage");

resources.setLocation(true, clock);
state = resources.update(90 * 60, true, clock += 90 * 60 * 1000);
assert.equal(state.oxygenPercent, 0, "depletion clamps at zero");
assert.equal(state.batteryPercent, 0, "battery depletion clamps at zero");

state = resources.endSession(clock);
assert.equal(state.suitActive, false);
state = resources.beginSession(clock += 1000);
assert.equal(state.oxygenPercent, 100, "removing then re-preparing starts a fresh resource session");
assert.equal(state.batteryPercent, 100, "removing then re-preparing resets suit power");

resources.setLocation(true, clock);
resources.update(600, true, clock += 600_000);
const resumed = new EVAResources(storage, clock += 300_000).getState();
assert(Math.abs(resumed.oxygenPercent - (100 - 900 * EVA_OXYGEN_PERCENT_PER_SECOND)) < 1e-8, "a refresh while outdoors restores and accounts for elapsed real time");
assert(Math.abs(resumed.batteryPercent - (100 - 900 * EVA_BATTERY_PERCENT_PER_SECOND)) < 1e-8);
assert.equal(storage.getItem(EVA_RESOURCE_KEY) !== null, true);

console.log("EVA resource session, indoor pause, depletion, reset, and persisted-resume tests passed.");
