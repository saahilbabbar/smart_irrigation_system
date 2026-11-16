const test = require("node:test");
const assert = require("node:assert/strict");

const { decideIrrigation } = require("./irrigationEngine");

const wheat = { key: "wheat", name: "Wheat", minMoisture: 40, maxMoisture: 60 };
const base = { soilSensorOk: true, soilMoisture: 50, temperature: 28, rainfall: 0, crop: wheat };

test("paused when soil sensor is offline", () => {
  const d = decideIrrigation({ ...base, soilSensorOk: false, soilMoisture: null });
  assert.equal(d.action, "PAUSED");
  assert.equal(d.pumpRecommended, false);
});

test("paused when soil moisture is missing even if flag claims ok", () => {
  assert.equal(decideIrrigation({ ...base, soilMoisture: null }).action, "PAUSED");
});

test("irrigate when below crop minimum and no rain", () => {
  const d = decideIrrigation({ ...base, soilMoisture: 26 });
  assert.equal(d.action, "IRRIGATE");
  assert.equal(d.status, "IRRIGATION REQUIRED");
  assert.equal(d.pumpRecommended, true);
  assert.match(d.reasons.join(" "), /26%.*14 points below.*Wheat minimum of 40%/);
});

test("delay when below minimum but it is raining", () => {
  const d = decideIrrigation({ ...base, soilMoisture: 26, rainfall: 2.4 });
  assert.equal(d.action, "DELAY");
  assert.equal(d.pumpRecommended, false);
  assert.match(d.reasons.join(" "), /2.4 mm/);
});

test("rain below 1 mm does not delay", () => {
  assert.equal(decideIrrigation({ ...base, soilMoisture: 26, rainfall: 0.4 }).action, "IRRIGATE");
});

test("unknown weather still decides on soil, and says so", () => {
  const d = decideIrrigation({ ...base, soilMoisture: 26, rainfall: null });
  assert.equal(d.action, "IRRIGATE");
  assert.match(d.reasons.join(" "), /Weather data unavailable/);
});

test("boundaries: exactly min and exactly max are sufficient", () => {
  assert.equal(decideIrrigation({ ...base, soilMoisture: 40 }).action, "SUFFICIENT");
  assert.equal(decideIrrigation({ ...base, soilMoisture: 60 }).action, "SUFFICIENT");
});

test("above maximum means no irrigation, even when raining", () => {
  assert.equal(decideIrrigation({ ...base, soilMoisture: 75 }).action, "NOT_NEEDED");
  assert.equal(decideIrrigation({ ...base, soilMoisture: 75, rainfall: 5 }).action, "NOT_NEEDED");
});

test("high temperature adds a reason but does not change the action", () => {
  const d = decideIrrigation({ ...base, soilMoisture: 26, temperature: 38 });
  assert.equal(d.action, "IRRIGATE");
  assert.match(d.reasons.join(" "), /38°C/);
  assert.equal(decideIrrigation({ ...base, temperature: 38 }).action, "SUFFICIENT");
});

test("DHT offline does not block a soil-based decision", () => {
  assert.equal(decideIrrigation({ ...base, soilMoisture: 26, temperature: null }).action, "IRRIGATE");
});

test("decision records the crop it was made for", () => {
  const d = decideIrrigation({ ...base, soilMoisture: 26 });
  assert.deepEqual(d.crop, { key: "wheat", name: "Wheat", minMoisture: 40, maxMoisture: 60 });
});
