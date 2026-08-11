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
  pollingIntervalMs: 15000,

  // Source Tank → Field 2
  sourceField: 2,
  sourceMinRaw: 0,
  sourceMaxRaw: 100,
  sourceInvert: false,

  // Overhead Tank → Field 1 (distance sensor: lower value = more water, higher = empty)
  // Observed range: ~10 (full) to ~66 (empty)
  overheadField: 1,
  overheadMinRaw: 5,
  overheadMaxRaw: 70,
  overheadInvert: true,
};

const STORAGE_KEY = "water_tank_dashboard_config";
// Bump this version whenever field assignments or raw ranges change
// so cached configs automatically pick up the new sensor defaults.
const CONFIG_VERSION = 3;
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

          let merged = loaded;
          if (savedVersion < CONFIG_VERSION) {
            // Preserve user-set channelId, readApiKey, isDemoMode, pollingIntervalMs
            // but reset all sensor field/range values to the latest defaults
            merged = {
              ...loaded,
              sourceField: DEFAULT_CONFIG.sourceField,
              sourceMinRaw: DEFAULT_CONFIG.sourceMinRaw,
              sourceMaxRaw: DEFAULT_CONFIG.sourceMaxRaw,
              sourceInvert: DEFAULT_CONFIG.sourceInvert,
              overheadField: DEFAULT_CONFIG.overheadField,
              overheadMinRaw: DEFAULT_CONFIG.overheadMinRaw,
              overheadMaxRaw: DEFAULT_CONFIG.overheadMaxRaw,
              overheadInvert: DEFAULT_CONFIG.overheadInvert,
            };
            // Save merged config and updated version
            const jsonStr = JSON.stringify(merged);
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
        let url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?results=1`;
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

        const feed = resData.feeds[0];
        const channelInfo = resData.channel || {};

        const sourceRawValStr = feed[`field${sourceField}`];
        const overheadRawValStr = feed[`field${overheadField}`];

        if (sourceRawValStr === undefined && overheadRawValStr === undefined) {
          throw new Error(
            `Fields ${sourceField} and ${overheadField} are not in the response feed.`,
          );
        }

        const sourceRaw =
          sourceRawValStr !== null ? parseFloat(sourceRawValStr) : 0;
        const overheadRaw =
          overheadRawValStr !== null ? parseFloat(overheadRawValStr) : 0;

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
          lastUpdated: feed.created_at ? new Date(feed.created_at) : new Date(),
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
