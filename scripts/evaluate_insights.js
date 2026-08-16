#!/usr/bin/env node
// Evaluate dashboard Insights & Forecast against ThingSpeak history
const fetch = global.fetch || require("node-fetch");

const CONFIG = {
  channelId: "3420273",
  readApiKey: "WZV2KJC22K3ZDNGM",
  sourceField: 2,
  sourceMinRaw: 0,
  sourceMaxRaw: 100,
  sourceInvert: false,
  overheadField: 1,
  overheadMinRaw: 5,
  overheadMaxRaw: 70,
  overheadInvert: true,
};

// Parse CLI args
const argv = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const key = a.replace(/^--/, "");
    const val =
      argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    argMap[key] = val;
  }
}

const RESULTS = parseInt(argMap.results || "100", 10) || 100;
const VERBOSE =
  argMap.verbose === "true" ||
  argMap.verbose === "1" ||
  argMap.verbose === true ||
  !!argMap.verbose;

const scaleValue = (val, min, max, invert) => {
  if (min === max) return 0;
  let percentage = ((val - min) / (max - min)) * 100;
  if (invert) percentage = 100 - percentage;
  return Math.max(0, Math.min(100, Math.round(percentage)));
};

async function fetchHistory(results = RESULTS) {
  const { channelId, readApiKey, sourceField, overheadField } = CONFIG;
  let url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?results=${results}`;
  if (readApiKey) url += `&api_key=${readApiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`ThingSpeak error ${res.status}`);
  const data = await res.json();
  if (!data.feeds || data.feeds.length === 0) throw new Error("No feeds");

  const points = data.feeds
    .map((feed) => {
      const srcRawStr = feed[`field${sourceField}`];
      const ovhRawStr = feed[`field${overheadField}`];
      if (srcRawStr === undefined && ovhRawStr === undefined) return null;
      const srcRaw = srcRawStr !== null ? parseFloat(srcRawStr) : 0;
      const ovhRaw = ovhRawStr !== null ? parseFloat(ovhRawStr) : 0;
      return {
        time: feed.created_at
          ? new Date(feed.created_at).getTime()
          : Date.now(),
        sourceRaw: srcRaw,
        overheadRaw: ovhRaw,
        source: scaleValue(
          srcRaw,
          CONFIG.sourceMinRaw,
          CONFIG.sourceMaxRaw,
          CONFIG.sourceInvert,
        ),
        overhead: scaleValue(
          ovhRaw,
          CONFIG.overheadMinRaw,
          CONFIG.overheadMaxRaw,
          CONFIG.overheadInvert,
        ),
      };
    })
    .filter((p) => p !== null);

  points.reverse(); // oldest -> newest
  // dedupe by timestamp
  const seen = new Set();
  const deduped = [];
  for (const p of points) {
    if (seen.has(p.time)) continue;
    seen.add(p.time);
    deduped.push(p);
  }
  // Ensure chronological order oldest -> newest
  deduped.sort((a, b) => a.time - b.time);
  return deduped;
}

function computeInsights(history) {
  if (!history || history.length < 2) return null;
  const oldest = history[0];
  const newest = history[history.length - 1];
  const spanMs = Math.max(1, newest.time - oldest.time);
  const spanHours = spanMs / (60 * 60 * 1000);
  const tooShort =
    spanMs < 2 * 60 * 1000 ||
    (newest.overhead === oldest.overhead && newest.source === oldest.source);

  const overheadDrop = oldest.overhead - newest.overhead;
  const consumptionRate = tooShort ? 0 : overheadDrop / spanHours;
  const timeToEmptyMs =
    !tooShort && consumptionRate > 0
      ? (newest.overhead / consumptionRate) * (60 * 60 * 1000)
      : Infinity;

  const sourceDrop = oldest.source - newest.source;
  const sourceDrainRate = tooShort ? 0 : sourceDrop / spanHours;
  const timeToDryMs =
    !tooShort && sourceDrainRate > 0
      ? (newest.source / sourceDrainRate) * (60 * 60 * 1000)
      : Infinity;

  return {
    count: history.length,
    spanHours,
    consumptionRatePerHour: consumptionRate,
    timeToEmptyMs,
    sourceDrainRatePerHour: sourceDrainRate,
    timeToDryMs,
    newest: newest.time,
    oldest: oldest.time,
  };
}

