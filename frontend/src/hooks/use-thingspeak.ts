import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";

export interface ThingSpeakConfig {
  channelId: string;
  readApiKey: string;
  isDemoMode: boolean;
  pollingIntervalMs: number;

  // Source Tank
  sourceField: number;
  sourceMinRaw: number;
  sourceMaxRaw: number;
  sourceInvert: boolean;

  // Overhead Tank
  overheadField: number;
  overheadMinRaw: number;
  overheadMaxRaw: number;
  overheadInvert: boolean;
}

export interface TankData {
  sourceLevel: number; // 0 - 100
  sourceRaw: number;
  overheadLevel: number; // 0 - 100
  overheadRaw: number;
  lastUpdated: Date | null;
  channelName: string;
}

export const DEFAULT_CONFIG: ThingSpeakConfig = {
  channelId: "3420273",
  readApiKey: "WZV2KJC22K3ZDNGM",
  isDemoMode: false,
  pollingIntervalMs: 20000,

  // Source Tank → Field 2
  sourceField: 2,
  sourceMinRaw: 0,
  sourceMaxRaw: 100,
  sourceInvert: false,

  // Overhead Tank → Field 1
  // Arduino already converts distance readings to percentage before publishing,
  // so both fields are pass-through (raw value = fill %).
  overheadField: 1,
  overheadMinRaw: 0,
  overheadMaxRaw: 100,
  overheadInvert: false,
};

const STORAGE_KEY = "water_tank_dashboard_config";
// Bump this version whenever field assignments or raw ranges change
// so cached configs automatically pick up the new sensor defaults.
const CONFIG_VERSION = 6;
const CONFIG_VERSION_KEY = "water_tank_dashboard_config_version";

// Helper to scale values to percentage (0 - 100)
export const scaleValue = (
  val: number,
  min: number,
  max: number,
  invert: boolean,
): number => {
  if (min === max) return 0;
  let percentage = ((val - min) / (max - min)) * 100;
  if (invert) {
    percentage = 100 - percentage;
  }
  return Math.max(0, Math.min(100, Math.round(percentage)));
};

