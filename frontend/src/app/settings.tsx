import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { PageFrame } from "@/components/page-frame";
import { ThemedText } from "@/components/themed-text";
import { useThingSpeak } from "@/hooks/use-thingspeak";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getThemeMode, setThemeMode, ThemeMode } from "@/hooks/use-color-scheme.shared";
import { SymbolView } from "expo-symbols";

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  const { config } = useThingSpeak();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    setThemeModeState(getThemeMode());
  }, []);

  const handleThemeSelect = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await setThemeMode(mode);
  };

  const themeOptions: { label: string; value: ThemeMode; icon: object; desc: string }[] = [
    {
      label: "Light",
      value: "light",
      icon: { ios: "sun.max.fill", android: "light_mode", web: "light_mode" },
      desc: "Always use the bright theme",
    },
    {
      label: "Dark",
      value: "dark",
      icon: { ios: "moon.fill", android: "dark_mode", web: "dark_mode" },
      desc: "Always use the dark theme",
    },
    {
      label: "System",
      value: "system",
      icon: { ios: "circle.lefthalf.filled", android: "brightness_auto", web: "brightness_auto" },
      desc: "Follow device setting",
    },
  ];

  return (
    <PageFrame
      title="Settings"
      subtitle="Channel and theme configuration"
      icon={{ ios: "gearshape.fill", android: "settings", web: "settings" }}
    >
      {/* Theme Selector */}
      <View style={[styles.section, { borderColor: theme.backgroundSelected }]}>
        <View style={styles.sectionHeader}>
          <SymbolView
            name={{ ios: "paintpalette.fill", android: "palette", web: "palette" }}
            size={16}
            tintColor={theme.text}
          />
          <ThemedText type="smallBold" style={styles.sectionTitle}>
            Appearance
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.three }}>
          Choose between light and dark theme, or follow your device setting.
        </ThemedText>
        <View style={styles.themeOptionsRow}>
          {themeOptions.map((opt) => {
            const selected = themeMode === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handleThemeSelect(opt.value)}
                style={({ pressed }) => [
                  styles.themeOption,
                  {
                    backgroundColor: selected
                      ? "#1d5cff"
                      : theme.backgroundElement,
                    borderColor: selected ? "#1d5cff" : theme.backgroundSelected,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <SymbolView
                  name={opt.icon as any}
                  size={22}
                  tintColor={selected ? "#fff" : theme.textSecondary}
                />
                <ThemedText
                  type="smallBold"
                  style={{ color: selected ? "#fff" : theme.text, fontSize: 13 }}
                >
                  {opt.label}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{
                    color: selected ? "rgba(255,255,255,0.75)" : theme.textSecondary,
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  {opt.desc}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Channel Info */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <SymbolView
            name={{ ios: "antenna.radiowaves.left.and.right", android: "wifi", web: "wifi" }}
            size={16}
            tintColor={theme.text}
          />
          <ThemedText type="smallBold" style={styles.sectionTitle}>ThingSpeak Channel</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">Channel ID</ThemedText>
        <ThemedText type="smallBold">{config.channelId}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
          Use the dashboard settings modal to edit polling, fields, and channel configuration.
        </ThemedText>
      </View>


    </PageFrame>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontSize: 15,
  },
  themeOptionsRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  themeOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    alignItems: "center",
    gap: Spacing.one,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.two,
  },

});
