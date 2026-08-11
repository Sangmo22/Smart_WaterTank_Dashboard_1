import React, { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { PageFrame } from "@/components/page-frame";
import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Spacing } from "@/constants/theme";
import { useAlerts } from "@/state/alerts-store";

function getSeverityColor(type: "info" | "warning" | "error" | "success") {
  switch (type) {
    case "error":
      return "#ff4d4f";
    case "warning":
      return "#ffa940";
    case "success":
      return "#52c41a";
    default:
      return "#1890ff";
  }
}

function formatAlertTime(time: string) {
  return time;
}

export default function AlertsScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];

  const alerts = useAlerts();

  const data = useMemo(() => {
    // store keeps newest first; render newest -> oldest
    return alerts;
  }, [alerts]);

  return (
    <PageFrame
      title="Alerts"
      subtitle="System notifications and warnings"
      icon={{
        ios: "bell.fill",
        android: "notifications",
        web: "notifications",
      }}
    >
      <ThemedText type="small" themeColor="textSecondary">
        Alerts fire when tank levels cross thresholds or the pump state changes.
      </ThemedText>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
          },
        ]}
      >
        {data.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No alerts yet.
          </ThemedText>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const color = getSeverityColor(item.type);
              return (
                <View style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <View style={styles.rowMain}>
                    <View style={styles.rowTop}>
                      <ThemedText type="smallBold">{item.message}</ThemedText>
                    </View>
                    <ThemedText type="code" themeColor="textSecondary">
                      {formatAlertTime(item.time)}
                    </ThemedText>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  listContent: {
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.18)",
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
