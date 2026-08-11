import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type PushStatus =
  | "idle"
  | "unsupported"
  | "requesting"
  | "ready"
  | "denied"
  | "error";

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>("idle");
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function registerForPushNotifications() {
      if (Platform.OS === "web") {
        setPushStatus("unsupported");
        return;
      }

      if (!Device.isDevice) {
        setPushStatus("unsupported");
        setPushError("Push notifications need a physical phone.");
        return;
      }

      setPushStatus("requesting");

      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("water-alerts", {
            name: "Water level alerts",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#1890ff",
            // true = use system default sound, not a custom file
            enableLights: true,
          });
        }

        const existingPermission = await Notifications.getPermissionsAsync();
        let finalStatus = existingPermission.status;

        if (finalStatus !== "granted") {
          const requestedPermission =
            await Notifications.requestPermissionsAsync();
          finalStatus = requestedPermission.status;
        }

        if (finalStatus !== "granted") {
          if (mounted) {
            setPushStatus("denied");
            setPushError("Notification permission was not granted.");
          }
          return;
        }

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;

        if (!projectId) {
          throw new Error(
            "Missing EAS project ID. Run `eas init` and rebuild the app.",
          );
        }

        const token = await Notifications.getExpoPushTokenAsync({
          projectId,
        });

        if (mounted) {
          setExpoPushToken(token.data);
          setPushStatus("ready");
          setPushError(null);
        }
      } catch (error) {
        if (mounted) {
          setPushStatus("error");
          setPushError(
            error instanceof Error
              ? error.message
              : "Could not register push notifications.",
          );
        }
      }
    }

    registerForPushNotifications();

    const receivedSubscription =
      Notifications.addNotificationReceivedListener(() => undefined);
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(() => undefined);

    return () => {
      mounted = false;
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return {
    expoPushToken,
    pushStatus,
    pushError,
  };
}
