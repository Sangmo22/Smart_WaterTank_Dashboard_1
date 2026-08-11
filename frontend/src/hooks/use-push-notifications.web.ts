export function usePushNotifications() {
  return {
    expoPushToken: null,
    pushStatus: "unsupported" as const,
    pushError: null,
  };
}
