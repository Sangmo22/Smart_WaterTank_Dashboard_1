// src/services/notification.service.ts
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Registers the device for push notifications and returns the Expo push token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;
  if (Platform.OS !== 'web') {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Failed to get push token for push notification!');
      return null;
    }
    const response = await Notifications.getExpoPushTokenAsync();
    token = response.data;
    await AsyncStorage.setItem('expoPushToken', token);
  }
  return token;
}

/**
 * Retrieves whether low‑source alerts are enabled.
 */
export async function getAlertsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem('lowSourceAlertsEnabled');
  return value === 'true';
}

/**
 * Persists the user's preference for low‑source alerts.
 */
export async function setAlertsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem('lowSourceAlertsEnabled', enabled ? 'true' : 'false');
}

/**
 * Sends an email notification to the user when the source tank level is low.
 * Uses a mock/simulated dispatch by default and supports EmailJS configuration.
 */
export async function sendEmailAlertAsync(
  toEmail: string,
  levelOrSubject: number | string,
  customBody?: string
): Promise<{ success: boolean; message: string }> {
  console.log(`[Email Alert] Preparing to send email alert to: ${toEmail}`);

  // Try to load EmailJS config from AsyncStorage
  let serviceId = "";
  let templateId = "";
  let userId = "";

  try {
    const configStr = await AsyncStorage.getItem("emailjs_config");
    if (configStr) {
      const config = JSON.parse(configStr);
      serviceId = config.serviceId || "";
      templateId = config.templateId || "";
      userId = config.userId || "";
    }
  } catch (err) {
    console.warn("Failed to read EmailJS config from storage:", err);
  }

  let subject = "⚠️ CRITICAL ALERT: Source Water Tank Level Low";
  let body = "";

  if (typeof levelOrSubject === "string") {
    subject = levelOrSubject;
    body = customBody || "";
  } else {
    body = `Smart Water Tank Monitor alert:\n\nThe Source Tank is critically low at ${levelOrSubject}%. Please refill the tank or shut down the pump to prevent running dry.`;
  }

  // If EmailJS is configured, send the real email
  if (serviceId && templateId && userId) {
    try {
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: userId,
          template_params: {
            to_email: toEmail,
            subject: subject,
            message: body,
          },
        }),
      });

      if (response.ok) {
        return { success: true, message: `Email alert sent successfully to ${toEmail} via EmailJS.` };
      } else {
        const errText = await response.text();
        throw new Error(errText || `Server returned ${response.status}`);
      }
    } catch (err: any) {
      console.error("[Email Alert] Real delivery failed:", err);
      return { success: false, message: `Delivery failed: ${err.message}. (Simulated email logged to console)` };
    }
  }

  // Simulated fallback
  const simulationMessage = `[SIMULATION] Email sent to ${toEmail}\nSubject: ${subject}\nBody: ${body}`;
  console.log(simulationMessage);
  return {
    success: true,
    message: `(Simulated) Email alert sent to ${toEmail}`,
  };
}
