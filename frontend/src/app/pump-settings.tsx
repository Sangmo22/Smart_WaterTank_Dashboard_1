import React, { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator } from "react-native";

import { Pressable, View, StyleSheet } from "react-native";

import { SymbolView } from "expo-symbols";
import { PageFrame } from "@/components/page-frame";
import { ThemedText } from "@/components/themed-text";
import { useThingSpeak } from "@/hooks/use-thingspeak";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// ─── Safety Thresholds ────────────────────────────────────────────────────────
const OVERHEAD_MAX_PCT = 98; // pump must stop if overhead >= this
const SOURCE_MIN_PCT = 5;    // pump must stop if source <= this

// ─── Backend API base URL ─────────────────────────────────────────────────────
// On web the Vercel rewrite forwards /api/* to the backend at the same origin.
// On native (Expo Go / dev build) you need your LAN IP, e.g. "http://192.168.x.x:5000"
const API_BASE =
  typeof window !== "undefined" && window.location
    ? ""           // web: same-origin
    : "http://localhost:5000"; // native fallback

// ─── usePumpControl hook ───────────────────────────────────────────────────────
interface PumpStateData {
  pumpState: 0 | 1;
  pumpMode: "manual" | "auto";
}

function usePumpControl() {
  const [tankId, setTankId] = useState<string | null>(null);
  const [pumpData, setPumpData] = useState<PumpStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingCmd, setSendingCmd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fetch or auto-create the first tank, then begin polling pump state */
  const initTank = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load existing tanks
      let res = await fetch(`${API_BASE}/api/tanks`);
      if (!res.ok) throw new Error(`Failed to load tanks (${res.status})`);
      const json = await res.json();

      let id: string | null = null;

      if (json.data && json.data.length > 0) {
        id = json.data[0]._id as string;
      } else {
        // Auto-create a default tank
        res = await fetch(`${API_BASE}/api/tanks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Water Tank",
            capacityLiters: 1000,
            location: "Home",
          }),
        });
        if (!res.ok) throw new Error(`Failed to create tank (${res.status})`);
        const created = await res.json();
        id = created.data._id as string;
      }

      setTankId(id);
    } catch (err: any) {
      setError(err?.message ?? "Cannot reach backend. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  /** Poll current pump state */
  const fetchPumpState = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tanks/${id}/pump`);
      if (!res.ok) return;
      const json = await res.json();
      setPumpData(json.data as PumpStateData);
    } catch {
      // Silently ignore transient poll errors
    }
  }, []);

  // Start polling once tankId is known
  useEffect(() => {
    if (!tankId) return;
    fetchPumpState(tankId);
    pollRef.current = setInterval(() => fetchPumpState(tankId), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tankId, fetchPumpState]);

  // Init on mount
  useEffect(() => {
    initTank();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [initTank]);

  /** Send a manual pump command (0 = OFF, 1 = ON) */
  const sendPumpCommand = useCallback(
    async (state: 0 | 1): Promise<boolean> => {
      if (!tankId) return false;
      setSendingCmd(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/tanks/${tankId}/pump`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error ?? `Request failed (${res.status})`);
        }
        const json = await res.json();
        setPumpData(json.data as PumpStateData);
        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to send pump command");
        return false;
      } finally {
        setSendingCmd(false);
      }
    },
    [tankId],
  );

  return { tankId, pumpData, loading, sendingCmd, error, sendPumpCommand };
}

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

  const { pumpData, loading, sendingCmd, sendPumpCommand } =
    usePumpControl();


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

  const buttonDisabled = sendingCmd || safetyBlocked || (!config.isDemoMode && !pumpData && loading);

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

      {/* ── Current Pump Status row ── */}
      <View style={styles.statusRow}>
        {loading ? (
          <ActivityIndicator size="small" color={(theme as any).tint} />
        ) : (
          <View
            style={[
              styles.statusDot,
              { backgroundColor: effectivePumpOn ? "#52c41a" : "#ff4d4f" },
            ]}
          />
        )}
        <ThemedText type="smallBold">
          Pump is {effectivePumpOn ? "ON" : "OFF"}
        </ThemedText>
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
                ? "Turn Pump OFF  (→ 0)"
                : "Turn Pump ON  (→ 1)"}
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
