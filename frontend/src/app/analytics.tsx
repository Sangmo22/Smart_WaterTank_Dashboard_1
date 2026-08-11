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

export default function AnalyticsScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  const { data, config } = useThingSpeak();
  const { history, loading, error, refresh, isDemoMode } = useThingSpeakHistory(
    config,
    100,
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
    const avg = (arr: number[]) =>
      arr.reduce((sum, v) => sum + v, 0) / Math.max(1, arr.length);

    return {
      currentSource: sourceVals[sourceVals.length - 1],
      currentOverhead: overheadVals[overheadVals.length - 1],
      avgSource: avg(sourceVals),
      avgOverhead: avg(overheadVals),
      minSource: Math.min(...sourceVals),
      maxSource: Math.max(...sourceVals),
      minOverhead: Math.min(...overheadVals),
      maxOverhead: Math.max(...overheadVals),
      count: history.length,
      oldest: history[0].time,
      newest: history[history.length - 1].time,
    };
  }, [history]);

  const insights = useMemo<Insight[]>(() => {
    if (!stats || history.length < 2) return [];

    const oldest = history[0];
    const newest = history[history.length - 1];
    const spanMs = Math.max(1, newest.time - oldest.time);
    const spanHours = spanMs / (60 * 60 * 1000);

    // Guard against degenerate windows: if the fetched readings span less than
    // ~2 minutes, a rate (%/hr) would be a meaningless near-zero-division.
    const tooShort =
      spanMs < 2 * 60 * 1000 ||
      (newest.overhead === oldest.overhead && newest.source === oldest.source);

    // Overhead consumption rate (%/hr) — a drop in overhead level over time
    const overheadDrop = oldest.overhead - newest.overhead;
    const consumptionRate = tooShort ? 0 : overheadDrop / spanHours;

    // Time-to-empty for overhead at current consumption rate
    const timeToEmptyMs =
      !tooShort && consumptionRate > 0
        ? (newest.overhead / consumptionRate) * (60 * 60 * 1000)
        : Infinity;

    // Source drain rate (%/hr) — a drop in source level over time
    const sourceDrop = oldest.source - newest.source;
    const sourceDrainRate = tooShort ? 0 : sourceDrop / spanHours;

    // Time-to-dry for source at current drain rate
    const timeToDryMs =
      !tooShort && sourceDrainRate > 0
        ? (newest.source / sourceDrainRate) * (60 * 60 * 1000)
        : Infinity;

    const items: Insight[] = [];

    items.push({
      label: "Overhead Consumption Rate",
      value: tooShort
        ? "Not enough time elapsed"
        : consumptionRate > 0
          ? `${consumptionRate.toFixed(1)} %/hr`
          : "Steady / no drop",
      icon: {
        ios: "arrow.down.right",
        android: "trending_down",
        web: "trending_down",
      },
      color: tooShort ? "#8c8c8c" : consumptionRate > 0 ? "#ffa940" : "#52c41a",
    });

    items.push({
      label: "Est. Time to Empty (Overhead)",
      value: tooShort ? "—" : formatHours(timeToEmptyMs),
      icon: {
        ios: "hourglass",
        android: "hourglass_empty",
        web: "hourglass_empty",
      },
      color: "#1890ff",
    });

    items.push({
      label: "Source Drain Rate",
      value: tooShort
        ? "Not enough time elapsed"
        : sourceDrainRate > 0
          ? `${sourceDrainRate.toFixed(1)} %/hr`
          : "Steady / refilling",
      icon: {
        ios: "arrow.down.right",
        android: "trending_down",
        web: "trending_down",
      },
      color: tooShort ? "#8c8c8c" : sourceDrainRate > 0 ? "#ffa940" : "#52c41a",
    });

    items.push({
      label: "Est. Time to Dry (Source)",
      value: tooShort ? "—" : formatHours(timeToDryMs),
      icon: {
        ios: "hourglass.bottomhalf.filled",
        android: "hourglass_bottom",
        web: "hourglass_bottom",
      },
      color: "#ff4d4f",
    });

    return items;
  }, [stats, history]);

  const chartData = useMemo(() => {
    // Use the most recent 30 readings for a readable chart
    return history.slice(-30);
  }, [history]);

  return (
    <PageFrame
      title="Analytics"
      subtitle="Usage insights from live ThingSpeak data"
      icon={{ ios: "chart.bar.fill", android: "insights", web: "insights" }}
    >
      <ThemedText type="small" themeColor="textSecondary">
        Analytics are computed from the last {history.length || 100} readings of
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
            Load at least two readings to see usage insights. In demo mode,
            switch to a live ThingSpeak channel.
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
