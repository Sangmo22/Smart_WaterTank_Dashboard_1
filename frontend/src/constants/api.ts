import Constants from "expo-constants";
import { Platform } from "react-native";

// Determine the local development API URL dynamically
const getDevApiUrl = () => {
  // If running in browser/web, check if we are in production or local dev
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const hostname = window.location.hostname;

    // Check if we are running locally
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.");

    if (!isLocalhost) {
      // Production web: EXPO_PUBLIC_API_URL must be set at build time to
      // point to the backend (e.g. Render). Do NOT fall back to
      // window.location.origin — that would make the frontend call itself
      // and get back HTML instead of JSON.
      console.warn(
        "EXPO_PUBLIC_API_URL is not set. API calls will fail. " +
          "Set it in Vercel environment variables to your backend URL.",
      );
      return "";
    }

    // Local web development uses port 5000 for the backend Express server
    return `http://${hostname}:5000`;
  }

  // If running on a native device (Expo Go or development build),
  // extract the development machine's IP address from expo-constants.
  // On a real phone, Expo Go exposes the local machine's LAN IP.
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:5000`;
  }

  // Fallbacks for emulators and local device testing.
  if (Platform.OS === "android") {
    return "http://10.0.2.2:5000";
  }

  if (Platform.OS === "ios") {
    return "http://localhost:5000";
  }

  return "http://localhost:5000";
};

const DEV_API_URL = getDevApiUrl();

export const API_URL = process.env.EXPO_PUBLIC_API_URL || DEV_API_URL;
