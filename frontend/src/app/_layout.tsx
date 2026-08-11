import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedSplashOverlay } from "@/components/animated-icon";

SplashScreen.preventAutoHideAsync();

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider } from "@/state/auth-context";

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  useEffect(() => {
    async function setup() {
      if (Platform.OS === 'web') return;

      try {
        // 1) Request permissions
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.log('Notification permission not granted');
          return;
        }

        // 2) Get push token
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: '06e6b11b-0ebb-4b0e-8229-d58178720195',
        });
        console.log('Push token:', token.data);
        setExpoPushToken(token.data);
        await AsyncStorage.setItem('expoPushToken', token.data);

        // 3) Set up notification handler (optional but useful)
        Notifications.setNotificationHandler({
          handleNotification: async (notification) => {
            console.log('Notification received:', notification);
            return {
              shouldPlaySound: true,
              shouldSetBadge: false,
              shouldShowBanner: true,
              shouldShowList: true,
            };
          },
        });
      } catch (error) {
        console.error('Failed to setup notifications:', error);
      }
    }

    setup();
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="analytics" />
        <Stack.Screen name="pump-settings" />
        <Stack.Screen name="settings" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutContent />
    </AuthProvider>
  );
}