function predictHeuristic(recentReadings, weatherForecast) {
  let predictedUsage = 0.15;
  const { temp, humidity, rainProbability } = weatherForecast;
  if (temp > 25) {
    const tempFactor = Math.min((temp - 25) * 0.01, 0.15);
    predictedUsage += tempFactor;
  }
  if (humidity < 40) predictedUsage += 0.05;
  if (rainProbability > 0.5) predictedUsage -= 0.08;

  if (recentReadings.length >= 2) {
    const sorted = [...recentReadings].sort((a, b) => a.time - b.time);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const levelDiff = first.overhead - last.overhead; // positive if dropping
    if (levelDiff > 0) predictedUsage += (levelDiff / 100) * 0.1;
  }

  predictedUsage = Math.max(
    0.0,
    Math.min(1.0, parseFloat(predictedUsage.toFixed(4))),
  );
  return predictedUsage;
}

(async function main() {
  try {
    console.log(`Fetching ThingSpeak history (results=${RESULTS})...`);
    const history = await fetchHistory(RESULTS);
    if (history.length === 0) {
      console.log("No history points returned.");
      return;
    }
    console.log(
      `Loaded ${history.length} points (${new Date(history[0].time).toISOString()} -> ${new Date(history[history.length - 1].time).toISOString()})`,
    );

    if (VERBOSE) {
      console.log("\n--- First 10 points (oldest -> newer) ---");
      history.slice(0, 10).forEach((p, i) => {
        console.log(
          `${i + 1}: ${new Date(p.time).toISOString()} src=${p.source}% ovh=${p.overhead}% rawS=${p.sourceRaw} rawO=${p.overheadRaw}`,
        );
      });
      console.log("\n--- Last 10 points (latest) ---");
      history.slice(-10).forEach((p, i) => {
        const idx = history.length - 10 + i + 1;
        console.log(
          `${idx}: ${new Date(p.time).toISOString()} src=${p.source}% ovh=${p.overhead}% rawS=${p.sourceRaw} rawO=${p.overheadRaw}`,
        );
      });
    }

    const insights = computeInsights(history);
    if (!insights) {
      console.log("Not enough data to compute insights.");
      return;
    }

    // Use a basic weather sample — you can replace this with a real forecast
    const weather = { temp: 30, humidity: 50, rainProbability: 0.2 };

    const predictedUsage = predictHeuristic(history.slice(-8), weather);

    // Print human-friendly report
    console.log("\n--- Insights Report ---");
    console.log(`Readings: ${insights.count}`);
    console.log(`Span (hours): ${insights.spanHours.toFixed(2)}`);
    console.log(
      `Overhead consumption rate: ${insights.consumptionRatePerHour.toFixed(2)} %/hr`,
    );
    console.log(
      `Est. time to empty (overhead): ${isFinite(insights.timeToEmptyMs) ? msToHuman(insights.timeToEmptyMs) : "—"}`,
    );
    console.log(
      `Source drain rate: ${insights.sourceDrainRatePerHour.toFixed(2)} %/hr`,
    );
    console.log(
      `Est. time to dry (source): ${isFinite(insights.timeToDryMs) ? msToHuman(insights.timeToDryMs) : "—"}`,
    );

    console.log("\n--- Forecast (heuristic) ---");
    console.log(
      `Weather sample: temp=${weather.temp}°C humidity=${weather.humidity}% rainProb=${weather.rainProbability}`,
    );
    console.log(
      `Predicted usage next 4 hours: ${(predictedUsage * 100).toFixed(2)}% of capacity`,
    );

    console.log("\n--- Comparison Notes ---");
    console.log(
      "The dashboard insights compute empirical consumption rates and time-to-empty from history.",
    );
    console.log(
      "The heuristic forecast outputs a fraction of capacity expected to be used in the next 4 hours based on temperature, humidity, rain chance and recent overhead trend.",
    );
    console.log(
      "Use a larger history window or a trained ML model to improve forecast accuracy.",
    );
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exitCode = 1;
  }
})();

function msToHuman(ms) {
  if (!isFinite(ms) || ms <= 0) return "—";
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `~${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `~${Math.round(hours)} hr${hours >= 2 ? "s" : ""}`;
  return `~${Math.round(hours / 24)} day${hours >= 48 ? "s" : ""}`;
}
