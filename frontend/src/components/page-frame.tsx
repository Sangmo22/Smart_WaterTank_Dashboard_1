import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { NavigationHeader } from "@/components/navigation-header";
import { AppMenuItems, MenuDrawerHeader } from "@/components/app-sidebar";
import { Colors, MaxContentWidth, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type PageFrameProps = {
  title: string;
  subtitle?: string;
  /** @deprecated icon is no longer rendered in PageFrame — kept for backward compat */
  icon?: {
    ios: string;
    android: string;
    web: string;
  };
  children: React.ReactNode;
};

export function PageFrame({ title, subtitle, children }: PageFrameProps) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  const isWeb = Platform.OS === "web";
  const [menuVisible, setMenuVisible] = useState(isWeb);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={styles.layoutRow}>
        {/* Persistent sidebar on web */}
        {isWeb && menuVisible ? (
          <View
            style={[
              styles.sidebarPanel,
              {
                backgroundColor: theme.background,
                borderColor: theme.backgroundSelected,
              },
            ]}
          >
            <MenuDrawerHeader onClose={() => setMenuVisible(false)} />
            <AppMenuItems />
          </View>
        ) : null}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.container}>
            {/* Menu bar — same as dashboard. On web this provides the hamburger
                toggle; on native it opens the mobile drawer. */}
            <NavigationHeader
              title={title}
              subtitle={subtitle}
              onMenuPress={() => setMenuVisible(true)}
            />

            {/* Page content */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              {children}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Slide-out drawer for native (and web when sidebar is toggled closed) */}
      <Modal
        visible={!isWeb && menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <Pressable
            style={[styles.drawerPanel, { backgroundColor: theme.background }]}
            onPress={() => undefined}
          >
            <MenuDrawerHeader onClose={() => setMenuVisible(false)} />
            <AppMenuItems onNavigate={() => setMenuVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // On web, make sure the safe area covers the full viewport height
    ...(Platform.OS === "web" ? ({ minHeight: "100vh" } as any) : {}),
  },
  layoutRow: {
    flex: 1,
    flexDirection: "row",
  },
  sidebarPanel: {
    width: 290,
    borderRightWidth: 1,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.four,
  },
  container: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    gap: Spacing.five,
    flexGrow: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    flexDirection: "row",
  },
  drawerPanel: {
    width: 290,
    minHeight: "100%",
    maxHeight: "100%",
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 6, height: 0 },
    elevation: 10,
  },
});
