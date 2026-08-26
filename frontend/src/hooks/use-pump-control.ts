import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL as API_BASE } from "@/constants/api";

export interface PumpStateData {
  pumpState: 0 | 1;
  pumpMode: "manual" | "auto";
}

async function readJson(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new Error(
      `Expected JSON from ${API_BASE} but received ${contentType.split(";")[0] || `status ${res.status}`}`,
    );
  }
  return res.json();
}

export function usePumpControl(isDemo: boolean) {
  const [tankId, setTankId] = useState<string | null>(null);
  const [pumpData, setPumpData] = useState<PumpStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingCmd, setSendingCmd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initTank = useCallback(async () => {
    if (!API_BASE) return;

    try {
      setLoading(true);
      setError(null);

      let res = await fetch(`${API_BASE}/api/tanks`);
      if (!res.ok) throw new Error(`Failed to load tanks (${res.status})`);
      const json = await readJson(res);

      let id: string | null = null;

      if (json.data && json.data.length > 0) {
        id = json.data[0]._id as string;
      } else {
        res = await fetch(`${API_BASE}/api/tanks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Water Tank",
            capacityLiters: 1000,
            location: "Home",
          }),
        });
        if (!res.ok) throw new Error(`Failed to create tank (${res.status})`);
        const created = await readJson(res);
        id = created.data._id as string;
      }

      setTankId(id);
    } catch {
      // Silently ignore — dashboard doesn't need error display
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPumpState = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tanks/${id}/pump`);
      if (!res.ok) return;
      const json = await readJson(res);
      setPumpData(json.data as PumpStateData);
    } catch {
      // Silently ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    if (!tankId) return;
    fetchPumpState(tankId);
    pollRef.current = setInterval(() => fetchPumpState(tankId), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tankId, fetchPumpState]);

  const tankIdRef = useRef<string | null>(null);
  useEffect(() => {
    tankIdRef.current = tankId;
  }, [tankId]);

  useEffect(() => {
    if (isDemo || !API_BASE) return;
    initTank();
    const retry = setInterval(() => {
      if (!tankIdRef.current) initTank();
    }, 5000);
    return () => clearInterval(retry);
  }, [initTank, isDemo]);

  const sendPumpCommand = useCallback(
    async (state: 0 | 1): Promise<boolean> => {
      if (isDemo) return true;
      if (!tankId) return false;
      setSendingCmd(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/tanks/${tankId}/pump`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error ?? `Request failed (${res.status})`);
        }
        const json = await readJson(res);
        setPumpData(json.data as PumpStateData);
        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to send pump command");
        return false;
      } finally {
        setSendingCmd(false);
      }
    },
    [tankId, isDemo],
  );

  return { tankId, pumpData, loading, sendingCmd, error, sendPumpCommand };
}
