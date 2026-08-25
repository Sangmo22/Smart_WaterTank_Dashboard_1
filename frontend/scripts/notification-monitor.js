const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const DEFAULTS = {
  THINGSPEAK_CHANNEL_ID: "3420273",
  THINGSPEAK_READ_API_KEY: "WZV2KJC22K3ZDNGM",
  SOURCE_FIELD: "2",
  SOURCE_MIN_RAW: "0",
  SOURCE_MAX_RAW: "100",
  SOURCE_INVERT: "false",
  SOURCE_ALERT_THRESHOLD: "8",
  POLL_INTERVAL_MS: "15000",
  ALERT_REMINDER_MS: "1800000",
  PUSH_FAIL_COOLDOWN_MS: "60000",
};

function loadEnvFile() {
  // Support the repository-level example file as well as a frontend-local file.
  // npm runs this script with `frontend` as the working directory, while the
  // project documentation keeps `.env.local.example` at the repository root.
  const frontendEnvPath = path.resolve(__dirname, "..", ".env.local");
  const repositoryEnvPath = path.resolve(__dirname, "..", "..", ".env.local");
  const envPath = fs.existsSync(frontendEnvPath)
    ? frontendEnvPath
    : repositoryEnvPath;

  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^"|"$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

// Pushes are sent by shelling out to curl.exe because Node's fetch/https
// request bodies get mangled in transit to exp.host on some machines with
// TLS-inspecting security software (bodies arrive at Expo missing fields).
function postJsonViaCurl(url, body) {
  return new Promise((resolve, reject) => {
    const args = [
      "-s",
      "-H", "Content-Type: application/json",
      "-X", "POST",
      url,
      "-d", JSON.stringify(body),
    ];
    execFile(
      "curl.exe",
      args,
      { windowsHide: true, timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`curl failed: ${err.message}${stderr ? ` ${stderr}` : ""}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`Unexpected Expo response: ${String(stdout).slice(0, 200)}`));
        }
      },
    );
  });
}

function getConfig() {
  const env = { ...DEFAULTS, ...process.env };
  return {
    expoPushToken: env.EXPO_PUSH_TOKEN,
    channelId: env.THINGSPEAK_CHANNEL_ID,
    readApiKey: env.THINGSPEAK_READ_API_KEY,
    sourceField: Number(env.SOURCE_FIELD),
    sourceMinRaw: Number(env.SOURCE_MIN_RAW),
    sourceMaxRaw: Number(env.SOURCE_MAX_RAW),
    sourceInvert: env.SOURCE_INVERT === "true",
    threshold: Number(env.SOURCE_ALERT_THRESHOLD),
    pollIntervalMs: Number(env.POLL_INTERVAL_MS),
    reminderMs: Number(env.ALERT_REMINDER_MS),
    failCooldownMs: Number(env.PUSH_FAIL_COOLDOWN_MS),
  };
}

function scaleValue(value, min, max, invert) {
  if (min === max) return 0;

  let percentage = ((value - min) / (max - min)) * 100;
  if (invert) {
    percentage = 100 - percentage;
  }

  return Math.max(0, Math.min(100, Math.round(percentage)));
}

async function fetchSourceLevel(config) {
  const url = new URL(
    `https://api.thingspeak.com/channels/${config.channelId}/feeds.json`,
  );
  url.searchParams.set("results", "25");
  if (config.readApiKey) {
    url.searchParams.set("api_key", config.readApiKey);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ThingSpeak error: ${response.status}`);
  }

  const payload = await response.json();
  const feeds = payload.feeds;
  if (!feeds || feeds.length === 0) {
    throw new Error("ThingSpeak returned no feed data.");
  }

  // Find the newest entry with a non-null source field. Pump-command rows
  // write only field3 (pump on/off) and leave sensor fields null.
  const sourceField = `field${config.sourceField}`;
  const MAX_DELTA = 10; // percentage points — skip glitched readings
  const complete = feeds.filter(
    (f) => f[sourceField] !== null && f[sourceField] !== undefined && f[sourceField] !== "",
  );

  if (complete.length === 0) {
    throw new Error(`No non-null source readings in the last ${feeds.length} entries.`);
  }

  let feed = complete[complete.length - 1];

  // If the newest reading jumped by more than MAX_DELTA from the previous
  // one, it's likely a sensor glitch — fall back to the previous entry.
  if (complete.length >= 2) {
    const lastRaw = Number(feed[sourceField]);
    const prevRaw = Number(complete[complete.length - 2][sourceField]);
    if (Math.abs(lastRaw - prevRaw) > MAX_DELTA) {
      feed = complete[complete.length - 2];
    }
  }

  const raw = Number(feed[sourceField] ?? 0);
  const level = scaleValue(
    raw,
    config.sourceMinRaw,
    config.sourceMaxRaw,
    config.sourceInvert,
  );

  return {
    raw,
    level,
    updatedAt: feed.created_at,
  };
}

async function sendExpoPush(config, source) {
  // `sound` must be omitted or a string ("default") — the boolean form is no
  // longer accepted by the Expo push API. On Android, sound/vibration come
  // from the "water-alerts" channel the app creates.
  const message = {
    to: config.expoPushToken,
    title: "Source tank critically low",
    body: `Source tank is at ${source.level}%. Refill before the pump runs dry.`,
    data: {
      type: "source-low",
      sourceLevel: source.level,
      sourceRaw: source.raw,
      updatedAt: source.updatedAt,
    },
    channelId: "water-alerts",
    priority: "high",
  };

  const payload = await postJsonViaCurl(
    "https://exp.host/--/api/v2/push/send",
    message,
  );

  if (payload.errors?.length) {
    throw new Error(`Expo request error: ${payload.errors[0].message ?? payload.errors[0].code}`);
  }

  const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!ticket || ticket.status !== "ok") {
    throw new Error(ticket?.message || "Expo push ticket error.");
  }

  return ticket;
}

async function main() {
  const config = getConfig();

  if (!config.expoPushToken) {
    console.warn(
      "Warning: Missing EXPO_PUSH_TOKEN. Push notifications will be skipped.",
    );
  }

  let wasCritical = false;
  let lastSentAt = 0;
  let lastFailedAttemptAt = 0;

  console.log(
    `Monitoring ThingSpeak channel ${config.channelId}, field ${config.sourceField}, threshold < ${config.threshold}%`,
  );

  async function tick() {
    try {
      const source = await fetchSourceLevel(config);
      const now = Date.now();

      const isCritical = source.level < config.threshold;

      console.log(
        `[${new Date().toLocaleString()}] Source ${source.level}% (${source.raw} raw)`,
      );

      if (isCritical && config.expoPushToken) {
        const reminderDue =
          !wasCritical || now - lastSentAt >= config.reminderMs;
        const cooldownOver =
          now - lastFailedAttemptAt >= config.failCooldownMs;

        if (reminderDue && cooldownOver) {
          try {
            await sendExpoPush(config, source);
            lastSentAt = now;
            console.log("Push notification sent.");
          } catch (error) {
            lastFailedAttemptAt = now;
            console.error(`Push send failed: ${error.message}`);
          }
        }
      }

      wasCritical = isCritical;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
