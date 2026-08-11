import { useCallback, useEffect, useState } from "react";
import { ThingSpeakConfig, scaleValue } from "@/hooks/use-thingspeak";

export interface TankHistoryPoint {
  time: number; // epoch ms
  source: number; // 0 - 100
  overhead: number; // 0 - 100
  sourceRaw: number;
  overheadRaw: number;
}

interface UseThingSpeakHistoryResult {
  history: TankHistoryPoint[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isDemoMode: boolean;
}

/**
 * Fetches the last `results` ThingSpeak feed entries for the active config
 * and converts raw sensor values into 0-100 percentages using the same
 * calibration settings as the live dashboard.
 */
export function useThingSpeakHistory(
  config: ThingSpeakConfig,
  results = 100,
): UseThingSpeakHistoryResult {
  const [history, setHistory] = useState<TankHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    // Demo mode has no live feed to fetch
    if (config.isDemoMode) {
      setHistory([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const {
        channelId,
        readApiKey,
        sourceField,
        overheadField,
        sourceMinRaw,
        sourceMaxRaw,
        sourceInvert,
        overheadMinRaw,
        overheadMaxRaw,
        overheadInvert,
      } = config;

      let url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?results=${results}`;
      if (readApiKey) {
        url += `&api_key=${readApiKey}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `ThingSpeak API error: ${response.status} ${response.statusText}`,
        );
      }

      const resData = await response.json();
      if (!resData.feeds || resData.feeds.length === 0) {
        throw new Error("No feed data found for this channel.");
      }

      const points: TankHistoryPoint[] = resData.feeds
        .map((feed: any) => {
          const sourceRawValStr = feed[`field${sourceField}`];
          const overheadRawValStr = feed[`field${overheadField}`];
          if (
            sourceRawValStr === undefined &&
            overheadRawValStr === undefined
          ) {
            return null;
          }
          const sourceRaw =
            sourceRawValStr !== null ? parseFloat(sourceRawValStr) : 0;
          const overheadRaw =
            overheadRawValStr !== null ? parseFloat(overheadRawValStr) : 0;
          return {
            time: feed.created_at
              ? new Date(feed.created_at).getTime()
              : Date.now(),
            source: scaleValue(
              sourceRaw,
              sourceMinRaw,
              sourceMaxRaw,
              sourceInvert,
            ),
            overhead: scaleValue(
              overheadRaw,
              overheadMinRaw,
              overheadMaxRaw,
              overheadInvert,
            ),
            sourceRaw,
            overheadRaw,
          };
        })
        .filter((point: any) => point !== null);

      // ThingSpeak returns newest-first; reverse to oldest -> newest
      points.reverse();

      // Deduplicate points that share the same timestamp so rate/trend
      // calculations aren't skewed by near-identical created_at values.
      const seen = new Set<number>();
      const deduped: TankHistoryPoint[] = [];
      for (const point of points) {
        if (seen.has(point.time)) continue;
        seen.add(point.time);
        deduped.push(point);
      }

      setHistory(deduped);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch ThingSpeak history");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [config, results]);

  useEffect(() => {
    // Defer the first fetch so we don't call setState synchronously inside
    // the effect body (avoids cascading renders and satisfies lint rules).
    const timer = setTimeout(() => {
      fetchHistory();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchHistory]);

  return {
    history,
    loading,
    error,
    refresh: fetchHistory,
    isDemoMode: config.isDemoMode,
  };
}
