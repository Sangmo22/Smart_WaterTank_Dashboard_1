import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { PageFrame } from "@/components/page-frame";
import { ThemedText } from "@/components/themed-text";
import { useThingSpeak } from "@/hooks/use-thingspeak";
import { useThingSpeakHistory } from "@/hooks/use-thingspeak-history";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface Insight {
  label: string;
  value: string;
  color?: string;
  icon: { ios: string; android: string; web: string };
}

function formatHours(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "—";
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) {
    return `~${Math.max(1, Math.round(hours * 60))} min`;
  }
  if (hours < 24) {
    return `~${Math.round(hours)} hr${hours >= 2 ? "s" : ""}`;
  }
  return `~${Math.round(hours / 24)} day${hours >= 48 ? "s" : ""}`;
}

// --- Z-Score statistical helpers ---

interface ZResult {
  mean: number;
  stddev: number;
  filteredMean: number;
  filteredStddev: number;
  outliers: number;
  total: number;
  samples: number[];
  confidence95Low: number;
  confidence95High: number;
}

/** Compute mean of an array */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Compute sample standard deviation */
function stddev(arr: number[], arrMean?: number): number {
  if (arr.length < 2) return 0;
  const m = arrMean ?? mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute per-interval rates (%/hr) from consecutive readings,
 * then filter outliers using z-score. Returns the robust rate
 * estimate with 95% confidence interval.
 */
function zScoreRates(
  readings: { time: number; level: number }[],
  zThreshold = 2,
): ZResult {
  if (readings.length < 2) {
    return {
      mean: 0,
      stddev: 0,
      filteredMean: 0,
      filteredStddev: 0,
      outliers: 0,
      total: 0,
      samples: [],
      confidence95Low: 0,
      confidence95High: 0,
    };
  }

  // Compute per-interval rates (%/hr)
  const rates: number[] = [];
  for (let i = 1; i < readings.length; i++) {
    const dt = (readings[i].time - readings[i - 1].time) / (60 * 60 * 1000);
    if (dt <= 0) continue;
    const dLevel = readings[i].level - readings[i - 1].level;
    rates.push(dLevel / dt);
  }

  if (rates.length === 0) {
    return {
      mean: 0,
      stddev: 0,
      filteredMean: 0,
      filteredStddev: 0,
      outliers: 0,
      total: 0,
      samples: [],
      confidence95Low: 0,
      confidence95High: 0,
    };
  }

  const m = mean(rates);
  const s = stddev(rates, m);

  // Filter outliers: remove readings where |z| > threshold
  const filtered = s > 0
    ? rates.filter((r) => Math.abs((r - m) / s) <= zThreshold)
    : [...rates];

  const fm = filtered.length > 0 ? mean(filtered) : m;
  const fs = stddev(filtered, fm);

  // 95% confidence interval: mean ± 1.96 * (stddev / sqrt(n))
  const se = fs / Math.sqrt(Math.max(1, filtered.length));
  const ci95Low = fm - 1.96 * se;
  const ci95High = fm + 1.96 * se;

  return {
    mean: m,
    stddev: s,
    filteredMean: fm,
    filteredStddev: fs,
    outliers: rates.length - filtered.length,
    total: rates.length,
    samples: filtered,
    confidence95Low: ci95Low,
    confidence95High: ci95High,
  };
}

export default function AnalyticsScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  const { data, config } = useThingSpeak();
  const { history, loading, error, refresh, isDemoMode } = useThingSpeakHistory(
    config,
    500,
    1440,
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const stats = useMemo(() => {
    if (history.length === 0) return null;

    const sourceVals = history.map((p) => p.source);
    const overheadVals = history.map((p) => p.overhead);

    const oldest = history[0];
    const newest = history[history.length - 1];

    const liveTime = data.lastUpdated?.getTime() ?? Date.now();
    const spanMs = Math.max(
      liveTime - oldest.time,
      newest.time - oldest.time,
      1,
    );
    const spanHours = spanMs / (60 * 60 * 1000);

    const currentOverhead = data.overheadLevel;
    const currentSource = data.sourceLevel;

    // Build per-interval readings for z-score analysis
    const overheadReadings = history.map((p) => ({
      time: p.time,
      level: p.overhead,
    }));
    // Append live reading as the final point
    if (data.lastUpdated) {
      overheadReadings.push({ time: liveTime, level: currentOverhead });
    }

    const sourceReadings = history.map((p) => ({
      time: p.time,
      level: p.source,
    }));
    if (data.lastUpdated) {
      sourceReadings.push({ time: liveTime, level: currentSource });
    }

    // Z-score filtered overhead rate (%/hr) — positive = dropping
    const overheadZ = zScoreRates(overheadReadings);
    // Negate because consumption rate = how fast overhead DROPS
    const consumptionRate = -overheadZ.filteredMean;
    const consumptionRateLow = -overheadZ.confidence95High;
    const consumptionRateHigh = -overheadZ.confidence95Low;

    // Z-score filtered source rate (%/hr) — positive = dropping
    const sourceZ = zScoreRates(sourceReadings);
    const sourceDrainRate = -sourceZ.filteredMean;
    const sourceDrainRateLow = -sourceZ.confidence95High;
    const sourceDrainRateHigh = -sourceZ.confidence95Low;

    // Time-to-empty using filtered rate (best estimate)
    const timeToEmptyMs =
      consumptionRate > 0
        ? (currentOverhead / consumptionRate) * (60 * 60 * 1000)
        : Infinity;
    // Worst case (slowest consumption)
    const timeToEmptyMsSlow =
      consumptionRateHigh > 0
        ? (currentOverhead / consumptionRateHigh) * (60 * 60 * 1000)
        : Infinity;
    // Best case (fastest consumption)
    const timeToEmptyMsFast =
      consumptionRateLow > 0
        ? (currentOverhead / consumptionRateLow) * (60 * 60 * 1000)
        : Infinity;

    // Time-to-dry using filtered rate
    const timeToDryMs =
      sourceDrainRate > 0
        ? (currentSource / sourceDrainRate) * (60 * 60 * 1000)
        : Infinity;
    const timeToDryMsSlow =
      sourceDrainRateHigh > 0
        ? (currentSource / sourceDrainRateHigh) * (60 * 60 * 1000)
        : Infinity;
    const timeToDryMsFast =
      sourceDrainRateLow > 0
        ? (currentSource / sourceDrainRateLow) * (60 * 60 * 1000)
        : Infinity;

    return {
      currentSource,
      currentOverhead,
      avgSource: mean(sourceVals),
      avgOverhead: mean(overheadVals),
      minSource: Math.min(...sourceVals),
      maxSource: Math.max(...sourceVals),
      minOverhead: Math.min(...overheadVals),
      maxOverhead: Math.max(...overheadVals),
      count: history.length,
      oldest: history[0].time,
      newest: history[history.length - 1].time,
      consumptionRate,
      consumptionRateLow,
      consumptionRateHigh,
      timeToEmptyMs,
      timeToEmptyMsSlow,
      timeToEmptyMsFast,
      sourceDrainRate,
      sourceDrainRateLow,
      sourceDrainRateHigh,
      timeToDryMs,
      timeToDryMsSlow,
      timeToDryMsFast,
      spanHours,
      overheadOutliers: overheadZ.outliers,
      overheadSamples: overheadZ.total,
      sourceOutliers: sourceZ.outliers,
      sourceSamples: sourceZ.total,
      overheadStddev: overheadZ.filteredStddev,
      sourceStddev: sourceZ.filteredStddev,
    };
  }, [
    history,
    data.sourceLevel,
    data.overheadLevel,
    data.lastUpdated,
  ]);

  const insights = useMemo<Insight[]>(() => {
    const items: Insight[] = [];

    if (stats) {
      items.push({
        label: "Overhead Consumption Rate (z-score)",
        value: stats.consumptionRate > 0
            ? `${stats.consumptionRate.toFixed(1)} %/hr (±${stats.overheadStddev.toFixed(1)})`
            : "Steady / no drop",
        icon: {
          ios: "arrow.down.right",
          android: "trending_down",
          web: "trending_down",
        },
        color: stats.consumptionRate > 0 ? "#ffa940" : "#52c41a",
      });

      items.push({
        label: "Est. Time to Empty (Overhead)",
        value: stats.timeToEmptyMs > 0
            ? `${formatHours(stats.timeToEmptyMs)} [${formatHours(stats.timeToEmptyMsFast)} – ${formatHours(stats.timeToEmptyMsSlow)}]`
            : "—",
        icon: {
          ios: "hourglass",
          android: "hourglass_empty",
          web: "hourglass_empty",
        },
        color: "#1890ff",
      });

      items.push({
        label: "Source Drain Rate (z-score)",
        value: stats.sourceDrainRate > 0
            ? `${stats.sourceDrainRate.toFixed(1)} %/hr (±${stats.sourceStddev.toFixed(1)})`
            : "Steady / refilling",
        icon: {
          ios: "arrow.down.right",
          android: "trending_down",
          web: "trending_down",
        },
        color: stats.sourceDrainRate > 0 ? "#ffa940" : "#52c41a",
      });

      items.push({
        label: "Est. Time to Dry (Source)",
        value: stats.timeToDryMs > 0
            ? `${formatHours(stats.timeToDryMs)} [${formatHours(stats.timeToDryMsFast)} – ${formatHours(stats.timeToDryMsSlow)}]`
            : "—",
        icon: {
          ios: "hourglass.bottomhalf.filled",
          android: "hourglass_bottom",
          web: "hourglass_bottom",
        },
        color: "#ff4d4f",
      });

      items.push({
        label: "Outliers Filtered",
        value: `${stats.overheadOutliers} overhead / ${stats.sourceOutliers} source (of ${stats.overheadSamples} samples)`,
        icon: {
          ios: "line.3.horizontal.decrease.circle",
          android: "filter_alt",
          web: "filter_alt",
        },
        color: "#8c8c8c",
      });

      items.push({
        label: "Data Window",
        value: stats.spanHours < 1
          ? `~${Math.round(stats.spanHours * 60)} min`
          : `~${stats.spanHours.toFixed(1)} hrs`,
        icon: {
          ios: "clock",
          android: "schedule",
          web: "schedule",
        },
        color: "#8c8c8c",
      });
    }

    return items;
  }, [stats]);

  const chartData = useMemo(() => {
    const slice = history.slice(-30);
    if (slice.length > 0 && data.lastUpdated) {
      const last = slice[slice.length - 1];
      if (
        last.source !== data.sourceLevel ||
        last.overhead !== data.overheadLevel
      ) {
        return [
          ...slice.slice(0, -1),
          {
            time: last.time,
            source: data.sourceLevel,
            overhead: data.overheadLevel,
            sourceRaw: data.sourceRaw,
            overheadRaw: data.overheadRaw,
          },
        ];
      }
    }
    return slice;
  }, [history, data.sourceLevel, data.overheadLevel, data.lastUpdated]);

  return (
    <PageFrame
      title="Analytics"
      subtitle="Usage insights from live ThingSpeak data"
      icon={{ ios: "chart.bar.fill", android: "insights", web: "insights" }}
    >
      <ThemedText type="small" themeColor="textSecondary">
        Analytics are computed from the last {history.length || 500} readings of
        the live ThingSpeak feed mapped to the Source and Overhead tanks.
      </ThemedText>

      {/* Live stat cards */}
      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            { backgroundColor: theme.backgroundSelected + "66" },
          ]}
        >
          <ThemedText type="small" themeColor="textSecondary">
            Source (current)
          </ThemedText>
          <ThemedText type="title" style={styles.statValue}>
            {data.sourceLevel}%
          </ThemedText>
        </View>
        <View
          style={[
            styles.statCard,
            { backgroundColor: theme.backgroundSelected + "66" },
          ]}
        >
          <ThemedText type="small" themeColor="textSecondary">
            Overhead (current)
          </ThemedText>
          <ThemedText type="title" style={styles.statValue}>
            {data.overheadLevel}%
          </ThemedText>
        </View>
        {stats && (
          <>
            <View
              style={[
                styles.statCard,
                { backgroundColor: theme.backgroundSelected + "66" },
              ]}
            >
              <ThemedText type="small" themeColor="textSecondary">
                Avg Source (window)
              </ThemedText>
              <ThemedText type="title" style={styles.statValue}>
                {stats.avgSource.toFixed(0)}%
              </ThemedText>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: theme.backgroundSelected + "66" },
              ]}
            >
              <ThemedText type="small" themeColor="textSecondary">
                Avg Overhead (window)
              </ThemedText>
              <ThemedText type="title" style={styles.statValue}>
                {stats.avgOverhead.toFixed(0)}%
              </ThemedText>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: theme.backgroundSelected + "66" },
              ]}
            >
              <ThemedText type="small" themeColor="textSecondary">
                Source range
              </ThemedText>
              <ThemedText type="title" style={styles.statValueSmall}>
                {stats.minSource}% – {stats.maxSource}%
              </ThemedText>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: theme.backgroundSelected + "66" },
              ]}
            >
              <ThemedText type="small" themeColor="textSecondary">
                Overhead range
              </ThemedText>
              <ThemedText type="title" style={styles.statValueSmall}>
                {stats.minOverhead}% – {stats.maxOverhead}%
              </ThemedText>
            </View>
          </>
        )}
      </View>

      {/* Refresh + window info */}
      <View style={styles.toolbarRow}>
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
          {stats
            ? `${stats.count} readings · ${new Date(stats.oldest).toLocaleString()} → ${new Date(stats.newest).toLocaleString()}`
            : "No history loaded yet."}
        </ThemedText>
        <Pressable
          onPress={handleRefresh}
          disabled={refreshing || loading || isDemoMode}
          style={({ pressed }) => [
            styles.refreshButton,
            { backgroundColor: theme.backgroundSelected },
            pressed && { opacity: 0.8 },
            (refreshing || loading || isDemoMode) && { opacity: 0.5 },
          ]}
        >
          {refreshing || loading ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <SymbolView
              name={{
                ios: "arrow.clockwise",
                android: "refresh",
                web: "refresh",
              }}
              size={14}
              tintColor={theme.text}
            />
          )}
          <ThemedText type="smallBold">Refresh</ThemedText>
        </Pressable>
      </View>

      {/* Trend chart */}
      <View style={[styles.card, { borderColor: theme.backgroundSelected }]}>
        <View style={styles.cardHeader}>
          <SymbolView
            name={{
              ios: "waveform.path.ecg",
              android: "show_chart",
              web: "show_chart",
            }}
            size={16}
            tintColor={theme.text}
          />
          <ThemedText type="smallBold" style={styles.cardTitle}>
            Level Trend (last {chartData.length || 30} readings)
          </ThemedText>
        </View>

        {isDemoMode || chartData.length < 2 ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.chartPlaceholder}
          >
            {isDemoMode
              ? "Switch to a live ThingSpeak feed to see historical trends."
              : "Not enough data to plot a trend yet."}
          </ThemedText>
        ) : (
          <ChartCanvas points={chartData} theme={theme} />
        )}

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: "#3b82f6" }]} />
            <ThemedText type="smallBold">Source Tank</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: "#14b8a6" }]} />
            <ThemedText type="smallBold">Overhead Tank</ThemedText>
          </View>
        </View>
      </View>

      {/* Insights panel */}
      <View style={[styles.card, { borderColor: theme.backgroundSelected }]}>
        <View style={styles.cardHeader}>
          <SymbolView
            name={{
              ios: "lightbulb.fill",
              android: "lightbulb",
              web: "lightbulb",
            }}
            size={16}
            tintColor={theme.text}
          />
          <ThemedText type="smallBold" style={styles.cardTitle}>
            Insights & Forecast
          </ThemedText>
        </View>

        {insights.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {isDemoMode
              ? "Switch to a live ThingSpeak feed to see usage insights and forecasts."
              : "Waiting for live data. Insights and forecasts will appear once the first reading arrives."}
          </ThemedText>
        ) : (
          <View style={styles.insightsGrid}>
            {insights.map((insight) => (
              <View
                key={insight.label}
                style={[
                  styles.insightItem,
                  { backgroundColor: theme.backgroundSelected + "66" },
                ]}
              >
                <View style={styles.insightIconWrap}>
                  <SymbolView
                    name={insight.icon as any}
                    size={16}
                    tintColor={insight.color || theme.text}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {insight.label}
                  </ThemedText>
                  <ThemedText
                    type="smallBold"
                    style={{ color: insight.color || theme.text, fontSize: 15 }}
                  >
                    {insight.value}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </PageFrame>
  );
}

// --- Chart canvas component (web hover + native dots) ---
function ChartCanvas({
  points,
  theme,
}: {
  points: { time: number; source: number; overhead: number }[];
  theme: ReturnType<typeof useColorScheme> extends "dark" | "light"
    ? (typeof Colors)["dark" | "light"]
    : (typeof Colors)["dark" | "light"];
}) {
  const [hovered, setHovered] = useState<{
    x: number;
    y: number;
    source: number;
    overhead: number;
    time: number;
  } | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });

  const paddingLeft = 40;
  const paddingRight = 18;
  const paddingTop = 18;
  const paddingBottom = 28;

  const { width: cw, height: ch } = size;
  const usableWidth = Math.max(1, cw - paddingLeft - paddingRight);
  const usableHeight = Math.max(1, ch - paddingTop - paddingBottom);

  const gx = (i: number) =>
    paddingLeft + (usableWidth * i) / Math.max(1, points.length - 1);
  const gy = (p: number) => paddingTop + usableHeight * (1 - p / 100);

  const srcPts = points.map((p, i) => `${gx(i)},${gy(p.source)}`).join(" ");
  const ovhPts = points.map((p, i) => `${gx(i)},${gy(p.overhead)}`).join(" ");

  return (
    <View
      style={[styles.chartContainer, { position: "relative" }]}
      onLayout={(event) =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {size.width > 0 && size.height > 0 && (
        <>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = paddingTop + (usableHeight * (100 - tick)) / 100;
            return (
              <View key={tick} style={[styles.gridRow, { top: y }]}>
                <ThemedText
                  type="code"
                  themeColor="textSecondary"
                  style={styles.yAxisLabel}
                >
                  {tick}
                </ThemedText>
                <View
                  style={[
                    styles.gridLine,
                    { borderColor: theme.backgroundSelected },
                  ]}
                />
              </View>
            );
          })}

          {/* SVG polylines - web only */}
          {Platform.OS === "web" && (
            // @ts-ignore
            <svg
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
              width={size.width}
              height={size.height}
            >
              <polyline
                points={srcPts}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.85"
              />
              <polyline
                points={ovhPts}
                fill="none"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.85"
              />
            </svg>
          )}

          {/* Dots */}
          {points.map((point, index) => {
            const x = gx(index);
            const sourceY = gy(point.source);
            const overheadY = gy(point.overhead);
            const showLabel =
              index === 0 || index === points.length - 1 || index % 5 === 0;

            return (
              <React.Fragment key={point.time + "-" + index}>
                <View
                  style={[
                    styles.dot,
                    {
                      left: x - 5,
                      top: sourceY - 5,
                      backgroundColor: "#3b82f6",
                    },
                  ]}
                  // @ts-ignore
                  onMouseEnter={() =>
                    setHovered({
                      x,
                      y: sourceY,
                      source: point.source,
                      overhead: point.overhead,
                      time: point.time,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                />
                <View
                  style={[
                    styles.dot,
                    {
                      left: x - 5,
                      top: overheadY - 5,
                      backgroundColor: "#14b8a6",
                    },
                  ]}
                  // @ts-ignore
                  onMouseEnter={() =>
                    setHovered({
                      x,
                      y: overheadY,
                      source: point.source,
                      overhead: point.overhead,
                      time: point.time,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                />
                {showLabel && (
                  <ThemedText
                    type="code"
                    themeColor="textSecondary"
                    style={[styles.xAxisLabel, { left: x - 22 }]}
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
          {hovered && (
            <View
              style={[
                styles.tooltip,
                {
                  left: Math.min(hovered.x - 70, size.width - 160),
                  top: Math.max(hovered.y - 90, 4),
                },
              ]}
            >
              <ThemedText
                type="code"
                style={{ color: "#94a3b8", fontSize: 10, marginBottom: 4 }}
              >
                {new Date(hovered.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
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
                  Source: {hovered.source}%
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
                  Overhead: {hovered.overhead}%
                </ThemedText>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  statCard: {
    minWidth: 160,
    flexGrow: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "800",
    marginTop: Spacing.half,
  },
  statValueSmall: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: Spacing.half,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    flexWrap: "wrap",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  card: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chartContainer: {
    height: 260,
    overflow: "hidden",
  },
  chartPlaceholder: {
    textAlign: "center",
    paddingVertical: Spacing.four,
  },
  gridRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  yAxisLabel: {
    width: 34,
    textAlign: "right",
    fontSize: 10,
  },
  gridLine: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
    opacity: 0.7,
  },
  dot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 10,
    cursor: "pointer",
  },
  xAxisLabel: {
    position: "absolute",
    bottom: 2,
    fontSize: 10,
  },
  legendRow: {
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
  insightsGrid: {
    gap: Spacing.two,
  },
  insightItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  insightIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(150, 150, 150, 0.12)",
  },
  tooltip: {
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
