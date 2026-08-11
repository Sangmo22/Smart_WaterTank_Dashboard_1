import React, { useEffect, useState } from "react";
import { Switch } from "react-native";
import { getAlertsEnabled, setAlertsEnabled } from "@/services/notification.service";
import { Pressable, View, StyleSheet } from "react-native";

import { SymbolView } from "expo-symbols";
import { PageFrame } from "@/components/page-frame";
import { ThemedText } from "@/components/themed-text";
import { useThingSpeak } from "@/hooks/use-thingspeak";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function PumpSettingsScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  const { config, isSimulatingFlow, startSimulatedFlow, stopSimulatedFlow } =
    useThingSpeak();

  const pumpOn = isSimulatingFlow;
  const [alertsEnabled, setAlertsEnabledState] = useState(false);

  useEffect(() => {
    (async () => {
      const enabled = await getAlertsEnabled();
      setAlertsEnabledState(enabled);
    })();
  }, []);

  const toggleAlerts = async () => {
    const newVal = !alertsEnabled;
    await setAlertsEnabled(newVal);
    setAlertsEnabledState(newVal);
  };

  return (
    <PageFrame
      title="Pump Settings"
      subtitle="Turn the transfer pump on or off"
      icon={{ ios: "switch.2", android: "tune", web: "tune" }}
    >
      <ThemedText type="small" themeColor="textSecondary">
        {config.isDemoMode
          ? "Use this page to control the simulated water transfer pump."
          : "Pump control is available in demo mode. Switch to demo mode from the dashboard settings if you want to test it here."}
      </ThemedText>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: pumpOn ? "#52c41a" : "#ff4d4f" },
          ]}
        />
        <ThemedText type="smallBold">
          Pump is {pumpOn ? "ON" : "OFF"}
        </ThemedText>
      </View>

      <Pressable
        onPress={pumpOn ? stopSimulatedFlow : startSimulatedFlow}
        disabled={!config.isDemoMode}
        style={({ pressed }) => [
          styles.toggleButton,
          { backgroundColor: pumpOn ? "#ff4d4f" : "#52c41a" },
          !config.isDemoMode && { opacity: 0.45 },
          pressed && config.isDemoMode && { opacity: 0.85 },
        ]}
      >
        <SymbolView
          name={
            pumpOn
              ? { ios: "pause.fill", android: "pause", web: "pause" }
              : { ios: "play.fill", android: "play_arrow", web: "play_arrow" }
          }
          size={16}
          tintColor="#fff"
        />
        <ThemedText type="smallBold" style={{ color: "#fff" }}>
          {pumpOn ? "Pump OFF" : "Pump ON"}
        </ThemedText>
        </Pressable>
        <View style={styles.alertRow}>
          <ThemedText type="small" themeColor="textSecondary">Enable Low Source Alerts</ThemedText>
          <Switch
            value={alertsEnabled}
            onValueChange={toggleAlerts}
            disabled={!config.isDemoMode}
          />
        </View>

      <ThemedText type="small" themeColor="textSecondary">
        {config.isDemoMode
          ? "The pump moves water from the source tank to the overhead tank in simulation."
          : "Enable demo mode to test the pump control button."}
      </ThemedText>
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
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
});
