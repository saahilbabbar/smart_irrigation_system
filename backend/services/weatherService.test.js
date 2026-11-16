const test = require("node:test");
const assert = require("node:assert/strict");

const { summariseForecast } = require("./weatherService");

const HOUR = 3600;
const now = 1_800_000_000;
const hours = (startEpoch, values) => values.map(([precip_mm, chance_of_rain], i) => ({
  time_epoch: startEpoch + i * HOUR, precip_mm, chance_of_rain,
}));

test("sums precipitation and takes max chance over the next window", () => {
  // Slots start 30 min ago (current hour, still running) then every hour.
  const day = { hour: hours(now - HOUR / 2, [[1, 30], [2, 70], [0.5, 50], [9, 95]]) };
  const f = summariseForecast([day], now, 2);
  // Window (now, now+2h] overlaps the first three slots; the 4th starts at +2.5h.
  assert.deepEqual(f, { forecastRainMm: 3.5, forecastRainChance: 70, forecastWindowHours: 2 });
});

test("ignores hours that have fully passed and spans multiple days", () => {
  const today = { hour: hours(now - 3 * HOUR, [[5, 90], [5, 90], [0, 0]]) }; // ends at now
  const tomorrow = { hour: hours(now, [[1.2, 65]]) };
  assert.deepEqual(summariseForecast([today, tomorrow], now, 6), {
    forecastRainMm: 1.2, forecastRainChance: 65, forecastWindowHours: 6,
  });
});

test("returns nulls when no forecast hours are available", () => {
  assert.deepEqual(summariseForecast(undefined, now, 6), {
    forecastRainMm: null, forecastRainChance: null, forecastWindowHours: 6,
  });
});
