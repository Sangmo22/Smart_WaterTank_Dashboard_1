import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface WaterTankProps {
  title: string;
  type: "source" | "overhead";
  level: number; // 0 to 100
  rawValue: number;
  readingLabel?: string;
  readingUnit?: string;
  loading?: boolean;
}

export function WaterTank({
  title,
  type,
  level,
  rawValue,
  readingLabel = "Raw Value",
  readingUnit = "units",
  loading = false,
}: WaterTankProps) {
  const scheme = useColorScheme();
  const themeScheme = scheme === "dark" ? "dark" : "light";
  const theme = Colors[themeScheme];

  // Animated shared value for water level height percentage
  const animatedLevel = useSharedValue(level);

  useEffect(() => {
    animatedLevel.value = withTiming(level, { duration: 800 });
  }, [level]);

  // Status computation
  const getStatus = () => {
    if (type === "source") {
      if (level <= 10)
        return { label: "Dry / Critical", color: "#ff4d4f", type: "error" };
      if (level <= 30)
        return { label: "Low Level", color: "#ffa940", type: "warning" };
      if (level >= 95)
        return { label: "Full / Capable", color: "#52c41a", type: "success" };
      return { label: "Sufficient", color: "#1890ff", type: "normal" };
    } else {
      if (level <= 10)
        return { label: "Empty / Critical", color: "#ff4d4f", type: "error" };
      if (level <= 25)
        return { label: "Low Level", color: "#ffa940", type: "warning" };
      if (level >= 95)
        return { label: "Full / Loaded", color: "#52c41a", type: "success" };
      return { label: "Normal Distribution", color: "#1890ff", type: "normal" };
    }
  };

  const status = getStatus();

  // Animated styles for water height and color
  const animatedWaterStyle = useAnimatedStyle(() => {
    // Height runs from 0% to 100% of the container
    const heightStr = `${animatedLevel.value}%`;

    // Dynamic color interpolation based on level
    const backgroundColor = interpolateColor(
      animatedLevel.value,
      [0, 20, 50, 95],
      [
        "#ff4d4f", // Red for 0%
        "#ffa940", // Orange for 20%
        "#1890ff", // Blue for 50%
        "#096dd9", // Dark Blue for 95%
      ],
    );

    return {
      height: heightStr,
      backgroundColor,
    } as any;
  });

  // Animated styles for the water wave crest
  const animatedWaveStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      animatedLevel.value,
      [0, 20, 50, 95],
      [
        "#ff7875", // Light Red
        "#ffd591", // Light Orange
        "#69c0ff", // Light Blue
        "#40a9ff", // Lighter Dark Blue
      ],
    );

    return {
      backgroundColor,
      // Hide wave crest if empty
      opacity: animatedLevel.value > 0 ? 1 : 0,
    };
  });

  // Decide icon based on status
  const getStatusIconName = () => {
    switch (status.type) {
      case "error":
        return {
          ios: "exclamationmark.triangle.fill",
          android: "warning",
          web: "warning",
        };
      case "warning":
        return {
          ios: "exclamationmark.circle.fill",
          android: "info",
          web: "info",
        };
      case "success":
        return {
          ios: "checkmark.circle.fill",
          android: "check_circle",
          web: "check_circle",
        };
      default:
        return { ios: "drop.fill", android: "water_drop", web: "water_drop" };
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <SymbolView
            name={
              type === "source"
                ? {
                    ios: "square.grid.3x1.below.line.grid.1x2",
                    android: "warehouse",
                    web: "warehouse",
                  }
                : {
                    ios: "arrow.up.and.down.righttriangle.up.righttriangle.down",
                    android: "house_siding",
                    web: "house_siding",
                  }
            }
            size={18}
            tintColor={theme.text}
          />
          <View>
            <ThemedText type="smallBold" style={styles.cardTitle}>
              {title}
            </ThemedText>
            <ThemedText
              type="code"
              themeColor="textSecondary"
              style={styles.cardSubtitle}
            >
              {type === "source"
                ? "Source supply tank"
                : "Overhead distribution tank"}
            </ThemedText>
          </View>
        </View>

        {loading && <View style={styles.loadingPulse} />}
      </View>

      <View style={styles.mainContent}>
        {/* The cylinder tank representation */}
        <View
          style={[
            styles.tankContainer,
            { borderColor: theme.backgroundSelected },
          ]}
        >
          {/* Grids / Markers inside the tank */}
          <View style={styles.markersContainer}>
            <View style={styles.markerLine}>
              <ThemedText style={styles.markerText} type="code">
                100%
              </ThemedText>
            </View>
            <View style={styles.markerLine}>
              <ThemedText style={styles.markerText} type="code">
                75%
              </ThemedText>
            </View>
            <View style={styles.markerLine}>
              <ThemedText style={styles.markerText} type="code">
                50%
              </ThemedText>
            </View>
            <View style={styles.markerLine}>
              <ThemedText style={styles.markerText} type="code">
                25%
              </ThemedText>
            </View>
            <View style={[styles.markerLine, { borderBottomWidth: 0 }]}>
              <ThemedText style={styles.markerText} type="code">
                0%
              </ThemedText>
            </View>
          </View>

          {/* Animated Water */}
          <Animated.View style={[styles.waterFill, animatedWaterStyle]}>
            {/* Wave crest */}
            <Animated.View style={[styles.waveCrest, animatedWaveStyle]} />

            {/* Gloss reflection overlay for the cylinder look */}
            <View style={styles.tankGloss} />
          </Animated.View>
        </View>

        {/* Level metrics details */}
        <View style={styles.metricsContainer}>
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              Current Level
            </ThemedText>
            <ThemedText type="title" style={styles.percentageText}>
              {level}%
            </ThemedText>
          </View>

          <View style={styles.rawReadingRow}>
            <View>
              <ThemedText type="small" themeColor="textSecondary">
                {readingLabel}
              </ThemedText>
              <ThemedText type="smallBold">
                {rawValue.toFixed(1)} {readingUnit}
              </ThemedText>
            </View>
          </View>

          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: status.color + "20",
                borderColor: status.color,
              },
            ]}
          >
            <SymbolView
              name={getStatusIconName() as any}
              size={12}
              tintColor={status.color}
            />
            <ThemedText
              style={[styles.statusLabel, { color: status.color }]}
              type="smallBold"
            >
              {status.label}
            </ThemedText>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Spacing.four,
    padding: Spacing.five,
    borderWidth: 1,
    borderColor: "rgba(150, 150, 150, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
    minWidth: 360,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.three,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 17,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 11,
    opacity: 0.75,
  },
  loadingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1890ff",
  },
  mainContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.five,
  },
  tankContainer: {
    width: 132,
    height: 250,
    borderWidth: 3,
    borderRadius: 26,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(150, 150, 150, 0.05)",
  },
  markersContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
    paddingVertical: 10,
    zIndex: 3,
  },
  markerLine: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150, 150, 150, 0.15)",
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingRight: 6,
    height: 1,
  },
  markerText: {
    fontSize: 8,
    color: "rgba(150, 150, 150, 0.6)",
    marginTop: -5,
  },
  waterFill: {
    width: "100%",
    position: "absolute",
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  waveCrest: {
    height: 6,
    width: "100%",
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 2,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  tankGloss: {
    position: "absolute",
    top: 0,
    left: 4,
    bottom: 0,
    width: 12,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    zIndex: 3,
  },
  metricsContainer: {
    flex: 1,
    gap: Spacing.three,
  },
  percentageText: {
    fontSize: 48,
    fontWeight: "800",
    lineHeight: 52,
    marginTop: Spacing.half,
  },
  rawReadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: Spacing.one,
  },
  statusLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
});
