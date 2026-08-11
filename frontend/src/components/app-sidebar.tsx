import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useRouter, usePathname } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const menuItems = [
  { key: "dashboard", label: "Dashboard", route: "/" },
  { key: "analytics", label: "Analytics", route: "/analytics" },
  { key: "alerts", label: "Alerts", route: "/alerts" },
  { key: "pump-settings", label: "Pump Settings", route: "/pump-settings" },
  { key: "settings", label: "Settings", route: "/settings" },
] as const;

export const menuIcons = {
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

export type MenuKey = (typeof menuItems)[number]["key"];

/** Derive the active menu key from the current route path. */
export function getActiveMenuKey(pathname: string): MenuKey {
  if (pathname === "/" || pathname === "/index") return "dashboard";
  if (pathname === "/analytics") return "analytics";
  if (pathname === "/alerts") return "alerts";
  if (pathname === "/pump-settings") return "pump-settings";
  if (pathname === "/settings") return "settings";
  return "dashboard";
}

type AppMenuItemsProps = {
  /** Callback fired after a menu item is selected (e.g. to close a drawer). */
  onNavigate?: () => void;
};

/**
 * Renders the navigation menu list (Dashboard / Analytics / Alerts / Pump
 * Settings / Settings). Reused by both the persistent web sidebar and the
 * mobile drawer so every page shares identical navigation.
 */
export function AppMenuItems({ onNavigate }: AppMenuItemsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  const activeKey = getActiveMenuKey(pathname);

  return (
    <View style={styles.list}>
      {menuItems.map((item) => {
        const selected = activeKey === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              onNavigate?.();
              router.replace(item.route);
            }}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: selected ? "#1d5cff" : "transparent",
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={styles.itemIcon}>
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
    </View>
  );
}

/** Shared drawer header (title + close button). */
export function MenuDrawerHeader({ onClose }: { onClose: () => void }) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  return (
    <View style={styles.drawerHeader}>
      <ThemedText type="subtitle" style={styles.drawerTitle}>
        Menu
      </ThemedText>
      <Pressable onPress={onClose} style={styles.drawerCloseButton}>
        <SymbolView
          name={{ ios: "xmark", android: "close", web: "close" }}
          size={20}
          tintColor={theme.text}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  itemIcon: {
    width: 24,
    alignItems: "center",
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
});
