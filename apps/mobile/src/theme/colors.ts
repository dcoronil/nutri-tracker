export type ThemeTokens = {
  bg: string;
  bgElevated: string;
  panel: string;
  panelSoft: string;
  panelMuted: string;
  border: string;
  text: string;
  muted: string;
  placeholder: string;
  accent: string;
  accentSoft: string;
  danger: string;
  warning: string;
  ok: string;
  info: string;
  protein: string;
  carbs: string;
  fats: string;
  kcal: string;
  blue: string;
  yellow: string;
  red: string;
  topbarBg: string;
  topbarBorder: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  secondaryButtonBg: string;
  secondaryButtonBorder: string;
  inputBg: string;
  inputBorder: string;
  inputFocusBorder: string;
};

const semanticMacros = {
  kcal: "#2DD4BF",
  protein: "#60A5FA",
  carbs: "#F59E0B",
  fats: "#EC4899",
} as const;

const semanticFeedback = {
  ok: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  info: "#93C5FD",
} as const;

const webTheme: ThemeTokens = {
  bg: "#0B0B0D",
  bgElevated: "#0F0F14",
  panel: "#141418",
  panelSoft: "#1B1B21",
  panelMuted: "#202028",
  border: "#2A2A33",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  placeholder: "#71717A",
  accent: "#F4F4F5",
  accentSoft: "#24242D",
  danger: semanticFeedback.danger,
  warning: semanticFeedback.warning,
  ok: semanticFeedback.ok,
  info: semanticFeedback.info,
  protein: semanticMacros.protein,
  carbs: semanticMacros.carbs,
  fats: semanticMacros.fats,
  kcal: semanticMacros.kcal,
  blue: semanticFeedback.info,
  yellow: semanticFeedback.warning,
  red: semanticFeedback.danger,
  topbarBg: "#0F0F14",
  topbarBorder: "#22222B",
  primaryButtonBg: "#F4F4F5",
  primaryButtonText: "#0B0B0D",
  secondaryButtonBg: "#1B1B21",
  secondaryButtonBorder: "#2A2A33",
  inputBg: "#1B1B21",
  inputBorder: "#2A2A33",
  inputFocusBorder: semanticMacros.kcal,
};

const mobileTheme: ThemeTokens = {
  bg: "#050505",
  bgElevated: "#0c0c0c",
  panel: "#121212",
  panelSoft: "#181818",
  panelMuted: "#1f1f1f",
  border: "#2a2a2a",
  text: "#f5f5f5",
  muted: "#a3a3a3",
  placeholder: "#808089",
  accent: "#ffffff",
  accentSoft: "#262626",
  danger: semanticFeedback.danger,
  warning: semanticFeedback.warning,
  ok: semanticFeedback.ok,
  info: semanticFeedback.info,
  protein: semanticMacros.protein,
  carbs: semanticMacros.carbs,
  fats: semanticMacros.fats,
  kcal: semanticMacros.kcal,
  blue: "#b8b8b8",
  yellow: "#dcdcdc",
  red: semanticFeedback.danger,
  topbarBg: "#0c0c0c",
  topbarBorder: "#202028",
  primaryButtonBg: "#ffffff",
  primaryButtonText: "#050505",
  secondaryButtonBg: "#181818",
  secondaryButtonBorder: "#2a2a2a",
  inputBg: "#181818",
  inputBorder: "#2a2a2a",
  inputFocusBorder: semanticMacros.kcal,
};

export function themeForPlatform(platform: string): ThemeTokens {
  return platform === "web" ? webTheme : mobileTheme;
}
