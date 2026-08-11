import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { Appearance, Platform } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
export type AppColorScheme = "light" | "dark";

const STORAGE_KEY = "water_tank_dashboard_theme_mode";

let currentThemeMode: ThemeMode = "system";
let isHydrated = false;
let hydrationPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

const getResolvedScheme = (): AppColorScheme => {
  if (currentThemeMode === "light" || currentThemeMode === "dark") {
    return currentThemeMode;
  }

  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
};

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const persistThemeMode = async (mode: ThemeMode) => {
  try {
    const serialized = JSON.stringify(mode);
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, serialized);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, serialized);
    }
  } catch (error) {
    console.error("Failed to save theme preference", error);
  }
};

const loadThemeMode = async () => {
  try {
    let storedMode: string | null = null;
    if (Platform.OS === "web") {
      storedMode = localStorage.getItem(STORAGE_KEY);
    } else {
      storedMode = await AsyncStorage.getItem(STORAGE_KEY);
    }

    if (storedMode) {
      const parsed = JSON.parse(storedMode) as ThemeMode;
      if (parsed === "system" || parsed === "light" || parsed === "dark") {
        currentThemeMode = parsed;
      }
    }
  } catch (error) {
    console.error("Failed to load theme preference", error);
  } finally {
    isHydrated = true;
    emitChange();
  }
};

const ensureHydrated = () => {
  if (isHydrated) {
    return Promise.resolve();
  }

  if (!hydrationPromise) {
    hydrationPromise = loadThemeMode();
  }

  return hydrationPromise;
};

export function useColorScheme() {
  useEffect(() => {
    void ensureHydrated();
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(() => {
      if (currentThemeMode === "system") {
        emitChange();
      }
    });

    return () => subscription.remove();
  }, []);

  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getResolvedScheme,
    () => "light",
  );
}

export function getThemeMode(): ThemeMode {
  return currentThemeMode;
}

export async function setThemeMode(mode: ThemeMode) {
  currentThemeMode = mode;
  isHydrated = true;
  emitChange();
  await persistThemeMode(mode);
}
