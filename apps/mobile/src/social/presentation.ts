import { Platform } from "react-native";

import { themeForPlatform } from "../theme/colors";
import type { SocialFeedSort, SocialFeedTypeFilter, SocialPost, SocialPostType, SocialVisibility } from "./types";

const theme = themeForPlatform(Platform.OS);

export function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return "-";
  }
  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 45) {
    return "Ahora";
  }
  if (diffSeconds < 3600) {
    const minutes = Math.max(1, Math.round(diffSeconds / 60));
    return `Hace ${minutes} min`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.max(1, Math.round(diffSeconds / 3600));
    return `Hace ${hours} h`;
  }
  if (diffSeconds < 86400 * 7) {
    const days = Math.max(1, Math.round(diffSeconds / 86400));
    return `Hace ${days} d`;
  }
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function socialTypeLabel(type: SocialPostType): string {
  if (type === "recipe") {
    return "Receta";
  }
  if (type === "progress") {
    return "Progreso";
  }
  return "Foto";
}

export function socialVisibilityLabel(visibility: SocialVisibility): string {
  if (visibility === "public") {
    return "Pública";
  }
  if (visibility === "private") {
    return "Privada";
  }
  return "Amigos";
}

export function socialTypeMeta(type: SocialPostType): {
  color: string;
  borderColor: string;
  softBackground: string;
} {
  if (type === "recipe") {
    return {
      color: theme.carbs,
      borderColor: "rgba(245,158,11,0.34)",
      softBackground: "rgba(245,158,11,0.10)",
    };
  }
  if (type === "progress") {
    return {
      color: theme.protein,
      borderColor: "rgba(96,165,250,0.34)",
      softBackground: "rgba(96,165,250,0.10)",
    };
  }
  return {
    color: theme.accent,
    borderColor: "rgba(45,212,191,0.34)",
    softBackground: "rgba(45,212,191,0.10)",
  };
}

export function socialFeedSortLabel(sort: SocialFeedSort): string {
  return sort === "recent" ? "Más reciente" : "Relevancia";
}

export function socialFeedTypeFilterLabel(type: SocialFeedTypeFilter): string {
  return type === "all" ? "Todo" : socialTypeLabel(type);
}

export function socialSourceLabel(source: SocialPost["source"]): string {
  if (source === "self") {
    return "Tú";
  }
  if (source === "friends") {
    return "Tu red";
  }
  return "Explorar";
}

export function socialScopeCopy(scope: "feed" | "explore") {
  if (scope === "explore") {
    return {
      title: "Descubre publicaciones útiles",
      subtitle: "Explora recetas, fotos y progresos públicos sin perder el foco en lo que aporta valor.",
    };
  }
  return {
    title: "Tu actividad social",
    subtitle: "Sigue fotos, recetas y progresos de tu círculo con una vista limpia y fácil de usar.",
  };
}
