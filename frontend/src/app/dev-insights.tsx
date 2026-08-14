import { PageFrame } from "@/components/page-frame";
import { ThemedText } from "@/components/themed-text";
import { Colors, Spacing } from "@/constants/theme";
import { useThingSpeak } from "@/hooks/use-thingspeak";
import { useThingSpeakHistory } from "@/hooks/use-thingspeak-history";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

function msToHuman(ms: number) {
  if (!isFinite(ms) || ms <= 0) return "—";
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `~${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `~${Math.round(hours)} hr${hours >= 2 ? "s" : ""}`;
  return `~${Math.round(hours / 24)} day${hours >= 48 ? "s" : ""}`;
}

function computeInsights(
  history: { time: number; source: number; overhead: number }[] | null,
) {
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

function predictHeuristic(
  recentReadings: { overhead: number }[],
  weather: { temp: number; humidity: number; rainProbability: number },
) {
  let predictedUsage = 0.15;
  const { temp, humidity, rainProbability } = weather;
  if (temp > 25) {
    const tempFactor = Math.min((temp - 25) * 0.01, 0.15);
    predictedUsage += tempFactor;
  }
  if (humidity < 40) predictedUsage += 0.05;
  if (rainProbability > 0.5) predictedUsage -= 0.08;

  if (recentReadings.length >= 2) {
    const first = recentReadings[0];
    const last = recentReadings[recentReadings.length - 1];
    const levelDiff = first.overhead - last.overhead;
    if (levelDiff > 0) predictedUsage += (levelDiff / 100) * 0.1;
  }

  predictedUsage = Math.max(
    0.0,
    Math.min(1.0, parseFloat(predictedUsage.toFixed(4))),
  );
  return predictedUsage;
}

export default function DevInsights() {
  const { config } = useThingSpeak();
  const { history, loading, error, refresh, isDemoMode } = useThingSpeakHistory(
    config,
    1000,
  );
  const [weather] = useState({ temp: 30, humidity: 50, rainProbability: 0.2 });

  const insights = useMemo(() => computeInsights(history as any), [history]);

  const predictedUsage = useMemo(() => {
    if (!history || history.length === 0) return null;
    return predictHeuristic((history as any).slice(-8), weather);
  }, [history, weather]);

  const exportCsv = (hist: any[]) => {
    if (!hist || hist.length === 0) return;
    const rows: any[] = [];
    rows.push([
      "time_iso",
      "sourceRaw",
      "overheadRaw",
      "sourcePct",
      "overheadPct",
      "anomaly",
    ]);
    for (const p of hist) {
      const time = p.time ? new Date(p.time).toISOString() : "";
      const srcRaw = p.sourceRaw != null ? p.sourceRaw : "";
      const ovhRaw = p.overheadRaw != null ? p.overheadRaw : "";
      const srcPct = p.source != null ? p.source : "";
      const ovhPct = p.overhead != null ? p.overhead : "";
      const anomaly =
        (typeof srcRaw === "number" && srcRaw <= 0) ||
        (typeof ovhRaw === "number" && ovhRaw <= 0)
          ? "1"
          : "0";
      rows.push([time, srcRaw, ovhRaw, srcPct, ovhPct, anomaly]);
    }

    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      (window as any).document
    ) {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thingspeak_export_${new Date().toISOString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Fallback for native: print CSV to console so user can copy
      // (implement native sharing if needed)
      // eslint-disable-next-line no-console
      console.log(csv);
      // eslint-disable-next-line no-alert
      alert(
        "CSV output printed to console. Run the app on web to download directly.",
      );
    }
  };

  const scheme = "light";
  const theme = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <PageFrame
      title="Developer Insights"
      subtitle="Raw feed, computed insights and heuristic forecast"
      icon={{ ios: "bug", android: "bug_report", web: "bug_report" }}
    >
      <ThemedText type="small" themeColor="textSecondary">
        This developer panel shows raw ThingSpeak data, computed consumption
        rates, and the backend heuristic forecast.
      </ThemedText>

      <View style={styles.row}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundSelected + "22" },
          ]}
        >
          <ThemedText type="smallBold">Readings</ThemedText>
          <ThemedText type="small">{history.length || 0}</ThemedText>
        </View>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundSelected + "22" },
          ]}
        >
          <ThemedText type="smallBold">Span</ThemedText>
          <ThemedText type="small">
            {insights ? insights.spanHours.toFixed(2) + " hr" : "—"}
          </ThemedText>
        </View>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundSelected + "22" },
          ]}
        >
          <ThemedText type="smallBold">Overhead Rate</ThemedText>
          <ThemedText type="small">
            {insights
              ? insights.consumptionRatePerHour.toFixed(3) + " %/hr"
              : "—"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.cardLarge}>
        <ThemedText type="smallBold">Est. Time to Empty (Overhead)</ThemedText>
        <ThemedText type="small">
          {insights && isFinite(insights.timeToEmptyMs)
            ? msToHuman(insights.timeToEmptyMs)
            : "—"}
        </ThemedText>
        <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
          Est. Time to Dry (Source)
        </ThemedText>
        <ThemedText type="small">
          {insights && isFinite(insights.timeToDryMs)
            ? msToHuman(insights.timeToDryMs)
            : "—"}
        </ThemedText>
      </View>

      <View style={styles.cardLarge}>
        <ThemedText type="smallBold">
          Heuristic Forecast (sample weather)
        </ThemedText>
        <ThemedText type="small">
          Temp: {weather.temp}°C · Humidity: {weather.humidity}% · RainProb:{" "}
          {weather.rainProbability}
        </ThemedText>
        <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
          Predicted usage (next 4h)
        </ThemedText>
        <ThemedText type="small">
          {predictedUsage !== null
            ? (predictedUsage * 100).toFixed(2) + "%"
            : "—"}
        </ThemedText>
      </View>

      <View style={{ flexDirection: "row", gap: Spacing.three }}>
        <Pressable
          onPress={() => refresh()}
          style={({ pressed }) => [
            {
              padding: Spacing.two,
              backgroundColor: theme.backgroundSelected,
              borderRadius: 8,
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <ThemedText type="smallBold">Refresh Feed</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => exportCsv(history as any)}
          style={({ pressed }) => [
            {
              padding: Spacing.two,
              backgroundColor: "#0ea5e9",
              borderRadius: 8,
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <ThemedText type="smallBold">Export CSV</ThemedText>
        </Pressable>
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.three,
    marginVertical: Spacing.three,
  },
  card: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  cardLarge: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    marginVertical: Spacing.three,
  },
});
