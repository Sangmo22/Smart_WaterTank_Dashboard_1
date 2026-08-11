import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { ThemedText } from "@/components/themed-text";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type Props = {
  title: string;
  subtitle?: string;
  /** Optional callback to open the sidebar/drawer (used by PageFrame). */
  onMenuPress?: () => void;
};

export function NavigationHeader({ title, subtitle, onMenuPress }: Props) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <View style={styles.header}>
      <View style={styles.titleGroup}>
        {/* Hamburger menu button */}
        <Pressable
          onPress={onMenuPress}
          style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.7 }]}
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
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  menuBtn: {
    padding: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
});
