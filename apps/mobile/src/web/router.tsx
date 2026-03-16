import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { normalizeWebPath } from "./routes";

type RouterContextValue = {
  path: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  replace: (path: string) => void;
  back: () => void;
};

const routerContext = createContext<RouterContextValue | null>(null);

function readCurrentPath(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return "/";
  }
  return normalizeWebPath(window.location.pathname || "/");
}

export function WebRouterProvider({ children }: { children: import("react").ReactNode }) {
  const [path, setPath] = useState<string>(() => readCurrentPath());

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    const handlePopState = () => {
      setPath(readCurrentPath());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextPath: string, options?: { replace?: boolean }) => {
    const normalized = normalizeWebPath(nextPath);
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setPath(normalized);
      return;
    }
    const current = readCurrentPath();
    if (current === normalized) {
      return;
    }
    if (options?.replace) {
      window.history.replaceState({}, "", normalized);
    } else {
      window.history.pushState({}, "", normalized);
    }
    setPath(normalized);
  }, []);

  const replace = useCallback((nextPath: string) => {
    navigate(nextPath, { replace: true });
  }, [navigate]);

  const back = useCallback(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    window.history.back();
  }, []);

  const value = useMemo<RouterContextValue>(() => ({ path, navigate, replace, back }), [back, navigate, path, replace]);

  return <routerContext.Provider value={value}>{children}</routerContext.Provider>;
}

export function useWebRouter(): RouterContextValue {
  const context = useContext(routerContext);
  if (!context) {
    throw new Error("useWebRouter must be used inside WebRouterProvider");
  }
  return context;
}
