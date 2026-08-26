import React, { useState } from "react";
import { ActivityIndicator } from "react-native";

import { Pressable, View, StyleSheet } from "react-native";

import { SymbolView } from "expo-symbols";
import { PageFrame } from "@/components/page-frame";
import { ThemedText } from "@/components/themed-text";
import { useThingSpeak } from "@/hooks/use-thingspeak";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePumpControl } from "@/hooks/use-pump-control";

// ─── Safety Thresholds ────────────────────────────────────────────────────────
const OVERHEAD_MAX_PCT = 98; // pump must stop if overhead >= this
const SOURCE_MIN_PCT = 5;    // pump must stop if source <= this

// ─── PumpSettingsScreen ───────────────────────────────────────────────────────
export default function PumpSettingsScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];

  const {
    config,
    data,
    isSimulatingFlow,
    startSimulatedFlow,
    stopSimulatedFlow,
  } = useThingSpeak();

  const { pumpData, sendingCmd, error, sendPumpCommand } =
    usePumpControl(config.isDemoMode);


  // ── Safety gate ──────────────────────────────────────────────────────────────
  const overheadPct = Math.round(data.overheadLevel);
  const sourcePct = Math.round(data.sourceLevel);
  const overheadBlocked = overheadPct >= OVERHEAD_MAX_PCT;
  const sourceBlocked = sourcePct <= SOURCE_MIN_PCT;
  const safetyBlocked = overheadBlocked || sourceBlocked;

  // ── Effective pump state ─────────────────────────────────────────────────────
  // Demo mode reflects the simulation; live mode reflects the backend record.
  const effectivePumpOn = config.isDemoMode
    ? isSimulatingFlow
    : pumpData?.pumpState === 1;

  const pumpMode = pumpData?.pumpMode ?? "auto";

  // True until the backend reports a real pump state (live mode only).
  // While connecting, the UI must not claim "Pump is OFF" - it is unknown.
  const isConnecting = !config.isDemoMode && !pumpData;

  // ── Handle button press ──────────────────────────────────────────────────────
  const handleToggle = async () => {
    const nextOn = !effectivePumpOn;

    if (config.isDemoMode) {
      // Drive the simulation visuals
      nextOn ? startSimulatedFlow() : stopSimulatedFlow();
    }

    // Always record command in backend
    await sendPumpCommand(nextOn ? 1 : 0);
  };

  const buttonDisabled = sendingCmd || safetyBlocked || isConnecting;

  // ── Blocked reason string ────────────────────────────────────────────────────
  const blockedReason = overheadBlocked
    ? `Overhead tank is ${overheadPct}% full (limit: ≤ ${OVERHEAD_MAX_PCT - 1}%)`
    : sourceBlocked
      ? `Source tank is only ${sourcePct}% (minimum: ≥ ${SOURCE_MIN_PCT + 1}%)`
      : null;

  return (
    <PageFrame
      title="Pump Settings"
      subtitle="Manual pump control & safety status"
      icon={{ ios: "switch.2", android: "tune", web: "tune" }}
    >

      {/* ── Safety Conditions Panel ── */}
      <View style={[styles.safetyPanel, { borderColor: (theme as any).border ?? "#333" }]}>
        <ThemedText type="smallBold" style={styles.sectionLabel}>
          Safety Conditions
        </ThemedText>

        {/* Overhead Tank row */}
        <View style={styles.conditionRow}>
          <View style={styles.conditionLeft}>
            <View
              style={[
                styles.conditionDot,
                { backgroundColor: overheadBlocked ? "#ff4d4f" : "#52c41a" },
              ]}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Overhead Tank
            </ThemedText>
          </View>
          <View style={styles.conditionRight}>
            <ThemedText
              type="smallBold"
              style={{ color: overheadBlocked ? "#ff4d4f" : "#52c41a" }}
            >
              {overheadPct}%
            </ThemedText>
            <ThemedText
              type="small"
              style={{ color: overheadBlocked ? "#ff4d4f" : "#52c41a", marginLeft: 4 }}
            >
              {overheadBlocked ? `≥ ${OVERHEAD_MAX_PCT}% ✗` : `< ${OVERHEAD_MAX_PCT}% ✓`}
            </ThemedText>
          </View>
        </View>

        {/* Source Tank row */}
        <View style={styles.conditionRow}>
          <View style={styles.conditionLeft}>
            <View
              style={[
                styles.conditionDot,
                { backgroundColor: sourceBlocked ? "#ff4d4f" : "#52c41a" },
              ]}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Source Tank
            </ThemedText>
          </View>
          <View style={styles.conditionRight}>
            <ThemedText
              type="smallBold"
              style={{ color: sourceBlocked ? "#ff4d4f" : "#52c41a" }}
            >
              {sourcePct}%
            </ThemedText>
            <ThemedText
              type="small"
              style={{ color: sourceBlocked ? "#ff4d4f" : "#52c41a", marginLeft: 4 }}
            >
              {sourceBlocked ? `≤ ${SOURCE_MIN_PCT}% ✗` : `> ${SOURCE_MIN_PCT}% ✓`}
            </ThemedText>
          </View>
        </View>

        {/* Overall availability badge */}
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: safetyBlocked
                ? "rgba(255,77,79,0.12)"
                : "rgba(82,196,26,0.12)",
              borderColor: safetyBlocked ? "#ff4d4f" : "#52c41a",
            },
          ]}
        >
          <SymbolView
            name={
              safetyBlocked
                ? { ios: "xmark.circle", android: "cancel", web: "cancel" }
                : { ios: "checkmark.circle", android: "check_circle", web: "check_circle" }
            }
            size={14}
            tintColor={safetyBlocked ? "#ff4d4f" : "#52c41a"}
          />
          <ThemedText
            type="smallBold"
            style={{ color: safetyBlocked ? "#ff4d4f" : "#52c41a" }}
          >
            {safetyBlocked ? "Pump Blocked" : "Pump Available"}
          </ThemedText>
        </View>

        {/* Blocked reason */}
        {blockedReason ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.blockedReason}>
            ⚠ {blockedReason}
          </ThemedText>
        ) : null}
      </View>

      {/* ── Backend connection error ── */}
      {error ? (
        <View
          style={[
            styles.bannerRow,
            { backgroundColor: "rgba(255,77,79,0.12)", borderWidth: 1, borderColor: "#ff4d4f" },
          ]}
        >
          <ThemedText type="small" style={{ color: "#ff4d4f", flexShrink: 1 }}>
            ⚠ {error}
          </ThemedText>
        </View>
      ) : null}

      {/* ── Current Pump Status row ── */}
      <View style={styles.statusRow}>
        {isConnecting ? (
          <>
            <ActivityIndicator size="small" color={(theme as any).tint} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              Connecting to server…
            </ThemedText>
          </>
        ) : (
          <>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: effectivePumpOn ? "#52c41a" : "#ff4d4f" },
              ]}
            />
            <ThemedText type="smallBold">
              Pump is {effectivePumpOn ? "ON" : "OFF"}
            </ThemedText>
          </>
        )}
        {!isConnecting && (
          <View
            style={[
              styles.modeBadge,
              {
                backgroundColor:
                  pumpMode === "manual"
                    ? "rgba(250,173,20,0.18)"
                    : "rgba(82,196,26,0.12)",
              },
            ]}
          >
            <ThemedText
              type="small"
              style={{ color: pumpMode === "manual" ? "#faad14" : "#52c41a" }}
            >
              {pumpMode.toUpperCase()}
            </ThemedText>
          </View>
        )}
      </View>

      {/* ── Manual Control Button ── */}
      <Pressable
        onPress={handleToggle}
        disabled={buttonDisabled}
        style={({ pressed }) => [
          styles.toggleButton,
          {
            backgroundColor: safetyBlocked
              ? "#555"
              : effectivePumpOn
                ? "#ff4d4f"
                : "#52c41a",
          },
          buttonDisabled && { opacity: 0.5 },
          pressed && !buttonDisabled && { opacity: 0.85 },
        ]}
      >
        {sendingCmd ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <SymbolView
            name={
              effectivePumpOn
                ? { ios: "pause.fill", android: "pause", web: "pause" }
                : { ios: "play.fill", android: "play_arrow", web: "play_arrow" }
            }
            size={16}
            tintColor="#fff"
          />
        )}
        <ThemedText type="smallBold" style={{ color: "#fff" }}>
          {sendingCmd
            ? "Sending command…"
            : safetyBlocked
              ? "Pump Blocked"
              : effectivePumpOn
                ? "Turn Pump OFF"
                : "Turn Pump ON"}
        </ThemedText>
      </Pressable>


    </PageFrame>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toggleButton: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  safetyPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionLabel: {
    marginBottom: 2,
  },
  conditionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  conditionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  conditionRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  conditionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  blockedReason: {
    marginTop: 2,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
});
