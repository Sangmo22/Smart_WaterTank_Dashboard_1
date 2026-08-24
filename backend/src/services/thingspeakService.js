// Service for forwarding pump commands to ThingSpeak.
// ThingSpeak free tier rejects updates less than ~15s apart (HTTP 413 or entry_id 0),
// so failures are reported back to the caller instead of throwing.

const THINGSPEAK_UPDATE_URL = 'https://api.thingspeak.com/update.json';
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Forward a pump command to the physical device via a ThingSpeak channel field.
 * @param {0|1} state Pump command: 1 = ON, 0 = OFF
 * @returns {Promise<{forwarded: boolean, entryId?: number, error?: string}>}
 */
const sendPumpCommand = async (state) => {
  const writeKey = process.env.THINGSPEAK_WRITE_KEY;
  const pumpField = process.env.THINGSPEAK_PUMP_FIELD || '3';

  if (!writeKey) {
    return { forwarded: false, error: 'THINGSPEAK_WRITE_KEY is not configured on the server' };
  }

  if (!/^[1-8]$/.test(String(pumpField))) {
    return { forwarded: false, error: `Invalid THINGSPEAK_PUMP_FIELD: ${pumpField}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(THINGSPEAK_UPDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: writeKey,
        [`field${pumpField}`]: String(state)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        forwarded: false,
        error: `ThingSpeak responded with status ${response.status}${
          response.status === 413 ? ' (free-tier limit: max one update every 15s)' : ''
        }`
      };
    }

    const raw = await response.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // fall through to the rejection branches below
    }

    // entry_id of 0 means ThingSpeak accepted the request but discarded
    // the update (usually rate limiting).
    if (data && data.entry_id === 0) {
      return {
        forwarded: false,
        error:
          'ThingSpeak discarded the update - most likely the free-tier 15s rate limit. Try again shortly.'
      };
    }

    if (!data || typeof data.entry_id !== 'number') {
      return {
        forwarded: false,
        error: `Unexpected response from ThingSpeak (status ${response.status}): ${raw.slice(0, 140)}`
      };
    }

    return { forwarded: true, entryId: data.entry_id };
  } catch (err) {
    const message =
      err.name === 'AbortError'
        ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s while contacting ThingSpeak`
        : `Failed to reach ThingSpeak: ${err.message}`;
    return { forwarded: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { sendPumpCommand };