export function useThingSpeak() {
  const [config, setConfig] = useState<ThingSpeakConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const [data, setData] = useState<TankData>({
    sourceLevel: 75,
    sourceRaw: 75,
    overheadLevel: 40,
    overheadRaw: 40,
    lastUpdated: null,
    channelName: "Demo Water Tank Feed",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simulation state
  const [simulatedLevels, setSimulatedLevels] = useState({
    source: 75,
    overhead: 40,
  });
  const [isSimulatingFlow, setIsSimulatingFlow] = useState(false);

  const simFlowIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load configuration on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        let savedConfigStr = null;
        if (Platform.OS === "web") {
          savedConfigStr = localStorage.getItem(STORAGE_KEY);
        } else {
          savedConfigStr = await AsyncStorage.getItem(STORAGE_KEY);
        }

        if (savedConfigStr) {
          const loaded = JSON.parse(savedConfigStr) as ThingSpeakConfig;

          // Check if config version matches; if not, reset field/range defaults
          let savedVersion = 0;
          try {
            const vStr = Platform.OS === "web"
              ? localStorage.getItem(CONFIG_VERSION_KEY)
              : await AsyncStorage.getItem(CONFIG_VERSION_KEY);
            savedVersion = vStr ? parseInt(vStr, 10) : 0;
          } catch {}

          // Always enforce correct field mappings — these are defined by the
          // Arduino firmware (field1=overhead, field2=source) and must never
          // be overridden by stale localStorage values.
          let merged: ThingSpeakConfig = {
            ...loaded,
            sourceField: DEFAULT_CONFIG.sourceField,
            overheadField: DEFAULT_CONFIG.overheadField,
          };

          if (savedVersion < CONFIG_VERSION) {
            // On version bumps, also reset raw ranges and invert flags to
            // the latest sane defaults.
            merged = {
              ...merged,
              sourceMinRaw: DEFAULT_CONFIG.sourceMinRaw,
              sourceMaxRaw: DEFAULT_CONFIG.sourceMaxRaw,
              sourceInvert: DEFAULT_CONFIG.sourceInvert,
              overheadMinRaw: DEFAULT_CONFIG.overheadMinRaw,
              overheadMaxRaw: DEFAULT_CONFIG.overheadMaxRaw,
              overheadInvert: DEFAULT_CONFIG.overheadInvert,
            };
          }

          // Persist if anything changed
          const jsonStr = JSON.stringify(merged);
          if (jsonStr !== savedConfigStr) {
            if (Platform.OS === "web") {
              localStorage.setItem(STORAGE_KEY, jsonStr);
              localStorage.setItem(CONFIG_VERSION_KEY, String(CONFIG_VERSION));
            } else {
              await AsyncStorage.setItem(STORAGE_KEY, jsonStr);
              await AsyncStorage.setItem(CONFIG_VERSION_KEY, String(CONFIG_VERSION));
            }
          }

          setConfig(merged);
          // Set initial simulation values from saved config min/max middle range
          if (merged.isDemoMode) {
            setSimulatedLevels({
              source: Math.round(
                (merged.sourceMaxRaw + merged.sourceMinRaw) / 2,
              ),
              overhead: Math.round(
                (merged.overheadMaxRaw + merged.overheadMinRaw) / 2,
              ),
            });
          }
        }
      } catch (e) {
        console.error("Failed to load ThingSpeak config", e);
      } finally {
        setIsLoaded(true);
      }
    }
    loadConfig();
  }, []);

  // Save configuration
  const updateConfig = async (newConfig: Partial<ThingSpeakConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);

    // Stop flow simulation if we switch out of demo mode
    if (updated.isDemoMode === false && isSimulatingFlow) {
      stopSimulatedFlow();
    }

    try {
      const jsonStr = JSON.stringify(updated);
      if (Platform.OS === "web") {
        localStorage.setItem(STORAGE_KEY, jsonStr);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY, jsonStr);
      }
    } catch (e) {
      console.error("Failed to save ThingSpeak config", e);
    }
  };

  // Fetch from ThingSpeak
  const fetchThingSpeakData = useCallback(
    async (currentConfig: ThingSpeakConfig) => {
      if (currentConfig.isDemoMode) return;

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
        } = currentConfig;
        // Fetch several entries: pump-command writes create rows where the
        // sensor fields are null, so the newest row alone can be incomplete.
        let url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?results=25`;
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

        const feeds: Record<string, any>[] = resData.feeds;
        const channelInfo = resData.channel || {};

        // Find the NEWEST feed row where BOTH sensor fields are present.
        // Pump-command rows only write field3 (pump on/off) and leave
        // field1/field2 null. Using a single row ensures source and overhead
        // are from the exact same timestamp — avoids the mismatch where each
        // field independently picks a different (stale) row.
        let matchedEntry: Record<string, any> | null = null;
        for (const entry of feeds) {
          const srcRaw = entry[`field${sourceField}`];
          const ovhRaw = entry[`field${overheadField}`];
          const srcOk = srcRaw !== null && srcRaw !== undefined && srcRaw !== "";
          const ovhOk = ovhRaw !== null && ovhRaw !== undefined && ovhRaw !== "";
          if (srcOk && ovhOk) {
            matchedEntry = entry;
            break;
          }
        }

        if (!matchedEntry) {
          // Fallback: try each field independently if no complete row exists
          const latestForField = (
            fieldNum: number,
          ): { value: number; createdAt: string | null } | null => {
            for (const entry of feeds) {
              const raw = entry[`field${fieldNum}`];
              if (raw !== null && raw !== undefined && raw !== "") {
                return { value: parseFloat(raw), createdAt: entry.created_at ?? null };
              }
            }
            return null;
          };
          const sourceReading = latestForField(sourceField);
          const overheadReading = latestForField(overheadField);
          if (!sourceReading && !overheadReading) {
            throw new Error(
              `Fields ${sourceField} and ${overheadField} have no data in the recent feed.`,
            );
          }
          const sourceRaw = sourceReading?.value ?? 0;
          const overheadRaw = overheadReading?.value ?? 0;
          const readingTimestamps = [
            sourceReading?.createdAt,
            overheadReading?.createdAt,
          ].filter((t): t is string => t !== null);
          const lastUpdatedStr =
            readingTimestamps.length > 0
              ? readingTimestamps.sort().reverse()[0]
              : feeds[0].created_at;

          const sourceLevel = scaleValue(
            sourceRaw,
            sourceMinRaw,
            sourceMaxRaw,
            sourceInvert,
          );
          const overheadLevel = scaleValue(
            overheadRaw,
            overheadMinRaw,
            overheadMaxRaw,
            overheadInvert,
          );

          setData({
            sourceLevel,
            sourceRaw,
            overheadLevel,
            overheadRaw,
            lastUpdated: lastUpdatedStr ? new Date(lastUpdatedStr) : new Date(),
            channelName: channelInfo.name || `Channel ${channelId}`,
          });
          return;
        }

        const sourceRaw = parseFloat(matchedEntry[`field${sourceField}`]);
        const overheadRaw = parseFloat(matchedEntry[`field${overheadField}`]);
        const lastUpdatedStr = matchedEntry.created_at;

        const sourceLevel = scaleValue(
          sourceRaw,
          sourceMinRaw,
          sourceMaxRaw,
          sourceInvert,
        );
        const overheadLevel = scaleValue(
          overheadRaw,
          overheadMinRaw,
          overheadMaxRaw,
          overheadInvert,
        );

        setData({
          sourceLevel,
          sourceRaw,
          overheadLevel,
          overheadRaw,
          lastUpdated: lastUpdatedStr ? new Date(lastUpdatedStr) : new Date(),
          channelName: channelInfo.name || `Channel ${channelId}`,
        });
      } catch (err: any) {
        setError(err?.message || "Failed to fetch data from ThingSpeak");
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Set up polling or simulation update loop
  useEffect(() => {
    if (!isLoaded) return;

    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (config.isDemoMode) {
      // In demo mode, data is bound to simulation state
      const sourceLevel = scaleValue(
        simulatedLevels.source,
        config.sourceMinRaw,
        config.sourceMaxRaw,
        config.sourceInvert,
      );
      const overheadLevel = scaleValue(
        simulatedLevels.overhead,
        config.overheadMinRaw,
        config.overheadMaxRaw,
        config.overheadInvert,
      );

      setData({
        sourceLevel,
        sourceRaw: simulatedLevels.source,
        overheadLevel,
        overheadRaw: simulatedLevels.overhead,
        lastUpdated: new Date(),
        channelName: "Demo Water Tank Feed",
      });
    } else {
      // Live mode: fetch immediately then poll
      fetchThingSpeakData(config);

      if (config.pollingIntervalMs > 0) {
        pollIntervalRef.current = setInterval(() => {
          fetchThingSpeakData(config);
        }, config.pollingIntervalMs);
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isLoaded, config, fetchThingSpeakData, simulatedLevels]);

  // Flow simulation effect
  const startSimulatedFlow = useCallback(() => {
    if (!config.isDemoMode) return;

    setIsSimulatingFlow(true);

    if (simFlowIntervalRef.current) clearInterval(simFlowIntervalRef.current);

    simFlowIntervalRef.current = setInterval(() => {
      setSimulatedLevels((prev) => {
        const sourceStep = 1;
        const overheadStep = 1.5;

        // We simulate pumping water: Source level decreases, Overhead level increases
        let nextSource = prev.source;
        let nextOverhead = prev.overhead;

        const sourceRange = Math.abs(config.sourceMaxRaw - config.sourceMinRaw);
        const overheadRange = Math.abs(
          config.overheadMaxRaw - config.overheadMinRaw,
        );

        const sourceDelta = (sourceRange * sourceStep) / 100;
        const overheadDelta = (overheadRange * overheadStep) / 100;

        // Decrement source (respecting direction of range)
        if (config.sourceMaxRaw > config.sourceMinRaw) {
          nextSource = Math.max(config.sourceMinRaw, prev.source - sourceDelta);
        } else {
          nextSource = Math.min(config.sourceMinRaw, prev.source + sourceDelta);
        }

        // Increment overhead (respecting direction of range)
        if (config.overheadMaxRaw > config.overheadMinRaw) {
          nextOverhead = Math.min(
            config.overheadMaxRaw,
            prev.overhead + overheadDelta,
          );
        } else {
          nextOverhead = Math.max(
            config.overheadMaxRaw,
            prev.overhead - overheadDelta,
          );
        }

        const reachedLimits =
          (config.sourceMaxRaw > config.sourceMinRaw
            ? nextSource <= config.sourceMinRaw
            : nextSource >= config.sourceMinRaw) ||
          (config.overheadMaxRaw > config.overheadMinRaw
            ? nextOverhead >= config.overheadMaxRaw
            : nextOverhead <= config.overheadMaxRaw);

        if (reachedLimits) {
          // Auto stop when empty/full
          if (simFlowIntervalRef.current) {
            clearInterval(simFlowIntervalRef.current);
            simFlowIntervalRef.current = null;
          }
          setIsSimulatingFlow(false);
        }

        return {
          source: parseFloat(nextSource.toFixed(1)),
          overhead: parseFloat(nextOverhead.toFixed(1)),
        };
      });
    }, 500);
  }, [config]);

  const stopSimulatedFlow = useCallback(() => {
    if (simFlowIntervalRef.current) {
      clearInterval(simFlowIntervalRef.current);
      simFlowIntervalRef.current = null;
    }
    setIsSimulatingFlow(false);
  }, []);

  const manualRefresh = useCallback(() => {
    if (!config.isDemoMode) {
      return fetchThingSpeakData(config);
    }
    return Promise.resolve();
  }, [config, fetchThingSpeakData]);

  // Handle cleanup of timers on unmount
  useEffect(() => {
    return () => {
      if (simFlowIntervalRef.current) clearInterval(simFlowIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Update simulation level manually
  const updateSimulatedLevel = useCallback(
    (tank: "source" | "overhead", value: number) => {
      setSimulatedLevels((prev) => ({
        ...prev,
        [tank]: value,
      }));
    },
    [],
  );

  return {
    config,
    isLoaded,
    updateConfig,
    data,
    loading,
    error,
    refresh: manualRefresh,
    simulatedLevels,
    updateSimulatedLevel,
    isSimulatingFlow,
    startSimulatedFlow,
    stopSimulatedFlow,
  };
}
