import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";

import { BottomTabInset, Spacing, Colors } from "@/constants/theme";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { WaterTank } from "@/components/water-tank";
import { DashboardSettings } from "@/components/dashboard-settings";
import { useThingSpeak } from "@/hooks/use-thingspeak";
import { useThingSpeakHistory } from "@/hooks/use-thingspeak-history";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { alertsStore } from "@/state/alerts-store";


interface LogEvent {
  id: string;
  time: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
}

interface HistoryPoint {
  time: number;
  source: number;
  overhead: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const scheme = useColorScheme();
  const themeScheme =
    scheme === "dark" ? ("dark" as const) : ("light" as const);
  const theme = Colors[themeScheme];

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(isWeb);
  const [activeSection, setActiveSection] = useState<
    "dashboard" | "analytics" | "alerts" | "pump-settings" | "settings"
  >("dashboard");
  const [chartHistory, setChartHistory] = useState<HistoryPoint[]>([]);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [, setEvents] = useState<LogEvent[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    source: number;
    overhead: number;
    time: number;
  } | null>(null);
  usePushNotifications();

  // Track previous warning levels to avoid redundant log spam
  const prevLevelsRef = useRef({ source: 50, overhead: 50, flowState: false });


  const {
    config,
    isLoaded,
    updateConfig,
    data,
    loading,
    error,
    simulatedLevels,
    updateSimulatedLevel,
    isSimulatingFlow,
    startSimulatedFlow,
    stopSimulatedFlow,
  } = useThingSpeak();

  // Seed the history chart with the last 24 hours of ThingSpeak data
  const { history: seededHistory } = useThingSpeakHistory(config, 8000, 1440);

  // Helper to add events to list
  const addEvent = useCallback(
    (message: string, type: LogEvent["type"] = "info") => {
      const timeStr = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const id = Math.random().toString();
      setEvents((prev) => [
        { id, time: timeStr, message, type },
        ...prev.slice(0, 19), // Keep last 20 events
      ]);

      // Only push to global alerts list if it's a source tank empty/critical low alert
      const isSourceTankEmptyAlert =
        message.toLowerCase().includes("source tank") &&
        (message.toLowerCase().includes("critical") ||
          message.toLowerCase().includes("dry"));

      if (isSourceTankEmptyAlert) {
        alertsStore.add({
          id,
          time: timeStr,
          message,
          type,
        } as any);

      }
    },
    [],
  );

  // Add initial event
  useEffect(() => {
    if (!isLoaded) return;

    const timer = setTimeout(() => {
      addEvent(
        config.isDemoMode
          ? "System started in Demo/Simulation Mode."
          : `Connected to ThingSpeak Channel ${config.channelId}`,
        config.isDemoMode ? "info" : "success",
      );
    }, 0);

    return () => clearTimeout(timer);
  }, [isLoaded, config.isDemoMode, config.channelId, addEvent]);

  // Log events on state changes
  useEffect(() => {
    if (!isLoaded) return;

    const sourceVal = data.sourceLevel;
    const overheadVal = data.overheadLevel;
    const isFlowing = isSimulatingFlow;
    const queuedEvents: {
      message: string;
      type: LogEvent["type"];
    }[] = [];

    const prev = prevLevelsRef.current;

    // Check Source Tank Level Transitions
    if (sourceVal < 8 && prev.source >= 8) {
      queuedEvents.push({
        message: "Source Tank Level CRITICAL LOW (<8%)",
        type: "error",
      });
    } else if (sourceVal <= 10 && prev.source > 10) {
      queuedEvents.push({
        message: "Source Tank Level critical low (<10%)",
        type: "error",
      });
    } else if (sourceVal <= 30 && prev.source > 30) {
      queuedEvents.push({
        message: "Source Tank Level warning: Low water (30%)",
        type: "warning",
      });
    } else if (sourceVal >= 95 && prev.source < 95) {
      queuedEvents.push({
        message: "Source Tank is FULL (95%+)",
        type: "success",
      });
    }

    // Check Overhead Tank Level Transitions
    if (overheadVal <= 10 && prev.overhead > 10) {
      queuedEvents.push({
        message: "Overhead Tank Level CRITICAL EMPTY (<10%)",
        type: "error",
      });
    } else if (overheadVal <= 25 && prev.overhead > 25) {
      queuedEvents.push({
        message: "Overhead Tank Level warning: Low level (25%)",
        type: "warning",
      });
    } else if (overheadVal >= 95 && prev.overhead < 95) {
      queuedEvents.push({
        message: "Overhead Tank is FULL (95%+)",
        type: "success",
      });
    }

    // Check Flow simulation transitions
    if (isFlowing && !prev.flowState) {
      queuedEvents.push({
        message: "Water transfer pump STARTED.",
        type: "success",
      });
    } else if (!isFlowing && prev.flowState) {
      queuedEvents.push({
        message: "Water transfer pump STOPPED.",
        type: "info",
      });
      // If stopped due to empty source
      if (sourceVal <= config.sourceMinRaw) {
        queuedEvents.push({
          message: "Pump shut down: Source Tank is dry!",
          type: "error",
        });
      } else if (overheadVal >= config.overheadMaxRaw) {
        queuedEvents.push({
          message: "Pump shut down: Overhead Tank is full!",
          type: "success",
        });
      }
    }

    prevLevelsRef.current = {
      source: sourceVal,
      overhead: overheadVal,
      flowState: isFlowing,
    };

    if (queuedEvents.length) {
      setTimeout(() => {
        for (const event of queuedEvents) {
          addEvent(event.message, event.type);
        }
      }, 0);
    }
  }, [
    data.sourceLevel,
    data.overheadLevel,
    isSimulatingFlow,
    isLoaded,
    config.sourceMinRaw,
    config.overheadMaxRaw,
    addEvent,
  ]);

