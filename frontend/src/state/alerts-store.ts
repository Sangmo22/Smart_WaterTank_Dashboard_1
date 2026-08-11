import { useSyncExternalStore } from "react";

export type AlertSeverity = "info" | "warning" | "error" | "success";

export interface AlertEvent {
  id: string;
  time: string; // formatted time string for UI
  message: string;
  type: AlertSeverity;
  createdAtMs: number;
}

type Listener = () => void;

const MAX_EVENTS = 50;

let events: AlertEvent[] = [];
let listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const alertsStore = {
  getSnapshot() {
    return events;
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  add(event: Omit<AlertEvent, "createdAtMs">) {
    const full: AlertEvent = {
      ...event,
      createdAtMs: Date.now(),
    };

    events = [full, ...events].slice(0, MAX_EVENTS);
    emit();
    return full;
  },

  clear() {
    events = [];
    emit();
  },
};

export function useAlerts() {
  const snapshot = useSyncExternalStore(
    alertsStore.subscribe,
    alertsStore.getSnapshot,
    alertsStore.getSnapshot,
  );
  return snapshot;
}

export function useAlertsCount() {
  const alerts = useAlerts();
  return alerts.length;
}

export type AlertsStoreSnapshot = AlertEvent[];
