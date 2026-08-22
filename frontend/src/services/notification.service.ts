// src/services/notification.service.ts
import * as Notifications from 'expo-notifications';
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
  }
  return token;
}
