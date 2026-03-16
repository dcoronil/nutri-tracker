export type WebPublicRoute = "/" | "/login" | "/register" | "/verify" | "/onboarding";
export type WebAppTabRoute = "/app/dashboard" | "/app/body" | "/app/history" | "/app/settings" | "/app/social";
export type WebSocialSegment = "feed" | "explore" | "friends" | "requests";

export const WEB_PUBLIC_ROUTES: WebPublicRoute[] = ["/", "/login", "/register", "/verify", "/onboarding"];
export const WEB_APP_ROUTES: WebAppTabRoute[] = ["/app/dashboard", "/app/body", "/app/history", "/app/settings", "/app/social"];

export function normalizeWebPath(rawPath: string | null | undefined): string {
  const fallback = "/";
  if (!rawPath) {
    return fallback;
  }
  const withoutHash = rawPath.split("#")[0] ?? rawPath;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  const trimmed = withoutQuery.trim();
  if (!trimmed) {
    return fallback;
  }
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const compact = normalized.replace(/\/{2,}/g, "/");
  if (compact.length > 1 && compact.endsWith("/")) {
    return compact.slice(0, -1);
  }
  return compact;
}

export function isPublicRoute(path: string): boolean {
  return WEB_PUBLIC_ROUTES.includes(normalizeWebPath(path) as WebPublicRoute);
}

export function isAppRoute(path: string): boolean {
  return normalizeWebPath(path).startsWith("/app/") || normalizeWebPath(path) === "/app";
}

export function appRouteForTab(tab: "dashboard" | "body" | "history" | "settings" | "social"): string {
  if (tab === "dashboard") {
    return "/app/dashboard";
  }
  if (tab === "body") {
    return "/app/body";
  }
  if (tab === "history") {
    return "/app/history";
  }
  if (tab === "settings") {
    return "/app/settings";
  }
  return "/app/social";
}

export function tabFromAppRoute(path: string): "dashboard" | "body" | "history" | "settings" | "social" {
  const normalized = normalizeWebPath(path);
  if (normalized.startsWith("/app/body")) {
    return "body";
  }
  if (normalized.startsWith("/app/history")) {
    return "history";
  }
  if (normalized.startsWith("/app/settings")) {
    return "settings";
  }
  if (normalized.startsWith("/app/social")) {
    return "social";
  }
  return "dashboard";
}

export function socialRouteForSegment(segment: WebSocialSegment): string {
  if (segment === "feed") {
    return "/app/social";
  }
  return `/app/social/${segment}`;
}

export function socialProfileRoute(username: string): string {
  return `/app/social/user/${encodeURIComponent(username.trim().toLowerCase())}`;
}

export function parseSocialRoute(path: string): { segment: WebSocialSegment; username: string | null } | null {
  const normalized = normalizeWebPath(path);
  if (!normalized.startsWith("/app/social")) {
    return null;
  }
  if (normalized === "/app/social") {
    return { segment: "feed", username: null };
  }
  if (normalized === "/app/social/explore") {
    return { segment: "explore", username: null };
  }
  if (normalized === "/app/social/friends") {
    return { segment: "friends", username: null };
  }
  if (normalized === "/app/social/requests") {
    return { segment: "requests", username: null };
  }
  const match = normalized.match(/^\/app\/social\/user\/([^/]+)$/);
  if (match) {
    return { segment: "feed", username: decodeURIComponent(match[1] ?? "") };
  }
  return { segment: "feed", username: null };
}
