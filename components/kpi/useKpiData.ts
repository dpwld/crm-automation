import {readJson} from '@/lib/http';
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useKpiData<T>(url: string, enabled: boolean) {
  const [result, setResult] = useState<{
    url: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ url, data: null, error: "", loading: true });
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    if (!enabled) return;
    const controller = new AbortController();
    request.current = controller;
    setResult((previous) => ({
      url,
      data: previous.url === url ? previous.data : null,
      error: "",
      loading: true,
    }));
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error("Your session expired. Reload to sign in.");
      const body = await readJson(response);
      if (!response.ok)
        throw new Error(body.error || "Could not load KPI data.");
      if (!controller.signal.aborted)
        setResult({ url, data: body as T, error: "", loading: false });
    } catch (error) {
      if (!controller.signal.aborted)
        setResult({
          url,
          data: null,
          error:
            error instanceof Error ? error.message : "Could not load KPI data.",
          loading: false,
        });
    }
  }, [url, enabled]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize the permission-scoped external data source.
    void refresh();
    const visibleRefresh = () => {
      if (!document.hidden) void refresh();
    };
    const interval = window.setInterval(visibleRefresh, 60_000);
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      request.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [refresh]);
  const current = result.url === url;
  return {
    data: current && enabled ? result.data : null,
    error: current ? result.error : "",
    loading: enabled && (!current || result.loading),
    refresh,
  };
}
