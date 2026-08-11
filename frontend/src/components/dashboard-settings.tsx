import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Switch,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { ThingSpeakConfig, DEFAULT_CONFIG } from "@/hooks/use-thingspeak";
import {
  getThemeMode,
  setThemeMode,
  useColorScheme,
  type ThemeMode,
} from "@/hooks/use-color-scheme";
import { Colors, Spacing } from "@/constants/theme";

interface DashboardSettingsProps {
  visible: boolean;
  onClose: () => void;
  config: ThingSpeakConfig;
  onSave: (config: ThingSpeakConfig) => Promise<void>;
}

export function DashboardSettings({
  visible,
  onClose,
  config,
  onSave,
}: DashboardSettingsProps) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "dark" ? "dark" : "light"];

  // Local state for form values
  const [isDemoMode, setIsDemoMode] = useState(config.isDemoMode);
  const [channelId, setChannelId] = useState(config.channelId);
  const [readApiKey, setReadApiKey] = useState(config.readApiKey);
  const [pollingIntervalMs, setPollingIntervalMs] = useState(
    config.pollingIntervalMs,
  );

  const [sourceField, setSourceField] = useState(config.sourceField);
  const [sourceMinRaw, setSourceMinRaw] = useState(String(config.sourceMinRaw));
  const [sourceMaxRaw, setSourceMaxRaw] = useState(String(config.sourceMaxRaw));
  const [sourceInvert, setSourceInvert] = useState(config.sourceInvert);

  const [overheadField, setOverheadField] = useState(config.overheadField);
  const [overheadMinRaw, setOverheadMinRaw] = useState(
    String(config.overheadMinRaw),
  );
  const [overheadMaxRaw, setOverheadMaxRaw] = useState(
    String(config.overheadMaxRaw),
  );
  const [overheadInvert, setOverheadInvert] = useState(config.overheadInvert);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode());

  // Connection testing state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Reset form values when modal opens with new config
  useEffect(() => {
    if (visible) {
      setIsDemoMode(config.isDemoMode);
      setChannelId(config.channelId);
      setReadApiKey(config.readApiKey);
      setPollingIntervalMs(config.pollingIntervalMs);
      setSourceField(config.sourceField);
      setSourceMinRaw(String(config.sourceMinRaw));
      setSourceMaxRaw(String(config.sourceMaxRaw));
      setSourceInvert(config.sourceInvert);
      setOverheadField(config.overheadField);
      setOverheadMinRaw(String(config.overheadMinRaw));
      setOverheadMaxRaw(String(config.overheadMaxRaw));
      setOverheadInvert(config.overheadInvert);
      setThemeModeState(getThemeMode());
      setTestResult(null);
    }
  }, [visible, config]);

  const handleSave = () => {
    const updated: ThingSpeakConfig = {
      channelId: channelId.trim(),
      readApiKey: readApiKey.trim(),
      isDemoMode,
      pollingIntervalMs,
      sourceField: Number(sourceField),
      sourceMinRaw: Number(sourceMinRaw) || 0,
      sourceMaxRaw: Number(sourceMaxRaw) || 100,
      sourceInvert,
      overheadField: Number(overheadField),
      overheadMinRaw: Number(overheadMinRaw) || 0,
      overheadMaxRaw: Number(overheadMaxRaw) || 100,
      overheadInvert,
    };
    void setThemeMode(themeMode);
    onSave(updated);
    onClose();
  };

  const handleTestConnection = async () => {
    if (!channelId.trim()) {
      setTestResult({
        success: false,
        message: "Please enter a Channel ID first.",
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      let url = `https://api.thingspeak.com/channels/${channelId.trim()}/feeds.json?results=1`;
      if (readApiKey.trim()) {
        url += `&api_key=${readApiKey.trim()}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`ThingSpeak returned status ${response.status}`);
      }

      const resData = await response.json();
      if (resData.feeds && resData.feeds.length > 0) {
        const channelName = resData.channel?.name || "Unnamed Channel";
        const feed = resData.feeds[0];

        // Show fields status
        const availableFields = [];
        for (let i = 1; i <= 8; i++) {
          if (feed[`field${i}`] !== undefined && feed[`field${i}`] !== null) {
            availableFields.push(`F${i}: ${feed[`field${i}`]}`);
          }
        }

        setTestResult({
          success: true,
          message: `Connected successfully!\nChannel Name: "${channelName}"\nLive Fields: [${availableFields.join(", ")}]`,
        });
      } else {
        setTestResult({
          success: false,
          message: "Connected but no feeds found in this channel yet.",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Connection failed: ${err.message || "Check ID and internet connection."}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const loadDefaults = () => {
    setIsDemoMode(DEFAULT_CONFIG.isDemoMode);
    setChannelId(DEFAULT_CONFIG.channelId);
    setReadApiKey(DEFAULT_CONFIG.readApiKey);
    setPollingIntervalMs(DEFAULT_CONFIG.pollingIntervalMs);
    setSourceField(DEFAULT_CONFIG.sourceField);
    setSourceMinRaw(String(DEFAULT_CONFIG.sourceMinRaw));
    setSourceMaxRaw(String(DEFAULT_CONFIG.sourceMaxRaw));
    setSourceInvert(DEFAULT_CONFIG.sourceInvert);
    setOverheadField(DEFAULT_CONFIG.overheadField);
    setOverheadMinRaw(String(DEFAULT_CONFIG.overheadMinRaw));
    setOverheadMaxRaw(String(DEFAULT_CONFIG.overheadMaxRaw));
    setOverheadInvert(DEFAULT_CONFIG.overheadInvert);
    setThemeModeState("system");
    setTestResult(null);
  };

  // Rendering inputs with labels
  const renderTextInput = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    keyboardType: "default" | "numeric" = "default",
    disabled = false,
  ) => (
    <View style={styles.inputGroup}>
      <ThemedText
        style={styles.inputLabel}
        type="smallBold"
        themeColor="textSecondary"
      >
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary + "70"}
        keyboardType={keyboardType}
        editable={!disabled}
        style={[
          styles.textInput,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
          disabled && styles.disabledInput,
        ]}
      />
    </View>
  );

  // Field selector (1 to 8 buttons)
  const renderFieldSelector = (
    label: string,
    selectedField: number,
    onSelect: (field: number) => void,
    disabled = false,
  ) => (
    <View style={styles.inputGroup}>
      <ThemedText
        style={styles.inputLabel}
        type="smallBold"
        themeColor="textSecondary"
      >
        {label}
      </ThemedText>
      <View style={styles.fieldSelectorContainer}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
          const isSelected = selectedField === num;
          return (
            <Pressable
              key={num}
              disabled={disabled}
              onPress={() => onSelect(num)}
              style={[
                styles.fieldButton,
                {
                  backgroundColor: isSelected
                    ? "#1890ff"
                    : theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
                disabled && styles.disabledInput,
              ]}
            >
              <ThemedText
                style={{
                  color: isSelected ? "#fff" : theme.text,
                  fontSize: 12,
                }}
                type="smallBold"
              >
                F{num}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <ThemedView type="background" style={styles.modalContent}>
          {/* Modal Header */}
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: theme.backgroundSelected },
            ]}
          >
            <View style={styles.headerTitleRow}>
              <SymbolView
                name={{
                  ios: "gearshape.fill",
                  android: "settings",
                  web: "settings",
                }}
                size={20}
                tintColor={theme.text}
              />
              <ThemedText type="subtitle" style={styles.headerTitle}>
                Dashboard Config
              </ThemedText>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <SymbolView
                name={{
                  ios: "xmark.circle.fill",
                  android: "cancel",
                  web: "cancel",
                }}
                size={22}
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>

          {/* Form Scroll Content */}
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Simulation/Demo Mode Section */}
            <View
              style={[
                styles.section,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">
                    Demo / Simulation Mode
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.sectionDesc}
                  >
                    Use local mock values and pumps instead of connecting to a
                    real ThingSpeak feed.
                  </ThemedText>
                </View>
                <Switch
                  value={isDemoMode}
                  onValueChange={setIsDemoMode}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: "#91d5ff",
                  }}
                  thumbColor={isDemoMode ? "#1890ff" : theme.textSecondary}
                />
              </View>
            </View>

            {/* ThingSpeak Configuration Section */}
            <ThemedText
              type="smallBold"
              style={styles.sectionTitle}
              themeColor="textSecondary"
            >
              ThingSpeak API Configuration
            </ThemedText>
            <View
              style={[styles.section, isDemoMode && styles.disabledSection]}
            >
              {renderTextInput(
                "Channel ID",
                channelId,
                setChannelId,
                "e.g. 2598372",
                "numeric",
                isDemoMode,
              )}
              {renderTextInput(
                "Read API Key (Optional)",
                readApiKey,
                setReadApiKey,
                "Enter if channel is private",
                "default",
                isDemoMode,
              )}

              {/* Polling Interval Select */}
              <View style={styles.inputGroup}>
                <ThemedText
                  style={styles.inputLabel}
                  type="smallBold"
                  themeColor="textSecondary"
                >
                  Fetch Rate / Polling Interval
                </ThemedText>
                <View style={styles.intervalContainer}>
                  {[
                    { label: "15s", val: 15000 },
                    { label: "30s", val: 30000 },
                    { label: "1m", val: 60000 },
                    { label: "5m", val: 300000 },
                  ].map((item) => {
                    const isSelected = pollingIntervalMs === item.val;
                    return (
                      <Pressable
                        key={item.val}
                        disabled={isDemoMode}
                        onPress={() => setPollingIntervalMs(item.val)}
                        style={[
                          styles.intervalButton,
                          {
                            backgroundColor:
                              isSelected && !isDemoMode
                                ? "#1890ff"
                                : theme.backgroundElement,
                            borderColor: theme.backgroundSelected,
                          },
                        ]}
                      >
                        <ThemedText
                          style={{
                            color:
                              isSelected && !isDemoMode ? "#fff" : theme.text,
                            fontSize: 12,
                          }}
                        >
                          {item.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <ThemedText
                  style={styles.inputLabel}
                  type="smallBold"
                  themeColor="textSecondary"
                >
                  Theme Mode
                </ThemedText>
                <View style={styles.themeModeContainer}>
                  {[
                    { label: "Bright", value: "light" as ThemeMode },
                    { label: "Dark", value: "dark" as ThemeMode },
                    { label: "System", value: "system" as ThemeMode },
                  ].map((item) => {
                    const isSelected = themeMode === item.value;
                    return (
                      <Pressable
                        key={item.value}
                        onPress={() => setThemeModeState(item.value)}
                        style={({ pressed }) => [
                          styles.themeModeButton,
                          {
                            backgroundColor: isSelected
                              ? "#1890ff"
                              : theme.backgroundElement,
                            borderColor: theme.backgroundSelected,
                          },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <ThemedText
                          type="smallBold"
                          style={{ color: isSelected ? "#fff" : theme.text }}
                        >
                          {item.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Connection Test Action */}
              {!isDemoMode && (
                <View style={styles.testConnectionWrapper}>
                  <Pressable
                    onPress={handleTestConnection}
                    disabled={testing}
                    style={({ pressed }) => [
                      styles.testButton,
                      { backgroundColor: theme.backgroundSelected },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {testing ? (
                      <ActivityIndicator size="small" color={theme.text} />
                    ) : (
                      <>
                        <SymbolView
                          name={{ ios: "wifi", android: "wifi", web: "wifi" }}
                          size={14}
                          tintColor={theme.text}
                        />
                        <ThemedText type="smallBold">
                          Test Feed Connection
                        </ThemedText>
                      </>
                    )}
                  </Pressable>

                  {testResult && (
                    <View
                      style={[
                        styles.testResultBox,
                        {
                          backgroundColor: testResult.success
                            ? "#f6ffed"
                            : "#fff1f0",
                          borderColor: testResult.success
                            ? "#b7eb8f"
                            : "#ffccc7",
                        },
                      ]}
                    >
                      <ThemedText
                        style={{
                          color: testResult.success ? "#389e0d" : "#cf1322",
                          fontSize: 12,
                        }}
                      >
                        {testResult.message}
                      </ThemedText>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Source Tank Mapping Section */}
            <ThemedText
              type="smallBold"
              style={styles.sectionTitle}
              themeColor="textSecondary"
            >
              Source Tank Mapping & Calibration
            </ThemedText>
            <View style={styles.section}>
              {renderFieldSelector(
                "Map to ThingSpeak Field",
                sourceField,
                setSourceField,
                isDemoMode,
              )}

              <View style={styles.calibrationRow}>
                {renderTextInput(
                  "Min Raw (Empty)",
                  sourceMinRaw,
                  setSourceMinRaw,
                  "e.g. 0",
                  "numeric",
                )}
                {renderTextInput(
                  "Max Raw (Full)",
                  sourceMaxRaw,
                  setSourceMaxRaw,
                  "e.g. 100",
                  "numeric",
                )}
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">Invert Levels</ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.sectionDesc}
                  >
                    Enable if using an ultrasonic sensor at the top (lower raw
                    distance = higher water).
                  </ThemedText>
                </View>
                <Switch
                  value={sourceInvert}
                  onValueChange={setSourceInvert}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: "#91d5ff",
                  }}
                  thumbColor={sourceInvert ? "#1890ff" : theme.textSecondary}
                />
              </View>
            </View>

            {/* Overhead Tank Mapping Section */}
            <ThemedText
              type="smallBold"
              style={styles.sectionTitle}
              themeColor="textSecondary"
            >
              Overhead Tank Mapping & Calibration
            </ThemedText>
            <View style={styles.section}>
              {renderFieldSelector(
                "Map to ThingSpeak Field",
                overheadField,
                setOverheadField,
                isDemoMode,
              )}

              <View style={styles.calibrationRow}>
                {renderTextInput(
                  "Min Raw (Empty)",
                  overheadMinRaw,
                  setOverheadMinRaw,
                  "e.g. 0",
                  "numeric",
                )}
                {renderTextInput(
                  "Max Raw (Full)",
                  overheadMaxRaw,
                  setOverheadMaxRaw,
                  "e.g. 100",
                  "numeric",
                )}
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">Invert Levels</ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.sectionDesc}
                  >
                    Enable if using an ultrasonic sensor at the top (lower raw
                    distance = higher water).
                  </ThemedText>
                </View>
                <Switch
                  value={overheadInvert}
                  onValueChange={setOverheadInvert}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: "#91d5ff",
                  }}
                  thumbColor={overheadInvert ? "#1890ff" : theme.textSecondary}
                />
              </View>
            </View>

            {/* Default restorer */}
            <Pressable
              onPress={loadDefaults}
              style={({ pressed }) => [
                styles.restoreDefaultsButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText type="small" style={{ color: "#ff4d4f" }}>
                Reset Settings to Demo Defaults
              </ThemedText>
            </Pressable>
          </ScrollView>

          {/* Form Actions Footer */}
          <View
            style={[
              styles.modalFooter,
              { borderTopColor: theme.backgroundSelected },
            ]}
          >
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.footerButton,
                { backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText type="smallBold">Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [
                styles.footerButton,
                { backgroundColor: "#1890ff" },
                pressed && { opacity: 0.8 },
              ]}
            >
              <ThemedText type="smallBold" style={{ color: "#fff" }}>
                Save Config
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  modalContent: {
    width: "100%",
    maxWidth: 550,
    maxHeight: "90%",
    borderRadius: Spacing.four,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    padding: Spacing.one,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  section: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: "rgba(150, 150, 150, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(150, 150, 150, 0.08)",
    gap: Spacing.three,
  },
  disabledSection: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.two,
    marginLeft: Spacing.one,
  },
  sectionDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  inputGroup: {
    gap: Spacing.one,
  },
  inputLabel: {
    fontSize: 11,
  },
  textInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  disabledInput: {
    opacity: 0.5,
  },
  calibrationRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
  },
  fieldSelectorContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  fieldButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    borderWidth: 1,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  intervalContainer: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: 2,
  },
  intervalButton: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  themeModeContainer: {
    flexDirection: "row",
    gap: Spacing.two,
    flexWrap: "wrap",
  },
  themeModeButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  testConnectionWrapper: {
    marginTop: Spacing.one,
    gap: Spacing.two,
  },
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  testResultBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  restoreDefaultsButton: {
    alignSelf: "center",
    padding: Spacing.two,
    marginTop: Spacing.two,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: Spacing.four,
    borderTopWidth: 1,
    gap: Spacing.three,
  },
  footerButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    minWidth: 90,
    alignItems: "center",
    justifyContent: "center",
  },
});
