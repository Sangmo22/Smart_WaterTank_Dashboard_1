import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Determine the local development API URL dynamically
const getDevApiUrl = () => {
  // If running in browser/web, check if we are in production or local dev
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Check if we are running locally
    const isLocalhost = hostname === 'localhost' || 
                        hostname === '127.0.0.1' || 
                        hostname.startsWith('192.168.') || 
                        hostname.startsWith('10.');
                        
    if (!isLocalhost) {
      // In production deployment (e.g. Vercel), frontend and backend run on the same origin
      return window.location.origin;
    }
    
    // Local web development uses port 5000 for the backend Express server
    return `http://${hostname}:5000`;
  }

  // If running on a native device (Expo Go or development build),
  // extract the development machine's IP address from expo-constants
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:5000`;
  }

  // Fallbacks for emulators
  return Platform.OS === 'android' 
    ? 'http://10.0.2.2:5000' 
    : 'http://localhost:5000';
};

const DEV_API_URL = getDevApiUrl();

export const API_URL = process.env.EXPO_PUBLIC_API_URL || DEV_API_URL;