  const sourceLowNotificationShown = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (data.sourceLevel >= 8) {
      sourceLowNotificationShown.current = false;
      return;
    }

    if (sourceLowNotificationShown.current) return;
    sourceLowNotificationShown.current = true;

    if (Platform.OS !== "web") return;

    const BrowserNotification = (globalThis as any).Notification;
    if (!BrowserNotification) return;

    const showNotification = () => {
      new BrowserNotification("Source tank critically low", {
        body: `Source tank is at ${data.sourceLevel}%. Refill before the pump runs dry.`,
      });
    };

    if (BrowserNotification.permission === "granted") {
      showNotification();
    } else if (BrowserNotification.permission !== "denied") {
      BrowserNotification.requestPermission().then((permission: string) => {
        if (permission === "granted") {
          showNotification();
        }
      });
    }
  }, [data.sourceLevel, isLoaded]);



  useEffect(() => {
    if (!isLoaded || !data.lastUpdated) return;

    const timestamp = data.lastUpdated.getTime();
    const timer = setTimeout(() => {
      setChartHistory((prev) => {
        // Merge through a Map keyed by timestamp so out-of-order or repeated
        // poll responses can never create duplicate chart points.
        const cutoff = timestamp - 24 * 60 * 60 * 1000;
        const byTime = new Map<number, HistoryPoint>();
        for (const point of prev) {
          if (point.time >= cutoff) byTime.set(point.time, point);
        }
        const last = prev[prev.length - 1];
        if (!last || last.time !== timestamp) {
          byTime.set(timestamp, {
            time: timestamp,
            source: data.sourceLevel,
            overhead: data.overheadLevel,
          });
        }
        return [...byTime.values()]
          .sort((a, b) => a.time - b.time)
          .slice(-2000);
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [isLoaded, data.lastUpdated, data.sourceLevel, data.overheadLevel]);

  // Merge fetched ThingSpeak history into the chart (live points win on
  // identical timestamps). Runs when the seed arrives or the config changes.
  useEffect(() => {
    if (!isLoaded || seededHistory.length === 0) return;

    const timer = setTimeout(() => {
      setChartHistory((prev) => {
        const byTime = new Map<number, HistoryPoint>();
        for (const point of prev) {
          byTime.set(point.time, point);
        }
        for (const point of seededHistory) {
          byTime.set(point.time, {
            time: point.time,
            source: point.source,
            overhead: point.overhead,
          });
        }
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        return [...byTime.values()]
          .filter((point) => point.time >= cutoff)
          .sort((a, b) => a.time - b.time)
          .slice(-2000);
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [isLoaded, seededHistory]);

  // Downsample to ~24 evenly spaced points so one day of data fits the chart.
  // The rightmost point is always overridden with the current live values so
  // the chart's latest reading matches the tank display (the history seed and
  // live poll can disagree because the live hook picks the latest non-null
  // value per field independently while history rows require both fields).
  const displayPoints = useMemo<HistoryPoint[]>(() => {
    const maxPoints = 24;
    let points = chartHistory;
    if (points.length > maxPoints) {
      const out: HistoryPoint[] = [];
      for (let i = 0; i < maxPoints; i++) {
        const index = Math.round(
          (i * (points.length - 1)) / (maxPoints - 1),
        );
        out.push(points[index]);
      }
      points = out;
    }
    if (points.length > 0 && data.lastUpdated) {
      const last = points[points.length - 1];
      if (
        last.source !== data.sourceLevel ||
        last.overhead !== data.overheadLevel
      ) {
        points = points.slice(0, -1);
        points.push({
          time: last.time,
          source: data.sourceLevel,
          overhead: data.overheadLevel,
        });
      }
    }
    return points;
  }, [chartHistory, data.sourceLevel, data.overheadLevel, data.lastUpdated]);

  // Handle configuration saving
  const handleSaveConfig = async (newConfig: any) => {
    await updateConfig(newConfig);
    addEvent(
      newConfig.isDemoMode
        ? "Settings saved. Switched to Simulation Mode."
        : `Settings saved. Switched to ThingSpeak Channel ${newConfig.channelId}`,
      "success",
    );
  };

  // Preset Adjusters for Demo Mode
  const setTankPreset = (tank: "source" | "overhead", levelPercent: number) => {
    const minVal =
      tank === "source" ? config.sourceMinRaw : config.overheadMinRaw;
    const maxVal =
      tank === "source" ? config.sourceMaxRaw : config.overheadMaxRaw;

    // Scale percentage to raw value
    const range = maxVal - minVal;
    let rawTarget = minVal + (range * levelPercent) / 100;

    // Account for inversion if enabled
    const isInverted =
      tank === "source" ? config.sourceInvert : config.overheadInvert;
    if (isInverted) {
      rawTarget = maxVal - (range * levelPercent) / 100;
    }

    updateSimulatedLevel(tank, parseFloat(rawTarget.toFixed(1)));
    addEvent(
      `Simulated ${tank === "source" ? "Source" : "Overhead"} Tank set to ${levelPercent}%`,
      "info",
    );
  };

  // Minor increment/decrement adjusters
  const adjustTankLevel = (
    tank: "source" | "overhead",
    deltaPercent: number,
  ) => {
    const minVal =
      tank === "source" ? config.sourceMinRaw : config.overheadMinRaw;
    const maxVal =
      tank === "source" ? config.sourceMaxRaw : config.overheadMaxRaw;
    const currentRaw =
      tank === "source" ? simulatedLevels.source : simulatedLevels.overhead;

    const range = maxVal - minVal;
    const deltaRaw = (range * deltaPercent) / 100;

    let nextRaw = currentRaw + deltaRaw;

    // Bound raw value
    if (maxVal > minVal) {
      nextRaw = Math.max(minVal, Math.min(maxVal, nextRaw));
    } else {
      nextRaw = Math.min(minVal, Math.max(maxVal, nextRaw));
    }

    updateSimulatedLevel(tank, parseFloat(nextRaw.toFixed(1)));
  };

  if (!isLoaded) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1890ff" />
        <ThemedText style={{ marginTop: Spacing.three }} type="smallBold">
          Initializing Dashboard...
        </ThemedText>
      </ThemedView>
    );
  }

  // Get status color for connectivity indicator
  const getConnectivityStatus = () => {
    if (config.isDemoMode)
      return { label: "Simulation Active", color: "#ffa940", icon: "keyboard" };
    if (loading)
      return {
        label: "Fetching Feed...",
        color: "#1890ff",
        icon: "arrow.triangle.2.circlepath",
      };
    if (error)
      return {
        label: "Connection Error",
        color: "#ff4d4f",
        icon: "exclamationmark.octagon",
      };
    return { label: "ThingSpeak Connected", color: "#52c41a", icon: "wifi" };
  };

  const connStatus = getConnectivityStatus();
  const showHeaderRealtimeStatus = !config.isDemoMode && loading;
  const isSourceTankCritical = data.sourceLevel < 8;
  const summaryItemSurface =
    themeScheme === "dark"
      ? "rgba(255, 255, 255, 0.06)"
      : "rgba(255, 255, 255, 0.55)";
  const menuItems = [
    { key: "dashboard", label: "Dashboard", route: "/" },
    { key: "analytics", label: "Analytics", route: "/analytics" },
    { key: "alerts", label: "Alerts", route: "/alerts" },
    { key: "pump-settings", label: "Pump Settings", route: "/pump-settings" },
    { key: "settings", label: "Settings", route: "/settings" },
  ] as const;

  const menuIcons = {
    dashboard: {
      ios: "square.grid.2x2.fill",
      android: "dashboard",
      web: "dashboard",
    },
    analytics: { ios: "chart.bar.fill", android: "insights", web: "insights" },
    alerts: {
      ios: "bell.fill",
      android: "notifications",
      web: "notifications",
    },
    "pump-settings": {
      ios: "switch.2",
      android: "tune",
      web: "tune",
    },
    settings: { ios: "gearshape.fill", android: "settings", web: "settings" },
  } as const;

  const renderMenuItems = (closeAfterSelect: boolean) => (
    <ScrollView
      style={styles.drawerList}
      contentContainerStyle={styles.drawerListContent}
      showsVerticalScrollIndicator
    >
      {menuItems.map((item) => {
        const selected = activeSection === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              setActiveSection(item.key);
              if (closeAfterSelect) {
                setMenuVisible(false);
              }
              if (item.route !== "/") {
                router.replace(item.route);
              }
            }}
            style={({ pressed }) => [
              styles.drawerItem,
              {
                backgroundColor: selected ? "#1d5cff" : "transparent",
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={styles.drawerItemIcon}>
              <SymbolView
                name={menuIcons[item.key]}
                size={18}
                tintColor={selected ? "#fff" : theme.textSecondary}
              />
            </View>
            <ThemedText
              type="smallBold"
              style={{
                color: selected ? "#fff" : theme.text,
                fontSize: 16,
              }}
            >
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={styles.layoutRow}>
        {isWeb && menuVisible ? (
          <View
            style={[
              styles.sidebarPanel,
              {
                backgroundColor: theme.background,
                borderColor: theme.backgroundSelected,
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <ThemedText type="subtitle" style={styles.drawerTitle}>
                Menu
              </ThemedText>
              <Pressable
                onPress={() => setMenuVisible(false)}
                style={styles.drawerCloseButton}
              >
                <SymbolView
                  name={{ ios: "xmark", android: "close", web: "close" }}
                  size={20}
                  tintColor={theme.text}
                />
              </Pressable>
            </View>
            {renderMenuItems(false)}
          </View>
        ) : null}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.scrollContent}
        >
          <ThemedView style={styles.container}>
            <View style={styles.header}>
              <View style={styles.titleGroup}>
                {/* Hamburger menu button */}
                <Pressable
                  onPress={() => setMenuVisible(true)}
                  style={({ pressed }) => [
                    styles.menuBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <SymbolView
                    name={{
                      ios: "line.3.horizontal",
                      android: "menu",
                      web: "menu",
                    }}
                    size={24}
                    tintColor={theme.text}
                  />
                </Pressable>
                <View>
                  <ThemedText type="subtitle" style={styles.title}>
                    Water Tank Dashboard
                  </ThemedText>
                  {showHeaderRealtimeStatus ? (
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: connStatus.color },
                        ]}
                      />
                      <ThemedText
                        style={[styles.statusText, { color: connStatus.color }]}
                        type="smallBold"
                      >
                        {connStatus.label}
                      </ThemedText>
                      {data.lastUpdated && (
                        <>
                          <ThemedText
                            style={styles.statusDivider}
                            themeColor="textSecondary"
                          >
                            •
                          </ThemedText>
                          <ThemedText
                            style={styles.timeText}
                            type="code"
                            themeColor="textSecondary"
                          >
                            Updated: {data.lastUpdated.toLocaleTimeString()}
                          </ThemedText>
                        </>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {isSourceTankCritical && (
              <View style={styles.sourceAlertBanner}>
                <View style={styles.alertIconBubble}>
                  <SymbolView
                    name={{
                      ios: "bell.and.waves.left.and.right.fill",
                      android: "notifications_active",
                      web: "notifications_active",
                    }}
                    size={20}
                    tintColor="#ffffff"
                  />
                </View>
                <View style={styles.sourceAlertContent}>
                  <ThemedText style={styles.sourceAlertTitle} type="smallBold">
                    Source tank critically low
                  </ThemedText>
                  <ThemedText style={styles.sourceAlertText} type="small">
                    Water level is below 8%. Refill the source tank before the
                    pump runs dry.
                  </ThemedText>
                </View>
                <ThemedText style={styles.sourceAlertValue} type="title">
                  {data.sourceLevel}%
                </ThemedText>
              </View>
            )}

            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <View style={styles.summaryHeader}>
                <SymbolView
                  name={{
                    ios: "chart.bar.fill",
                    android: "insights",
                    web: "insights",
                  }}
                  size={16}
                  tintColor={theme.text}
                />
                <ThemedText type="smallBold" style={styles.summaryTitle}>
                  Dashboard
                </ThemedText>
              </View>

              <View style={styles.summaryGrid}>
                <View
                  style={[
                    styles.summaryItem,
                    { backgroundColor: summaryItemSurface },
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Channel
                  </ThemedText>
                  <ThemedText type="smallBold">{config.channelId}</ThemedText>
                </View>
                <View
                  style={[
                    styles.summaryItem,
                    { backgroundColor: summaryItemSurface },
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Source Tank Field
                  </ThemedText>
                  <ThemedText type="smallBold">
                    F{config.sourceField}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.summaryItem,
                    { backgroundColor: summaryItemSurface },
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Overhead Tank Field
                  </ThemedText>
                  <ThemedText type="smallBold">
                    F{config.overheadField}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.summaryItem,
                    { backgroundColor: summaryItemSurface },
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Poll Interval
                  </ThemedText>
                  <ThemedText type="smallBold">
                    {Math.max(1, Math.round(config.pollingIntervalMs / 1000))}s
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.summaryItem,
                    { backgroundColor: summaryItemSurface },
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Pump Status
                  </ThemedText>
                  <ThemedText type="smallBold">
                    {isSimulatingFlow ? "ON" : "OFF"}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Dynamic SCADA Water Channel Panel */}
            {config.isDemoMode && (
              <View
                style={[
                  styles.pipeIndicatorCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <View style={styles.pipeIndicatorHeader}>
                  <SymbolView
                    name={{
                      ios: "arrow.left.and.right.righttriangle.left.righttriangle.right.fill",
                      android: "swap_horiz",
                      web: "swap_horiz",
                    }}
                    size={16}
                    tintColor={
                      isSimulatingFlow ? "#52c41a" : theme.textSecondary
                    }
                  />
                  <ThemedText type="smallBold" style={{ fontSize: 12 }}>
                    Pump Settings: {isSimulatingFlow ? "ON" : "OFF"}
                  </ThemedText>
                </View>

                {/* Liquid transfer pipeline visual component */}
                <View style={styles.pipelineVisualContainer}>
                  <View
                    style={[
                      styles.pipeConnectionNode,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  />
                  <View
                    style={[
                      styles.pipeLineSegment,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    {isSimulatingFlow && (
                      <ThemedText style={styles.flowArrows} type="code">
                        {Platform.OS === "web"
                          ? ">>>>>>>>> PUMPING WATER >>>>>>>>>"
                          : ">>> PUMP ACTIVE >>>"}
                      </ThemedText>
                    )}
                  </View>
                  <View
                    style={[
                      styles.pipeConnectionNode,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  />
                </View>

                <Pressable
                  onPress={
                    isSimulatingFlow ? stopSimulatedFlow : startSimulatedFlow
                  }
                  style={({ pressed }) => [
                    styles.pumpToggleButton,
                    {
                      backgroundColor: isSimulatingFlow ? "#ff4d4f" : "#52c41a",
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <SymbolView
                    name={
                      isSimulatingFlow
                        ? { ios: "pause.fill", android: "pause", web: "pause" }
                        : {
                            ios: "play.fill",
                            android: "play_arrow",
                            web: "play_arrow",
                          }
                    }
                    size={14}
                    tintColor="#fff"
                  />
                  <ThemedText type="smallBold" style={{ color: "#fff" }}>
                    {isSimulatingFlow ? "Pump OFF" : "Pump ON"}
                  </ThemedText>
                </Pressable>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={{ textAlign: "center" }}
                >
                  {config.isDemoMode
                    ? "Use this to turn the simulated transfer pump on and off."
                    : "Live pump state is shown here; the current app controls the simulation only."}
                </ThemedText>
              </View>
            )}

            {/* Error Message banner */}
            {error && !config.isDemoMode && (
              <View style={styles.errorBanner}>
                <SymbolView
                  name={{
                    ios: "exclamationmark.octagon.fill",
                    android: "error",
                    web: "error",
                  }}
                  size={16}
                  tintColor="#ff4d4f"
                />
                <ThemedText style={styles.errorText} type="smallBold">
                  {error}
                </ThemedText>
              </View>
            )}

            {/* Two Water Tanks Side-by-Side/Stacked Layout */}
            <View style={styles.tanksWrapper}>
              <WaterTank
                title="Source Tank (Inlet)"
                type="source"
                level={data.sourceLevel}
                rawValue={data.sourceRaw}
                readingLabel={
                  config.isDemoMode
                    ? "Demo sensor reading"
                    : `ThingSpeak field ${config.sourceField}`
                }
                readingUnit={config.isDemoMode ? "sim" : "raw"}
                loading={loading}
              />
              <WaterTank
                title="Overhead Tank (Outlet)"
                type="overhead"
                level={data.overheadLevel}
                rawValue={data.overheadRaw}
                readingLabel={
                  config.isDemoMode
                    ? "Demo sensor reading"
                    : `ThingSpeak field ${config.overheadField}`
                }
                readingUnit={config.isDemoMode ? "sim" : "raw"}
                loading={loading}
              />
            </View>

            {activeSection === "dashboard" && (
              <View
                style={[
                  styles.historyCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <View style={styles.historyHeader}>
                  <View style={styles.summaryHeader}>
                    <SymbolView
                      name={{
                        ios: "waveform.path.ecg",
                        android: "show_chart",
                        web: "show_chart",
                      }}
                      size={16}
                      tintColor={theme.text}
                    />
                    <ThemedText type="smallBold" style={styles.summaryTitle}>
                      Water Level History (24 Hours)
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    Live ThingSpeak data
                  </ThemedText>
                </View>

                <View
                  style={styles.chartContainer}
                  onLayout={(event) =>
                    setChartLayout({
                      width: event.nativeEvent.layout.width,
                      height: event.nativeEvent.layout.height,
                    })
                  }
                >
                  {chartLayout.width > 0 &&
                  chartLayout.height > 0 &&
                  chartHistory.length > 0 ? (
                    <>
                      {[0, 25, 50, 75, 100].map((tick) => {
                        const y =
                          18 + ((chartLayout.height - 46) * (100 - tick)) / 100;
                        return (
                          <View
                            key={tick}
                            style={[styles.chartGridRow, { top: y }]}
                          >
                            <ThemedText
                              type="code"
                              themeColor="textSecondary"
                              style={styles.chartYAxisLabel}
                            >
                              {tick}
                            </ThemedText>
                            <View
                              style={[
                                styles.chartGridLine,
                                { borderColor: theme.backgroundSelected },
                              ]}
                            />
                          </View>
                        );
                      })}

                      {/* SVG lines connecting the dots - web only */}
                      {Platform.OS === "web" &&
                        (() => {
                          const pts = displayPoints;
                          if (pts.length < 2) return null;
                          const pL = 48,
                            pR = 18,
                            pT = 18,
                            pB = 28;
                          const uW = chartLayout.width - pL - pR;
                          const uH = chartLayout.height - pT - pB;
                          const gx = (i: number) =>
                            pL + (uW * i) / Math.max(1, pts.length - 1);
                          const gsy = (p: HistoryPoint) =>
                            pT + uH * (1 - p.source / 100);
                          const goy = (p: HistoryPoint) =>
                            pT + uH * (1 - p.overhead / 100);
                          const srcPts = pts
                            .map((p, i) => `${gx(i)},${gsy(p)}`)
                            .join(" ");
                          const ovhPts = pts
                            .map((p, i) => `${gx(i)},${goy(p)}`)
                            .join(" ");
                          // @ts-ignore
                          return (
                            <svg
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: "100%",
                                pointerEvents: "none",
                              }}
                              width={chartLayout.width}
                              height={chartLayout.height}
                            >
                              <polyline
                                points={srcPts}
                                fill="none"
                                stroke="#3b82f6"
                                strokeWidth="2"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                opacity="0.8"
                              />
                              <polyline
                                points={ovhPts}
                                fill="none"
                                stroke="#14b8a6"
                                strokeWidth="2"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                opacity="0.8"
                              />
                            </svg>
                          );
                        })()}

                      {displayPoints.map((point, index, points) => {
                        const paddingLeft = 48;
                        const paddingRight = 18;
                        const paddingTop = 18;
                        const paddingBottom = 28;
                        const usableWidth =
                          chartLayout.width - paddingLeft - paddingRight;
                        const usableHeight =
                          chartLayout.height - paddingTop - paddingBottom;
                        const x =
                          paddingLeft +
                          (usableWidth * index) /
                            Math.max(1, points.length - 1);
                        const sourceY =
                          paddingTop + usableHeight * (1 - point.source / 100);
                        const overheadY =
                          paddingTop +
                          usableHeight * (1 - point.overhead / 100);
                        const showLabel =
                          index === 0 ||
                          index === points.length - 1 ||
                          index % 4 === 0;

                        return (
                          <React.Fragment key={`${point.time}-${index}`}>
                            {/* Source dot */}
                            <View
                              style={[
                                styles.chartLine,
                                {
                                  left: x - 5,
                                  top: sourceY - 5,
                                  width: 10,
                                  height: 10,
                                  borderRadius: 5,
                                  backgroundColor: "#3b82f6",
                                  zIndex: 10,
                                  cursor: "pointer",
                                },
                              ]}
                              // @ts-ignore
                              onMouseEnter={() =>
                                setHoveredPoint({
                                  x,
                                  y: sourceY,
                                  source: point.source,
                                  overhead: point.overhead,
                                  time: point.time,
                                })
                              }
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                            {/* Overhead dot */}
                            <View
                              style={[
                                styles.chartLine,
                                {
                                  left: x - 5,
                                  top: overheadY - 5,
                                  width: 10,
                                  height: 10,
                                  borderRadius: 5,
                                  backgroundColor: "#14b8a6",
                                  zIndex: 10,
                                  cursor: "pointer",
                                },
                              ]}
                              // @ts-ignore
                              onMouseEnter={() =>
                                setHoveredPoint({
                                  x,
                                  y: overheadY,
                                  source: point.source,
                                  overhead: point.overhead,
                                  time: point.time,
                                })
                              }
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                            {showLabel && (
                              <ThemedText
                                type="code"
                                themeColor="textSecondary"
                                style={[styles.chartXLabel, { left: x - 22 }]}
                              >
                                {new Date(point.time).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </ThemedText>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* Hover tooltip */}
                      {hoveredPoint && (
                        <View
                          style={[
                            styles.chartTooltip,
                            {
                              left: Math.min(
                                hoveredPoint.x - 60,
                                chartLayout.width - 145,
                              ),
                              top: Math.max(hoveredPoint.y - 85, 4),
                            },
                          ]}
                        >
                          <ThemedText
                            type="code"
                            style={{
                              color: "#94a3b8",
                              fontSize: 10,
                              marginBottom: 4,
                            }}
                          >
                            {new Date(hoveredPoint.time).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </ThemedText>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              marginBottom: 2,
                            }}
                          >
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: "#3b82f6",
                              }}
                            />
                            <ThemedText
                              type="code"
                              style={{ color: "#e2e8f0", fontSize: 11 }}
                            >
                              Source: {hoveredPoint.source}%
                            </ThemedText>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: "#14b8a6",
                              }}
                            />
                            <ThemedText
                              type="code"
                              style={{ color: "#e2e8f0", fontSize: 11 }}
                            >
                              Overhead: {hoveredPoint.overhead}%
                            </ThemedText>
                          </View>
                        </View>
                      )}
                    </>
                  ) : (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.chartPlaceholder}
                    >
                      Loading history...
                    </ThemedText>
                  )}
                </View>

                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendLine,
                        { backgroundColor: "#3b82f6" },
                      ]}
                    />
                    <ThemedText type="smallBold">Source Tank</ThemedText>
                  </View>
                  <View style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendLine,
                        { backgroundColor: "#14b8a6" },
                      ]}
                    />
                    <ThemedText type="smallBold">Overhead Tank</ThemedText>
                  </View>
                </View>
              </View>
            )}

            {/* Simulation Level Controls Panel */}
            {config.isDemoMode && (
              <View
                style={[
                  styles.controlPanelCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <View style={styles.controlHeaderRow}>
                  <SymbolView
                    name={{
                      ios: "slider.horizontal.3",
                      android: "tune",
                      web: "tune",
                    }}
                    size={16}
                    tintColor={theme.text}
                  />
                  <ThemedText type="smallBold" style={styles.panelTitle}>
                    Simulate Tank Levels (Manually)
                  </ThemedText>
                </View>

                {/* Source control slider-replacement buttons */}
                <View style={styles.tankControlsBlock}>
                  <ThemedText style={{ fontSize: 13 }} type="smallBold">
                    Source Tank Level Control:
                  </ThemedText>
                  <View style={styles.controlBtnRow}>
                    <Pressable
                      onPress={() => adjustTankLevel("source", -10)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">-10%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("source", 0)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">0%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("source", 25)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">25%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("source", 50)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">50%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("source", 75)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">75%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("source", 100)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">100%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => adjustTankLevel("source", 10)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">+10%</ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* Overhead control slider-replacement buttons */}
                <View style={styles.tankControlsBlock}>
                  <ThemedText style={{ fontSize: 13 }} type="smallBold">
                    Overhead Tank Level Control:
                  </ThemedText>
                  <View style={styles.controlBtnRow}>
                    <Pressable
                      onPress={() => adjustTankLevel("overhead", -10)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">-10%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("overhead", 0)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">0%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("overhead", 25)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">25%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("overhead", 50)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">50%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("overhead", 75)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">75%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setTankPreset("overhead", 100)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">100%</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => adjustTankLevel("overhead", 10)}
                      style={[
                        styles.controlBtn,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <ThemedText type="smallBold">+10%</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {activeSection === "alerts" && (
              <View
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <View style={styles.summaryHeader}>
                  <SymbolView
                    name={{
                      ios: "bell.fill",
                      android: "notifications",
                      web: "notifications",
                    }}
                    size={16}
                    tintColor={theme.text}
                  />
                  <ThemedText type="smallBold" style={styles.summaryTitle}>
                    Alerts
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Alerts fire when the source tank is low, the overhead tank is
                  empty, or the pump changes state.
                </ThemedText>
                {error && !config.isDemoMode ? (
                  <View style={styles.errorBanner}>
                    <SymbolView
                      name={{
                        ios: "exclamationmark.octagon.fill",
                        android: "error",
                        web: "error",
                      }}
                      size={16}
                      tintColor="#ff4d4f"
                    />
                    <ThemedText style={styles.errorText} type="smallBold">
                      {error}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            )}

            {activeSection === "settings" && (
              <View
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <View style={styles.summaryHeader}>
                  <SymbolView
                    name={{
                      ios: "gearshape.fill",
                      android: "settings",
                      web: "settings",
                    }}
                    size={16}
                    tintColor={theme.text}
                  />
                  <ThemedText type="smallBold" style={styles.summaryTitle}>
                    Settings
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Open configuration to change channel mapping, polling, and
                  theme mode.
                </ThemedText>
                <Pressable
                  onPress={() => setSettingsVisible(true)}
                  style={({ pressed }) => [
                    styles.pumpToggleButton,
                    { backgroundColor: "#1890ff" },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <ThemedText type="smallBold" style={{ color: "#fff" }}>
                    Open Settings
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </ThemedView>
        </ScrollView>
      </View>

      <Modal
        visible={!isWeb && menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <Pressable
            style={[styles.drawerPanel, { backgroundColor: theme.background }]}
            onPress={() => undefined}
          >
            <View style={styles.drawerHeader}>
              <ThemedText type="subtitle" style={styles.drawerTitle}>
                Menu
              </ThemedText>
              <Pressable
                onPress={() => setMenuVisible(false)}
                style={styles.drawerCloseButton}
              >
                <SymbolView
                  name={{ ios: "xmark", android: "close", web: "close" }}
                  size={20}
                  tintColor={theme.text}
                />
              </Pressable>
            </View>
            {renderMenuItems(true)}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settings Modal overlay */}
      <DashboardSettings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        config={config}
        onSave={handleSaveConfig}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
  },
  layoutRow: {
    flex: 1,
    flexDirection: "row",
  },
  sidebarPanel: {
    width: 290,
    borderRightWidth: 1,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.four,
  },
  container: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    maxWidth: 1180,
    width: "100%",
    alignSelf: "center",
    gap: Spacing.five,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.one,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.two,
  },
  statusText: {
    fontSize: 12,
  },
  statusDivider: {
    marginHorizontal: Spacing.two,
    fontSize: 12,
  },
  timeText: {
    fontSize: 11,
  },
  summaryCard: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.four,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  summaryTitle: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  summaryItem: {
    minWidth: 180,
    flexGrow: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  pushCard: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  pushStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pushTokenText: {
    fontSize: 11,
    lineHeight: 17,
  },
  pushHelpText: {
    fontSize: 12,
    lineHeight: 18,
  },
  historyCard: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.four,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  historyHeader: {
    gap: Spacing.one,
  },
  chartContainer: {
    position: "relative",
    height: 260,
    overflow: "hidden",
    marginTop: Spacing.one,
  },
  chartGridRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  chartYAxisLabel: {
    width: 34,
    textAlign: "right",
    fontSize: 10,
  },
  chartGridLine: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
    opacity: 0.7,
  },
  chartLine: {
    position: "absolute",
  },
  chartPoint: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  chartXLabel: {
    position: "absolute",
    bottom: 2,
    fontSize: 10,
  },
  chartPlaceholder: {
    textAlign: "center",
    paddingTop: 96,
  },
  chartLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.four,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  legendLine: {
    width: 14,
    height: 4,
    borderRadius: 999,
  },
  sectionCard: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  dashboardHintCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: "rgba(150, 150, 150, 0.1)",
    padding: Spacing.three,
    gap: Spacing.one,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    flexDirection: "row",
  },
  drawerPanel: {
    width: 290,
    minHeight: "100%",
    maxHeight: "100%",
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 6, height: 0 },
    elevation: 10,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150, 150, 150, 0.18)",
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  drawerCloseButton: {
    padding: Spacing.one,
  },
  drawerList: {
    flex: 1,
    paddingTop: Spacing.three,
  },
  drawerListContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  drawerItemIcon: {
    width: 24,
    alignItems: "center",
  },
  menuBtn: {
    padding: Spacing.two,
    marginTop: Spacing.half,
    alignItems: "center",
    justifyContent: "center",
  },
  pipeIndicatorCard: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  pipeIndicatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  pipelineVisualContainer: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: Spacing.one,
  },
  pipeConnectionNode: {
    width: 12,
    height: 20,
    borderRadius: 3,
  },
  pipeLineSegment: {
    flex: 1,
    height: 8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  flowArrows: {
    fontSize: 7,
    color: "#52c41a",
    letterSpacing: 2,
    fontWeight: "bold",
  },
  pumpToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#ffccc7",
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  errorText: {
    color: "#cf1322",
    fontSize: 13,
    flex: 1,
  },
  sourceAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#ff7875",
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
    shadowColor: "#cf1322",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 3,
  },
  alertIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4d4f",
  },
  sourceAlertContent: {
    flex: 1,
    gap: Spacing.half,
  },
  sourceAlertTitle: {
    color: "#a8071a",
    fontSize: 15,
  },
  sourceAlertText: {
    color: "#820014",
    fontSize: 13,
  },
  sourceAlertValue: {
    color: "#cf1322",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
  },
  tanksWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.five,
    justifyContent: "space-between",
  },
  controlPanelCard: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  controlHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  panelTitle: {
    fontSize: 14,
  },
  tankControlsBlock: {
    gap: Spacing.one,
  },
  controlBtnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  controlBtn: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  logCard: {
    gap: Spacing.two,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingLeft: Spacing.one,
  },
  logTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  logList: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    maxHeight: 180,
    overflow: "scroll",
  },
  noEventsText: {
    textAlign: "center",
    paddingVertical: Spacing.four,
    fontStyle: "italic",
  },
  logItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  logTime: {
    fontSize: 10,
    color: "#8c8c8c",
  },
  logTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logMessage: {
    fontSize: 12,
    flex: 1,
  },
  chartTooltip: {
    position: "absolute",
    backgroundColor: "#1e293b",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    zIndex: 100,
    minWidth: 130,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    gap: 2,
  },
});
