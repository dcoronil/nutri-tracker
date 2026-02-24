import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, G } from "react-native-svg";

import { BodyAvatarSvg } from "./components/BodyAvatarSvg";

type NutritionBasis = "per_100g" | "per_100ml" | "per_serving";
type LookupSource = "local" | "openfoodfacts_imported" | "openfoodfacts_incomplete" | "not_found";
type IntakeMethod = "grams" | "percent_pack" | "units";
type Sex = "male" | "female" | "other";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "athlete";
type GoalType = "lose" | "maintain" | "gain";
type MainTab = "dashboard" | "add" | "body" | "history" | "settings";
type AddMode = "hub" | "barcode" | "label_fix" | "meal_photo" | "manual";
type MealModelOption = "gpt-4o-mini" | "gpt-5.1" | "auto";
type AuthStackScreen = "welcome" | "signup" | "login";
type OnboardingStep = 1 | 2 | 3;

type AuthUser = {
  id: number;
  email: string;
  email_verified: boolean;
  onboarding_completed: boolean;
};

type Profile = {
  weight_kg: number;
  height_cm: number;
  age: number | null;
  sex: Sex;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  waist_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  bmi: number | null;
  bmi_category: string;
  bmi_color: string;
  body_fat_percent: number | null;
  body_fat_category: string;
  body_fat_color: string;
};

type GoalPayload = {
  kcal_goal: number;
  protein_goal: number;
  fat_goal: number;
  carbs_goal: number;
};

type GoalFeedback = {
  realistic: boolean;
  notes: string[];
};

type DailyGoalResponse = GoalPayload & {
  feedback: GoalFeedback;
};

type BodyWeightLog = {
  id: number;
  weight_kg: number;
  note: string | null;
  created_at: string;
};

type BodyMeasurementLog = {
  id: number;
  waist_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  created_at: string;
};

type BodyTrendPoint = {
  date: string;
  weight_kg: number;
};

type BodySummary = {
  latest_weight_kg: number | null;
  weekly_change_kg: number | null;
  bmi: number | null;
  bmi_category: string;
  body_fat_percent: number | null;
  body_fat_category: string;
  needs_weight_checkin: boolean;
  trend_points: BodyTrendPoint[];
  hints: string[];
};

type Product = {
  id: number;
  barcode: string | null;
  created_by_user_id: number | null;
  is_public: boolean;
  report_count: number;
  name: string;
  brand: string | null;
  image_url: string | null;
  nutrition_basis: NutritionBasis;
  serving_size_g: number | null;
  net_weight_g: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  sat_fat_g: number | null;
  carbs_g: number;
  sugars_g: number | null;
  fiber_g: number | null;
  salt_g: number | null;
  source: string;
  is_verified: boolean;
  verified_at: string | null;
  data_confidence: string;
};

type ProductPreference = {
  method: IntakeMethod;
  quantity_g: number | null;
  quantity_units: number | null;
  percent_pack: number | null;
};

type ProductLookupResponse = {
  source: LookupSource;
  product: Product | null;
  missing_fields: string[];
  message: string | null;
  preferred_serving: ProductPreference | null;
};

type LabelPhotoResponse = {
  created: boolean;
  product: Product | null;
  missing_fields: string[];
  questions: string[];
  analysis_method?: "ai_vision" | "ocr_fallback";
  warnings?: string[];
};

type ProductCorrectionResponse = {
  product_id: number;
  updated: boolean;
  product: Product;
  current: {
    kcal: number | null;
    protein_g: number | null;
    fat_g: number | null;
    sat_fat_g: number | null;
    carbs_g: number | null;
    sugars_g: number | null;
    fiber_g: number | null;
    salt_g: number | null;
    nutrition_basis: NutritionBasis | null;
    serving_size_g: number | null;
  };
  detected: {
    kcal: number | null;
    protein_g: number | null;
    fat_g: number | null;
    sat_fat_g: number | null;
    carbs_g: number | null;
    sugars_g: number | null;
    fiber_g: number | null;
    salt_g: number | null;
    nutrition_basis: NutritionBasis | null;
    serving_size_g: number | null;
  };
  missing_fields: string[];
  questions: string[];
  message: string;
  analysis_method?: "ai_vision" | "ocr_fallback";
  warnings?: string[];
};

type MealEstimateQuestionsResponse = {
  model_used: "gpt-4o-mini" | "gpt-5.1";
  suggested_model: "gpt-5.1" | null;
  questions: string[];
  assumptions: string[];
  detected_ingredients: string[];
};

type ProductDataQuality = {
  product_id: number;
  status: "verified" | "imported" | "estimated";
  label: string;
  source: string;
  is_verified: boolean;
  data_confidence: string;
  verified_at: string | null;
  message: string;
};

type FoodSearchItem = {
  product: Product;
  badge: "Verificado" | "Comunidad" | "Importado" | "Estimado";
};

type FoodSearchResponse = {
  query: string;
  results: FoodSearchItem[];
};

type Nutrients = {
  kcal: number;
  protein_g: number;
  fat_g: number;
  sat_fat_g: number;
  carbs_g: number;
  sugars_g: number;
  fiber_g: number;
  salt_g: number;
};

type Intake = {
  id: number;
  product_id: number;
  product_name: string | null;
  method: IntakeMethod;
  quantity_g: number | null;
  quantity_units: number | null;
  percent_pack: number | null;
  created_at: string;
  estimated?: boolean;
  estimate_confidence?: string | null;
  user_description?: string | null;
  source_method?: string;
  nutrients: Nutrients;
};

type MealPhotoEstimateResponse = {
  saved: boolean;
  model_used: "gpt-4o-mini" | "gpt-5.1";
  suggested_model: "gpt-5.1" | null;
  confidence_level: "high" | "medium" | "low";
  analysis_method?: "ai_vision" | "heuristic";
  assumptions: string[];
  questions: string[];
  detected_ingredients: string[];
  preview_nutrients: Nutrients;
  intake: Intake | null;
};

type DaySummary = {
  date: string;
  goal: GoalPayload | null;
  consumed: Nutrients;
  remaining: Nutrients | null;
  intakes: Intake[];
};

type CalendarDayEntry = {
  date: string;
  intake_count: number;
  kcal: number;
};

type CalendarMonthResponse = {
  month: string;
  days: CalendarDayEntry[];
};

type AnalysisResponse = {
  profile: Profile;
  recommended_goal: GoalPayload;
  goal_feedback_today: GoalFeedback | null;
};

type RegisterResponse = {
  user_id: number;
  email: string;
  email_verified: boolean;
  onboarding_completed: boolean;
  message: string;
  debug_verification_code: string | null;
};

type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
  profile: Profile | null;
};

type MeResponse = {
  user: AuthUser;
  profile: Profile | null;
};

type UserAIKeyStatus = {
  configured: boolean;
  provider: "openai" | "gemini" | null;
  key_hint: string | null;
};

type UserAIKeyTestResponse = {
  ok: boolean;
  provider: "openai" | "gemini";
  message: string;
};

type ProfileInput = {
  weight_kg: number;
  height_cm: number;
  age: number | null;
  sex: Sex;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  waist_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
};

type GoalInputDraft = {
  kcal_goal: string;
  protein_goal: string;
  fat_goal: string;
  carbs_goal: string;
};

type RegisterInput = {
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  loading: boolean;
  token: string | null;
  user: AuthUser | null;
  profile: Profile | null;
  apiBaseUrl: string;
  pendingVerificationEmail: string | null;
  otpHint: string | null;
  register: (input: RegisterInput) => Promise<RegisterResponse>;
  login: (input: LoginInput) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  clearPendingVerification: () => void;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  saveProfile: (payload: ProfileInput) => Promise<Profile>;
  fetchAnalysis: (day: string) => Promise<AnalysisResponse>;
  fetchGoal: (day: string) => Promise<DailyGoalResponse | null>;
  saveGoal: (day: string, goal: GoalPayload) => Promise<DailyGoalResponse>;
  fetchDaySummary: (day: string) => Promise<DaySummary>;
  fetchCalendar: (yearMonth: string) => Promise<CalendarMonthResponse>;
  fetchUserAIKeyStatus: () => Promise<UserAIKeyStatus>;
  saveUserAIKey: (payload: { provider: "openai" | "gemini"; apiKey: string }) => Promise<UserAIKeyStatus>;
  testUserAIKey: (payload: { provider?: "openai" | "gemini"; apiKey?: string }) => Promise<UserAIKeyTestResponse>;
  deleteUserAIKey: () => Promise<void>;
  fetchProductDataQuality: (productId: number) => Promise<ProductDataQuality>;
  createCommunityFood: (payload: {
    barcode?: string;
    name: string;
    brand?: string;
    imageUrl?: string;
    nutrition_basis?: NutritionBasis;
    serving_size_g?: number;
    net_weight_g?: number;
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
    sat_fat_g?: number;
    sugars_g?: number;
    fiber_g?: number;
    salt_g?: number;
  }) => Promise<Product>;
  searchFoods: (query: string, limit?: number) => Promise<FoodSearchResponse>;
  lookupByBarcode: (ean: string) => Promise<ProductLookupResponse>;
  createProductFromLabel: (input: {
    barcode?: string;
    name: string;
    brand: string;
    labelText: string;
    photos: string[];
  }) => Promise<LabelPhotoResponse>;
  correctProductFromLabel: (input: {
    productId?: number;
    barcode?: string;
    name?: string;
    brand?: string;
    labelText: string;
    photos: string[];
    confirmUpdate?: boolean;
  }) => Promise<ProductCorrectionResponse>;
  mealEstimateQuestions: (input: {
    description: string;
    model?: MealModelOption;
    portionSize?: "small" | "medium" | "large";
    hasAddedFats?: boolean;
    quantityNote?: string;
    photos: string[];
  }) => Promise<MealEstimateQuestionsResponse>;
  mealPhotoEstimate: (input: {
    description: string;
    model?: MealModelOption;
    portionSize?: "small" | "medium" | "large";
    hasAddedFats?: boolean;
    quantityNote?: string;
    photos: string[];
    adjustPercent?: number;
    commit?: boolean;
  }) => Promise<MealPhotoEstimateResponse>;
  createIntake: (payload: {
    product_id: number;
    method: IntakeMethod;
    quantity_g?: number;
    quantity_units?: number;
    percent_pack?: number;
  }) => Promise<Intake>;
  fetchBodySummary: () => Promise<BodySummary>;
  fetchWeightLogs: (limit?: number) => Promise<BodyWeightLog[]>;
  createWeightLog: (payload: { weight_kg: number; note?: string; created_at?: string }) => Promise<BodyWeightLog>;
  fetchMeasurementLogs: (limit?: number) => Promise<BodyMeasurementLog[]>;
  createMeasurementLog: (payload: {
    waist_cm?: number;
    neck_cm?: number;
    hip_cm?: number;
    chest_cm?: number;
    arm_cm?: number;
    thigh_cm?: number;
    created_at?: string;
  }) => Promise<BodyMeasurementLog>;
  setApiBaseUrl: (url: string) => void;
  checkHealth: (url?: string) => Promise<boolean>;
};

type Segment = {
  label: string;
  value: number;
  color: string;
};

const TOKEN_STORAGE_KEY = "nutri_tracker_access_token";
const MEAL_MODEL_STORAGE_KEY = "nutri_tracker_meal_model_pref";

const theme = {
  bg: "#050505",
  bgElevated: "#0c0c0c",
  panel: "#121212",
  panelSoft: "#181818",
  panelMuted: "#1f1f1f",
  border: "#2a2a2a",
  text: "#f5f5f5",
  muted: "#a3a3a3",
  accent: "#ffffff",
  accentSoft: "#262626",
  danger: "#f48f8f",
  warning: "#f1d08e",
  ok: "#a9d8bb",
  protein: "#60a5fa",
  carbs: "#fbbf24",
  fats: "#d8b4fe",
  kcal: "#2dd4bf",
  blue: "#b8b8b8",
  yellow: "#dcdcdc",
  red: "#f48f8f",
};

const authContext = createContext<AuthContextValue | undefined>(undefined);

function useAuth(): AuthContextValue {
  const value = useContext(authContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }

  return `http://${trimmed.replace(/\/+$/, "")}`;
}

function getExpoHostIp(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra?.expoClient
      ?.hostUri;

  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(":")[0]?.trim();
  if (!host || host === "127.0.0.1" || host === "localhost") {
    return null;
  }
  return host;
}

function inferApiBaseUrl(): string {
  const envUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
  if (envUrl && !envUrl.includes("localhost")) {
    return envUrl;
  }

  const hostIp = getExpoHostIp();
  if (hostIp) {
    return `http://${hostIp}:8000`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }

  return envUrl || "http://localhost:8000";
}

function parseApiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unexpected error";
  }

  if (error.message.includes("Network request failed")) {
    return "Network request failed. Revisa la URL API y que el backend esté corriendo.";
  }

  return error.message;
}

function normalizeMealModelOption(raw: string | null | undefined): MealModelOption {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "gpt-5.1") {
    return "gpt-5.1";
  }
  if (value === "auto") {
    return "auto";
  }
  return "gpt-4o-mini";
}

function formatDateLocal(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonth(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromKey(key: string): Date {
  const [yearRaw, monthRaw] = key.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(year, month - 1, 1);
}

function moveMonth(key: string, delta: number): string {
  const day = monthFromKey(key);
  day.setMonth(day.getMonth() + delta);
  return formatMonth(day);
}

function toOptionalNumber(input: string): number | null {
  const parsed = Number(input.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toPositiveNumberOrNull(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  return toOptionalNumber(trimmed);
}

function bmiValue(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) {
    return null;
  }
  return Math.round((weightKg / ((heightCm / 100) ** 2)) * 100) / 100;
}

function bmiCategory(value: number | null): { label: string; color: string; pct: number } {
  if (value === null) {
    return { label: "N/A", color: theme.muted, pct: 0 };
  }
  if (value < 18.5) {
    return { label: "underweight", color: theme.blue, pct: 0.2 };
  }
  if (value < 25) {
    return { label: "normal", color: theme.ok, pct: 0.45 };
  }
  if (value < 30) {
    return { label: "overweight", color: theme.yellow, pct: 0.72 };
  }
  return { label: "obesity", color: theme.red, pct: 0.92 };
}

function estimateBodyFatPreview(input: {
  sex: Sex;
  heightCm: number | null;
  waistCm: number | null;
  neckCm: number | null;
  hipCm: number | null;
}): number | null {
  const height = input.heightCm;
  if (!height) {
    return null;
  }

  const toInches = (value: number): number => value / 2.54;

  if (input.sex === "male") {
    if (!input.waistCm || !input.neckCm) {
      return null;
    }

    const waist = toInches(input.waistCm);
    const neck = toInches(input.neckCm);
    const h = toInches(height);
    if (waist <= neck) {
      return null;
    }

    const result = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
    return Math.round(Math.max(result, 2) * 100) / 100;
  }

  if (input.sex === "female") {
    if (!input.waistCm || !input.neckCm || !input.hipCm) {
      return null;
    }

    const waist = toInches(input.waistCm);
    const neck = toInches(input.neckCm);
    const hip = toInches(input.hipCm);
    const h = toInches(height);
    if (waist + hip <= neck) {
      return null;
    }

    const result = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450;
    return Math.round(Math.max(result, 5) * 100) / 100;
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calendarCells(monthKey: string): Array<number | null> {
  const base = monthFromKey(monthKey);
  const year = base.getFullYear();
  const month = base.getMonth();

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const jsWeekday = first.getDay();
  const mondayStart = jsWeekday === 0 ? 6 : jsWeekday - 1;

  const cells: Array<number | null> = [];
  for (let i = 0; i < mondayStart; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function dayFromMonthAndCell(monthKey: string, day: number): string {
  const month = monthFromKey(monthKey);
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function AuthProvider({ children }: { children: import("react").ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(inferApiBaseUrl());

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit, authToken?: string | null): Promise<T> => {
      const headers = new Headers(init?.headers ?? {});
      const effectiveToken = authToken ?? token;
      if (effectiveToken) {
        headers.set("Authorization", `Bearer ${effectiveToken}`);
      }

      const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}${path}`, {
        ...init,
        headers,
      });

      const text = await response.text();
      let body: unknown = null;

      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text;
        }
      }

      if (!response.ok) {
        const detail =
          typeof body === "object" && body !== null
            ? ((body as { detail?: string }).detail ?? (body as { message?: string }).message)
            : undefined;
        throw new Error(detail ?? `HTTP ${response.status}`);
      }

      return body as T;
    },
    [apiBaseUrl, token],
  );

  const checkHealth = useCallback(
    async (url?: string): Promise<boolean> => {
      const target = normalizeBaseUrl(url ?? apiBaseUrl);
      if (!target) {
        return false;
      }

      try {
        const response = await fetch(`${target}/health`);
        if (!response.ok) {
          return false;
        }
        const body = (await response.json()) as { status?: string };
        return body.status === "ok";
      } catch {
        return false;
      }
    },
    [apiBaseUrl],
  );

  const boot = useCallback(async () => {
    setLoading(true);
    try {
      const storedToken = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      if (!storedToken) {
        setToken(null);
        setUser(null);
        setProfile(null);
        return;
      }

      const me = await request<MeResponse>("/me", undefined, storedToken);
      setToken(storedToken);
      setUser(me.user);
      setProfile(me.profile);
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
      setToken(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const persistAuth = useCallback(async (response: AuthResponse) => {
    setToken(response.access_token);
    setUser(response.user);
    setProfile(response.profile);
    setPendingVerificationEmail(null);
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, response.access_token);
  }, []);

  const register = useCallback(
    async (input: RegisterInput): Promise<RegisterResponse> => {
      const response = await request<RegisterResponse>("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      setPendingVerificationEmail(response.email);
      setOtpHint(response.debug_verification_code);
      setUser(null);
      setProfile(null);
      setToken(null);
      await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
      return response;
    },
    [request],
  );

  const login = useCallback(
    async (input: LoginInput): Promise<void> => {
      const response = await request<AuthResponse>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await persistAuth(response);
      setOtpHint(null);
    },
    [persistAuth, request],
  );

  const verifyEmail = useCallback(
    async (email: string, code: string): Promise<void> => {
      const response = await request<AuthResponse>("/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      await persistAuth(response);
      setOtpHint(null);
    },
    [persistAuth, request],
  );

  const resendCode = useCallback(
    async (email: string): Promise<void> => {
      const response = await request<RegisterResponse>("/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setOtpHint(response.debug_verification_code);
      setPendingVerificationEmail(response.email);
    },
    [request],
  );

  const clearPendingVerification = useCallback(() => {
    setPendingVerificationEmail(null);
    setOtpHint(null);
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setProfile(null);
    setPendingVerificationEmail(null);
    setOtpHint(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) {
      return;
    }
    const me = await request<MeResponse>("/me");
    setUser(me.user);
    setProfile(me.profile);
  }, [request, token]);

  const saveProfile = useCallback(
    async (payload: ProfileInput): Promise<Profile> => {
      const response = await request<Profile>("/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setProfile(response);
      await refreshMe();
      return response;
    },
    [refreshMe, request],
  );

  const fetchAnalysis = useCallback(
    async (day: string): Promise<AnalysisResponse> => request<AnalysisResponse>(`/me/analysis?day=${day}`),
    [request],
  );

  const fetchGoal = useCallback(
    async (day: string): Promise<DailyGoalResponse | null> => {
      try {
        return await request<DailyGoalResponse | null>(`/goals/${day}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
          return null;
        }
        throw error;
      }
    },
    [request],
  );

  const saveGoal = useCallback(
    async (day: string, goal: GoalPayload): Promise<DailyGoalResponse> => {
      const response = await request<DailyGoalResponse>(`/goals/${day}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goal),
      });
      await refreshMe();
      return response;
    },
    [refreshMe, request],
  );

  const fetchDaySummary = useCallback(
    async (day: string): Promise<DaySummary> => request<DaySummary>(`/days/${day}/summary`),
    [request],
  );

  const fetchCalendar = useCallback(
    async (yearMonth: string): Promise<CalendarMonthResponse> => request<CalendarMonthResponse>(`/calendar/${yearMonth}`),
    [request],
  );

  const fetchUserAIKeyStatus = useCallback(
    async (): Promise<UserAIKeyStatus> => request<UserAIKeyStatus>("/user/ai-key/status"),
    [request],
  );

  const saveUserAIKey = useCallback(
    async (payload: { provider: "openai" | "gemini"; apiKey: string }): Promise<UserAIKeyStatus> => {
      return request<UserAIKeyStatus>("/user/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: payload.provider,
          api_key: payload.apiKey,
        }),
      });
    },
    [request],
  );

  const testUserAIKey = useCallback(
    async (payload: { provider?: "openai" | "gemini"; apiKey?: string }): Promise<UserAIKeyTestResponse> => {
      return request<UserAIKeyTestResponse>("/user/ai-key/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: payload.provider,
          api_key: payload.apiKey,
        }),
      });
    },
    [request],
  );

  const deleteUserAIKey = useCallback(async (): Promise<void> => {
    await request<{ deleted: boolean }>("/user/ai-key", {
      method: "DELETE",
    });
  }, [request]);

  const fetchProductDataQuality = useCallback(
    async (productId: number): Promise<ProductDataQuality> =>
      request<ProductDataQuality>(`/products/${productId}/data-quality`),
    [request],
  );

  const createCommunityFood = useCallback(
    async (payload: {
      barcode?: string;
      name: string;
      brand?: string;
      imageUrl?: string;
      nutrition_basis?: NutritionBasis;
      serving_size_g?: number;
      net_weight_g?: number;
      kcal: number;
      protein_g: number;
      fat_g: number;
      carbs_g: number;
      sat_fat_g?: number;
      sugars_g?: number;
      fiber_g?: number;
      salt_g?: number;
    }): Promise<Product> => {
      return request<Product>("/foods/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: payload.barcode,
          name: payload.name,
          brand: payload.brand,
          image_url: payload.imageUrl,
          nutrition_basis: payload.nutrition_basis ?? "per_100g",
          serving_size_g: payload.serving_size_g,
          net_weight_g: payload.net_weight_g,
          kcal: payload.kcal,
          protein_g: payload.protein_g,
          fat_g: payload.fat_g,
          carbs_g: payload.carbs_g,
          sat_fat_g: payload.sat_fat_g,
          sugars_g: payload.sugars_g,
          fiber_g: payload.fiber_g,
          salt_g: payload.salt_g,
        }),
      });
    },
    [request],
  );

  const searchFoods = useCallback(
    async (query: string, limit = 20): Promise<FoodSearchResponse> => {
      const encoded = encodeURIComponent(query.trim());
      return request<FoodSearchResponse>(`/foods/search?q=${encoded}&limit=${limit}`);
    },
    [request],
  );

  const lookupByBarcode = useCallback(
    async (ean: string): Promise<ProductLookupResponse> => request<ProductLookupResponse>(`/products/by_barcode/${ean}`),
    [request],
  );

  const createProductFromLabel = useCallback(
    async (input: {
      barcode?: string;
      name: string;
      brand: string;
      labelText: string;
      photos: string[];
    }): Promise<LabelPhotoResponse> => {
      const form = new FormData();
      if (input.barcode?.trim()) {
        form.append("barcode", input.barcode.trim());
      }
      form.append("name", input.name);
      if (input.brand.trim()) {
        form.append("brand", input.brand.trim());
      }
      if (input.labelText.trim()) {
        form.append("label_text", input.labelText.trim());
      }

      input.photos.forEach((uri, index) => {
        const name = uri.split("/").pop() || `label-${index + 1}.jpg`;
        form.append(
          "photos",
          {
            uri,
            name,
            type: "image/jpeg",
          } as unknown as Blob,
        );
      });

      return request<LabelPhotoResponse>("/products/from_label_photo", {
        method: "POST",
        body: form,
      });
    },
    [request],
  );

  const correctProductFromLabel = useCallback(
    async (input: {
      productId?: number;
      barcode?: string;
      name?: string;
      brand?: string;
      labelText: string;
      photos: string[];
      confirmUpdate?: boolean;
    }): Promise<ProductCorrectionResponse> => {
      const form = new FormData();
      if (input.confirmUpdate) {
        form.append("confirm_update", "true");
      }
      if (input.barcode?.trim()) {
        form.append("barcode", input.barcode.trim());
      }
      if (input.name?.trim()) {
        form.append("name", input.name.trim());
      }
      if (input.brand !== undefined) {
        form.append("brand", input.brand.trim());
      }
      if (input.labelText.trim()) {
        form.append("label_text", input.labelText.trim());
      }

      input.photos.forEach((uri, index) => {
        const name = uri.split("/").pop() || `label-correction-${index + 1}.jpg`;
        form.append(
          "photos",
          {
            uri,
            name,
            type: "image/jpeg",
          } as unknown as Blob,
        );
      });

      if (input.productId) {
        return request<ProductCorrectionResponse>(`/products/${input.productId}/correct-from-label-photo`, {
          method: "POST",
          body: form,
        });
      }

      return request<ProductCorrectionResponse>("/products/correct-by-barcode-from-label-photo", {
        method: "POST",
        body: form,
      });
    },
    [request],
  );

  const mealEstimateQuestions = useCallback(
    async (input: {
      description: string;
      model?: MealModelOption;
      portionSize?: "small" | "medium" | "large";
      hasAddedFats?: boolean;
      quantityNote?: string;
      photos: string[];
    }): Promise<MealEstimateQuestionsResponse> => {
      const form = new FormData();
      form.append("description", input.description.trim());
      if (input.model) {
        form.append("model", input.model);
      }
      if (input.portionSize) {
        form.append("portion_size", input.portionSize);
      }
      if (typeof input.hasAddedFats === "boolean") {
        form.append("has_added_fats", String(input.hasAddedFats));
      }
      if (input.quantityNote?.trim()) {
        form.append("quantity_note", input.quantityNote.trim());
      }
      input.photos.forEach((uri, index) => {
        const name = uri.split("/").pop() || `meal-${index + 1}.jpg`;
        form.append(
          "photos",
          {
            uri,
            name,
            type: "image/jpeg",
          } as unknown as Blob,
        );
      });
      return request<MealEstimateQuestionsResponse>("/meal-photo-estimate/questions", {
        method: "POST",
        body: form,
      });
    },
    [request],
  );

  const mealPhotoEstimate = useCallback(
    async (input: {
      description: string;
      model?: MealModelOption;
      portionSize?: "small" | "medium" | "large";
      hasAddedFats?: boolean;
      quantityNote?: string;
      photos: string[];
      adjustPercent?: number;
      commit?: boolean;
    }): Promise<MealPhotoEstimateResponse> => {
      const form = new FormData();
      form.append("description", input.description.trim());
      if (input.model) {
        form.append("model", input.model);
      }
      if (input.portionSize) {
        form.append("portion_size", input.portionSize);
      }
      if (typeof input.hasAddedFats === "boolean") {
        form.append("has_added_fats", String(input.hasAddedFats));
      }
      if (input.quantityNote?.trim()) {
        form.append("quantity_note", input.quantityNote.trim());
      }
      if (typeof input.adjustPercent === "number") {
        form.append("adjust_percent", String(Math.round(input.adjustPercent)));
      }
      if (input.commit) {
        form.append("commit", "true");
      }
      input.photos.forEach((uri, index) => {
        const name = uri.split("/").pop() || `meal-estimate-${index + 1}.jpg`;
        form.append(
          "photos",
          {
            uri,
            name,
            type: "image/jpeg",
          } as unknown as Blob,
        );
      });
      return request<MealPhotoEstimateResponse>("/intakes/from-meal-photo-estimate", {
        method: "POST",
        body: form,
      });
    },
    [request],
  );

  const createIntake = useCallback(
    async (payload: {
      product_id: number;
      method: IntakeMethod;
      quantity_g?: number;
      quantity_units?: number;
      percent_pack?: number;
    }): Promise<Intake> => {
      return request<Intake>("/intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    [request],
  );

  const fetchBodySummary = useCallback(async (): Promise<BodySummary> => request<BodySummary>("/body/summary"), [request]);

  const fetchWeightLogs = useCallback(
    async (limit = 120): Promise<BodyWeightLog[]> => request<BodyWeightLog[]>(`/body/weight-logs?limit=${limit}`),
    [request],
  );

  const createWeightLog = useCallback(
    async (payload: { weight_kg: number; note?: string; created_at?: string }): Promise<BodyWeightLog> =>
      request<BodyWeightLog>("/body/weight-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    [request],
  );

  const fetchMeasurementLogs = useCallback(
    async (limit = 120): Promise<BodyMeasurementLog[]> =>
      request<BodyMeasurementLog[]>(`/body/measurement-logs?limit=${limit}`),
    [request],
  );

  const createMeasurementLog = useCallback(
    async (payload: {
      waist_cm?: number;
      neck_cm?: number;
      hip_cm?: number;
      chest_cm?: number;
      arm_cm?: number;
      thigh_cm?: number;
      created_at?: string;
    }): Promise<BodyMeasurementLog> =>
      request<BodyMeasurementLog>("/body/measurement-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    [request],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      token,
      user,
      profile,
      apiBaseUrl,
      pendingVerificationEmail,
      otpHint,
      register,
      login,
      verifyEmail,
      resendCode,
      clearPendingVerification,
      logout,
      refreshMe,
      saveProfile,
      fetchAnalysis,
      fetchGoal,
      saveGoal,
      fetchDaySummary,
      fetchCalendar,
      fetchUserAIKeyStatus,
      saveUserAIKey,
      testUserAIKey,
      deleteUserAIKey,
      fetchProductDataQuality,
      createCommunityFood,
      searchFoods,
      lookupByBarcode,
      createProductFromLabel,
      correctProductFromLabel,
      mealEstimateQuestions,
      mealPhotoEstimate,
      createIntake,
      fetchBodySummary,
      fetchWeightLogs,
      createWeightLog,
      fetchMeasurementLogs,
      createMeasurementLog,
      setApiBaseUrl: (url: string) => setApiBaseUrl(normalizeBaseUrl(url)),
      checkHealth,
    }),
    [
      apiBaseUrl,
      checkHealth,
      clearPendingVerification,
      createIntake,
      createMeasurementLog,
      createWeightLog,
      createProductFromLabel,
      correctProductFromLabel,
      mealEstimateQuestions,
      mealPhotoEstimate,
      saveUserAIKey,
      testUserAIKey,
      deleteUserAIKey,
      createCommunityFood,
      fetchAnalysis,
      fetchBodySummary,
      fetchCalendar,
      fetchDaySummary,
      fetchUserAIKeyStatus,
      fetchProductDataQuality,
      searchFoods,
      fetchMeasurementLogs,
      fetchGoal,
      fetchWeightLogs,
      loading,
      login,
      logout,
      lookupByBarcode,
      otpHint,
      pendingVerificationEmail,
      profile,
      refreshMe,
      register,
      resendCode,
      saveGoal,
      saveProfile,
      token,
      user,
      verifyEmail,
    ],
  );

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
}

function LoadingGate() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.helperText}>Cargando estado de sesión...</Text>
      </View>
    </SafeAreaView>
  );
}

function AppHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.headerWrap}>
      <Text style={styles.headerTitle}>{title}</Text>
      <Text style={styles.headerSubtitle}>{subtitle}</Text>
    </View>
  );
}

function InputField(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address" | "numeric";
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? "default"}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? "none"}
        placeholder={props.placeholder}
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
    </View>
  );
}

function PrimaryButton(props: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const disabled = props.disabled || props.loading;
  return (
    <Pressable onPress={props.onPress} disabled={disabled} style={[styles.primaryButton, disabled && styles.disabledButton]}>
      {props.loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryButtonText}>{props.title}</Text>}
    </Pressable>
  );
}

function SecondaryButton(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled} style={[styles.secondaryButton, props.disabled && styles.disabledButton]}>
      <Text style={styles.secondaryButtonText}>{props.title}</Text>
    </Pressable>
  );
}

function AppCard(props: { children: import("react").ReactNode; style?: object }) {
  return <View style={[styles.appCard, props.style]}>{props.children}</View>;
}

function SectionHeader(props: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeaderWrap}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={styles.sectionHeaderTitle}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.sectionHeaderSubtitle}>{props.subtitle}</Text> : null}
      </View>
      {props.actionLabel && props.onAction ? (
        <Pressable style={styles.sectionHeaderAction} onPress={props.onAction}>
          <Text style={styles.sectionHeaderActionText}>{props.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StatPill(props: { label: string; value: string; tone?: "default" | "accent" | "warning" | "danger" }) {
  const toneStyle =
    props.tone === "accent"
      ? styles.statPillAccent
      : props.tone === "warning"
        ? styles.statPillWarning
        : props.tone === "danger"
          ? styles.statPillDanger
          : styles.statPillDefault;

  return (
    <View style={[styles.statPill, toneStyle]}>
      <Text style={styles.statPillLabel}>{props.label}</Text>
      <Text style={styles.statPillValue}>{props.value}</Text>
    </View>
  );
}

function TagChip(props: { label: string; tone?: "default" | "accent" | "warning" | "danger" }) {
  const toneStyle =
    props.tone === "accent"
      ? styles.tagChipAccent
      : props.tone === "warning"
        ? styles.tagChipWarning
        : props.tone === "danger"
          ? styles.tagChipDanger
          : styles.tagChipDefault;

  return (
    <View style={[styles.tagChip, toneStyle]}>
      <Text style={styles.tagChipLabel}>{props.label}</Text>
    </View>
  );
}

function StatRow(props: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statRowLabel}>{props.label}</Text>
      <Text style={styles.statRowValue}>{props.value}</Text>
    </View>
  );
}

function AvatarCircle({ letter }: { letter: string }) {
  return (
    <View style={styles.avatarCircle}>
      <Text style={styles.avatarText}>{letter.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function EmptyState(props: { title: string; subtitle: string }) {
  return (
    <AppCard style={styles.emptyStateCard}>
      <Text style={styles.emptyStateTitle}>{props.title}</Text>
      <Text style={styles.emptyStateSubtitle}>{props.subtitle}</Text>
    </AppCard>
  );
}

function MetricCard(props: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricTileLabel}>{props.label}</Text>
      <Text style={[styles.metricTileValue, props.color ? { color: props.color } : null]}>{props.value}</Text>
      {props.subtitle ? <Text style={styles.metricTileSubtitle}>{props.subtitle}</Text> : null}
    </View>
  );
}

function MacroLegend({ segments }: { segments: Segment[] }) {
  return (
    <View style={styles.legendWrap}>
      {segments.map((segment) => (
        <View key={segment.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
          <Text style={styles.legendText}>
            {segment.label} {Math.round(segment.value)}g
          </Text>
        </View>
      ))}
    </View>
  );
}

function MacroProgressBar(props: { label: string; consumed: number; goal: number; color: string; unit: string }) {
  const rawProgress = props.goal > 0 ? props.consumed / props.goal : 0;
  const clamped = clamp(rawProgress, 0, 1);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: clamped,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.metricProgressRow}>
      <View style={styles.metricProgressHeader}>
        <Text style={styles.metricProgressLabel}>{props.label}</Text>
        <Text style={styles.metricProgressValue}>
          {Math.round(props.consumed)} / {Math.round(props.goal)} {props.unit}
        </Text>
      </View>
      <View style={styles.metricProgressTrack}>
        <Animated.View style={[styles.metricProgressFill, { width, backgroundColor: props.color }]} />
      </View>
    </View>
  );
}

function AddActionCard(props: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.addActionCard} onPress={props.onPress}>
      <Text style={styles.addActionTitle}>{props.title}</Text>
      <Text style={styles.addActionSubtitle}>{props.subtitle}</Text>
    </Pressable>
  );
}

function WelcomeScreen({ onCreate, onLogin }: { onCreate: () => void; onLogin: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandCard}>
          <Text style={styles.brandEyebrow}>NUTRI TRACKER</Text>
          <Text style={styles.brandTitle}>Control nutricional diario, claro y sin ruido</Text>
          <Text style={styles.brandText}>
            Escanea, registra porciones y visualiza tu progreso con objetivos realistas según tu perfil.
          </Text>
        </View>

        <PrimaryButton title="Crear cuenta" onPress={onCreate} />
        <SecondaryButton title="Iniciar sesión" onPress={onLogin} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SignupScreen({ onBack }: { onBack: () => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Faltan datos", "Completa email y contraseña.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Contraseña", "Debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Contraseña", "Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const response = await auth.register({ email: email.trim().toLowerCase(), password });
      Alert.alert("Cuenta creada", response.message);
    } catch (error) {
      Alert.alert("Registro", parseApiError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <AppHeader title="Crear cuenta" subtitle="Solo email y contraseña, luego verificas con código OTP." />

          <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <InputField label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
          <InputField label="Confirmar contraseña" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

          <PrimaryButton title="Crear cuenta" onPress={submit} loading={loading} />
          <SecondaryButton title="Volver" onPress={onBack} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoginScreen({ onBack }: { onBack: () => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Faltan datos", "Completa email y contraseña.");
      return;
    }

    setLoading(true);
    try {
      await auth.login({ email: email.trim().toLowerCase(), password });
    } catch (error) {
      Alert.alert("Login", parseApiError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <AppHeader title="Iniciar sesión" subtitle="Si el email no está verificado, pasarás directo a validarlo." />

          <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <InputField label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />

          <PrimaryButton title="Entrar" onPress={submit} loading={loading} />
          <SecondaryButton title="Volver" onPress={onBack} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthStack() {
  const [screen, setScreen] = useState<AuthStackScreen>("welcome");

  if (screen === "signup") {
    return <SignupScreen onBack={() => setScreen("welcome")} />;
  }

  if (screen === "login") {
    return <LoginScreen onBack={() => setScreen("welcome")} />;
  }

  return <WelcomeScreen onCreate={() => setScreen("signup")} onLogin={() => setScreen("login")} />;
}

function VerifyEmailOnlyScreen() {
  const auth = useAuth();
  const email = auth.user?.email ?? auth.pendingVerificationEmail;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setInterval(() => setCooldown((current) => Math.max(current - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!email) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.helperText}>Falta email para verificar.</Text>
          <SecondaryButton title="Volver" onPress={auth.clearPendingVerification} />
        </View>
      </SafeAreaView>
    );
  }

  const verify = async () => {
    if (code.trim().length < 4) {
      Alert.alert("Código", "Introduce un código válido.");
      return;
    }

    setLoading(true);
    try {
      await auth.verifyEmail(email, code.trim());
    } catch (error) {
      Alert.alert("Verificación", parseApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await auth.resendCode(email);
      setCooldown(60);
      Alert.alert("Código enviado", "Revisa tu email o el log del backend en modo dev.");
    } catch (error) {
      Alert.alert("Reenviar", parseApiError(error));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <AppHeader title="Verificar email" subtitle={`Código OTP de 6 dígitos para ${email}`} />

          <InputField
            label="Código"
            value={code}
            onChangeText={setCode}
            keyboardType="numeric"
            autoCapitalize="none"
            placeholder="123456"
          />

          {auth.otpHint ? <Text style={styles.devHint}>DEV OTP: {auth.otpHint}</Text> : null}

          <PrimaryButton title="Verificar" onPress={verify} loading={loading} />
          <SecondaryButton
            title={cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
            onPress={resend}
            disabled={cooldown > 0 || resending}
          />

          {auth.user ? <SecondaryButton title="Cerrar sesión" onPress={() => void auth.logout()} /> : null}
          {!auth.user ? <SecondaryButton title="Volver" onPress={auth.clearPendingVerification} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChoiceRow<T extends string>(props: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <View style={styles.chipsRow}>
        {props.options.map((option) => {
          const active = option.value === props.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => props.onChange(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BmiBar({ value }: { value: number | null }) {
  const category = bmiCategory(value);
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricTitle}>IMC estimado</Text>
      <Text style={styles.metricValue}>{value ? value.toFixed(2) : "-"}</Text>
      <Text style={[styles.metricBadge, { color: category.color }]}>{category.label}</Text>
      <View style={styles.bmiTrack}>
        <View style={[styles.bmiBand, { backgroundColor: theme.blue }]} />
        <View style={[styles.bmiBand, { backgroundColor: theme.ok }]} />
        <View style={[styles.bmiBand, { backgroundColor: theme.yellow }]} />
        <View style={[styles.bmiBand, { backgroundColor: theme.red }]} />
      </View>
      <View style={[styles.bmiPointer, { left: `${category.pct * 100}%`, backgroundColor: category.color }]} />
      <Text style={styles.helperText}>underweight / normal / overweight / obesity</Text>
    </View>
  );
}

function OnboardingWizard() {
  const auth = useAuth();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [saving, setSaving] = useState(false);

  const [weight, setWeight] = useState(auth.profile?.weight_kg ? String(auth.profile.weight_kg) : "");
  const [height, setHeight] = useState(auth.profile?.height_cm ? String(auth.profile.height_cm) : "");
  const [age, setAge] = useState(auth.profile?.age ? String(auth.profile.age) : "");
  const [sex, setSex] = useState<Sex>(auth.profile?.sex ?? "other");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(auth.profile?.activity_level ?? "moderate");
  const [goalType, setGoalType] = useState<GoalType>(auth.profile?.goal_type ?? "maintain");

  const [waist, setWaist] = useState(auth.profile?.waist_cm ? String(auth.profile.waist_cm) : "");
  const [neck, setNeck] = useState(auth.profile?.neck_cm ? String(auth.profile.neck_cm) : "");
  const [hip, setHip] = useState(auth.profile?.hip_cm ? String(auth.profile.hip_cm) : "");
  const [chest, setChest] = useState(auth.profile?.chest_cm ? String(auth.profile.chest_cm) : "");
  const [arm, setArm] = useState(auth.profile?.arm_cm ? String(auth.profile.arm_cm) : "");
  const [thigh, setThigh] = useState(auth.profile?.thigh_cm ? String(auth.profile.thigh_cm) : "");

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [goalDraft, setGoalDraft] = useState<GoalInputDraft>({
    kcal_goal: "",
    protein_goal: "",
    fat_goal: "",
    carbs_goal: "",
  });
  const [goalFeedback, setGoalFeedback] = useState<GoalFeedback | null>(null);

  const today = useMemo(() => formatDateLocal(new Date()), []);

  const numericWeight = toPositiveNumberOrNull(weight);
  const numericHeight = toPositiveNumberOrNull(height);
  const currentBmi = bmiValue(numericWeight, numericHeight);

  const draftBodyFat = estimateBodyFatPreview({
    sex,
    heightCm: numericHeight,
    waistCm: toOptionalNumber(waist),
    neckCm: toOptionalNumber(neck),
    hipCm: toOptionalNumber(hip),
  });

  const buildProfilePayload = useCallback(
    (clearOptionalMeasures: boolean): ProfileInput | null => {
      const payloadWeight = toPositiveNumberOrNull(weight);
      const payloadHeight = toPositiveNumberOrNull(height);
      if (!payloadWeight || !payloadHeight) {
        return null;
      }

      const optionalAge = age.trim() ? Number(age.trim()) : null;
      if (optionalAge !== null && (!Number.isFinite(optionalAge) || optionalAge < 13 || optionalAge > 120)) {
        return null;
      }

      return {
        weight_kg: payloadWeight,
        height_cm: payloadHeight,
        age: optionalAge,
        sex,
        activity_level: activityLevel,
        goal_type: goalType,
        waist_cm: clearOptionalMeasures ? null : toOptionalNumber(waist),
        neck_cm: clearOptionalMeasures ? null : toOptionalNumber(neck),
        hip_cm: clearOptionalMeasures ? null : toOptionalNumber(hip),
        chest_cm: clearOptionalMeasures ? null : toOptionalNumber(chest),
        arm_cm: clearOptionalMeasures ? null : toOptionalNumber(arm),
        thigh_cm: clearOptionalMeasures ? null : toOptionalNumber(thigh),
      };
    },
    [activityLevel, age, arm, chest, goalType, height, hip, neck, sex, thigh, waist, weight],
  );

  const goToStepThree = async (skipMeasures: boolean) => {
    const profilePayload = buildProfilePayload(skipMeasures);
    if (!profilePayload) {
      Alert.alert("Perfil", "Revisa los datos básicos y la edad opcional.");
      return;
    }

    setSaving(true);
    try {
      await auth.saveProfile(profilePayload);
      const nextAnalysis = await auth.fetchAnalysis(today);
      setAnalysis(nextAnalysis);

      const existingGoal = await auth.fetchGoal(today);
      if (existingGoal) {
        setGoalDraft({
          kcal_goal: String(existingGoal.kcal_goal),
          protein_goal: String(existingGoal.protein_goal),
          fat_goal: String(existingGoal.fat_goal),
          carbs_goal: String(existingGoal.carbs_goal),
        });
        setGoalFeedback(existingGoal.feedback);
      } else {
        setGoalDraft({
          kcal_goal: String(nextAnalysis.recommended_goal.kcal_goal),
          protein_goal: String(nextAnalysis.recommended_goal.protein_goal),
          fat_goal: String(nextAnalysis.recommended_goal.fat_goal),
          carbs_goal: String(nextAnalysis.recommended_goal.carbs_goal),
        });
        setGoalFeedback(nextAnalysis.goal_feedback_today);
      }

      setStep(3);
    } catch (error) {
      Alert.alert("Onboarding", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const finishOnboarding = async () => {
    const payload: GoalPayload = {
      kcal_goal: Number(goalDraft.kcal_goal),
      protein_goal: Number(goalDraft.protein_goal),
      fat_goal: Number(goalDraft.fat_goal),
      carbs_goal: Number(goalDraft.carbs_goal),
    };

    if (!Number.isFinite(payload.kcal_goal) || payload.kcal_goal <= 0) {
      Alert.alert("Objetivo", "Kcal inválidas.");
      return;
    }

    setSaving(true);
    try {
      const response = await auth.saveGoal(today, payload);
      setGoalFeedback(response.feedback);
      await auth.refreshMe();
    } catch (error) {
      Alert.alert("Objetivo", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <AppHeader title="Onboarding" subtitle={`Paso ${step} de 3`} />

          {step === 1 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Paso 1: datos básicos</Text>
              <InputField label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="numeric" />
              <InputField label="Altura (cm)" value={height} onChangeText={setHeight} keyboardType="numeric" />
              <InputField label="Edad (opcional)" value={age} onChangeText={setAge} keyboardType="numeric" />

              <ChoiceRow
                label="Sexo"
                value={sex}
                onChange={setSex}
                options={[
                  { label: "Masculino", value: "male" },
                  { label: "Femenino", value: "female" },
                  { label: "Otro", value: "other" },
                ]}
              />

              <ChoiceRow
                label="Actividad"
                value={activityLevel}
                onChange={setActivityLevel}
                options={[
                  { label: "Sedentario", value: "sedentary" },
                  { label: "Ligero", value: "light" },
                  { label: "Moderado", value: "moderate" },
                  { label: "Activo", value: "active" },
                  { label: "Atleta", value: "athlete" },
                ]}
              />

              <ChoiceRow
                label="Objetivo"
                value={goalType}
                onChange={setGoalType}
                options={[
                  { label: "Perder", value: "lose" },
                  { label: "Mantener", value: "maintain" },
                  { label: "Ganar", value: "gain" },
                ]}
              />

              <BmiBar value={currentBmi} />

              <PrimaryButton title="Continuar" onPress={() => setStep(2)} />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Paso 2: medidas corporales (opcional)</Text>
              <InputField label="Cintura (cm)" value={waist} onChangeText={setWaist} keyboardType="numeric" />
              <InputField label="Cuello (cm)" value={neck} onChangeText={setNeck} keyboardType="numeric" />
              <InputField label="Cadera (cm)" value={hip} onChangeText={setHip} keyboardType="numeric" />
              <InputField label="Pecho (cm)" value={chest} onChangeText={setChest} keyboardType="numeric" />
              <InputField label="Brazo (cm)" value={arm} onChangeText={setArm} keyboardType="numeric" />
              <InputField label="Muslo (cm)" value={thigh} onChangeText={setThigh} keyboardType="numeric" />

              <View style={styles.metricCard}>
                <Text style={styles.metricTitle}>% grasa estimado</Text>
                {draftBodyFat !== null ? (
                  <Text style={styles.metricValue}>{draftBodyFat.toFixed(2)}%</Text>
                ) : (
                  <Text style={styles.helperText}>
                    Para estimación más precisa añade cintura y cuello (y cadera si aplica).
                  </Text>
                )}
              </View>

              <PrimaryButton title="Continuar" onPress={() => void goToStepThree(false)} loading={saving} />
              <SecondaryButton title="Saltar" onPress={() => void goToStepThree(true)} disabled={saving} />
              <SecondaryButton title="Volver" onPress={() => setStep(1)} disabled={saving} />
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Paso 3: objetivos diarios</Text>

              {analysis ? (
                <View style={styles.recoBox}>
                  <Text style={styles.recoTitle}>Rango recomendado según tu perfil</Text>
                  <Text style={styles.helperText}>kcal {analysis.recommended_goal.kcal_goal}</Text>
                  <Text style={styles.helperText}>prote {analysis.recommended_goal.protein_goal} g</Text>
                  <Text style={styles.helperText}>grasa {analysis.recommended_goal.fat_goal} g</Text>
                  <Text style={styles.helperText}>carbs {analysis.recommended_goal.carbs_goal} g</Text>
                </View>
              ) : null}

              <InputField
                label="Kcal"
                value={goalDraft.kcal_goal}
                onChangeText={(value) => setGoalDraft((current) => ({ ...current, kcal_goal: value }))}
                keyboardType="numeric"
              />
              <InputField
                label="Proteína (g)"
                value={goalDraft.protein_goal}
                onChangeText={(value) => setGoalDraft((current) => ({ ...current, protein_goal: value }))}
                keyboardType="numeric"
              />
              <InputField
                label="Grasa (g)"
                value={goalDraft.fat_goal}
                onChangeText={(value) => setGoalDraft((current) => ({ ...current, fat_goal: value }))}
                keyboardType="numeric"
              />
              <InputField
                label="Carbs (g)"
                value={goalDraft.carbs_goal}
                onChangeText={(value) => setGoalDraft((current) => ({ ...current, carbs_goal: value }))}
                keyboardType="numeric"
              />

              {goalFeedback ? (
                <View style={[styles.feedbackBox, !goalFeedback.realistic && styles.feedbackBoxWarning]}>
                  <Text style={styles.feedbackTitle}>{goalFeedback.realistic ? "Objetivo razonable" : "Revisa este objetivo"}</Text>
                  {goalFeedback.notes.map((note) => (
                    <Text key={note} style={styles.feedbackLine}>
                      - {note}
                    </Text>
                  ))}
                </View>
              ) : null}

              <PrimaryButton title="Finalizar onboarding" onPress={() => void finishOnboarding()} loading={saving} />
              <SecondaryButton title="Volver" onPress={() => setStep(2)} disabled={saving} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RingProgress(props: {
  label: string;
  consumed: number;
  goal: number;
  color: string;
  unit: string;
}) {
  const size = 116;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circle = 2 * Math.PI * radius;
  const safeGoal = props.goal > 0 ? props.goal : 1;
  const progress = clamp(props.consumed / safeGoal, 0, 1);
  const remainder = Math.max(props.goal - props.consumed, 0);

  return (
    <View style={styles.ringCard}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.border} strokeWidth={stroke} fill="transparent" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={props.color}
            strokeWidth={stroke}
            fill="transparent"
            strokeDasharray={`${progress * circle} ${circle}`}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringLabel}>{props.label}</Text>
        <Text style={styles.ringValue}>{Math.round(props.consumed)}</Text>
        <Text style={styles.ringUnit}>{props.unit}</Text>
      </View>
      <Text style={styles.ringFoot}>restante {Math.max(0, Math.round(remainder))}</Text>
    </View>
  );
}

function MacroDonut({ segments, title }: { segments: Segment[]; title: string }) {
  const size = 180;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((acc, item) => acc + Math.max(item.value, 0), 0);

  if (total <= 0) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.helperText}>Sin datos para representar.</Text>
      </View>
    );
  }

  let offset = 0;

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.donutWrap}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            {segments.map((segment) => {
              const ratio = Math.max(segment.value, 0) / total;
              const length = ratio * circumference;
              const circle = (
                <Circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={stroke}
                  fill="transparent"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return circle;
            })}
          </G>
        </Svg>
        <View style={styles.donutCenterBox}>
          <Text style={styles.donutCenterTitle}>Macros</Text>
          <Text style={styles.donutCenterSub}>{Math.round(total)} g</Text>
        </View>
      </View>
      <MacroLegend segments={segments} />
    </View>
  );
}

function DashboardScreen({
  onOpenBodyProgress,
  onOpenAdd,
}: {
  onOpenBodyProgress: () => void;
  onOpenAdd: () => void;
}) {
  const auth = useAuth();
  const [selectedDate, setSelectedDate] = useState(formatDateLocal(new Date()));
  const [monthKey, setMonthKey] = useState(formatMonth(new Date()));
  const [macroViewMode, setMacroViewMode] = useState<"rings" | "bars">("rings");
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [calendar, setCalendar] = useState<CalendarDayEntry[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(true);

  const dayMap = useMemo(() => {
    const map = new Map<number, CalendarDayEntry>();
    calendar.forEach((entry) => {
      const day = Number(entry.date.slice(-2));
      if (Number.isFinite(day)) {
        map.set(day, entry);
      }
    });
    return map;
  }, [calendar]);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const data = await auth.fetchDaySummary(selectedDate);
      setSummary(data);
    } catch (error) {
      Alert.alert("Dashboard", parseApiError(error));
    } finally {
      setLoadingSummary(false);
    }
  }, [auth, selectedDate]);

  const loadCalendar = useCallback(async () => {
    setLoadingCalendar(true);
    try {
      const data = await auth.fetchCalendar(monthKey);
      setCalendar(data.days);
    } catch (error) {
      Alert.alert("Calendario", parseApiError(error));
    } finally {
      setLoadingCalendar(false);
    }
  }, [auth, monthKey]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const now = useMemo(() => new Date(), []);
  const hour = now.getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const emailPrefix = auth.user?.email?.split("@")[0] ?? "Usuario";
  const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);

  const goal = summary?.goal;
  const consumed = summary?.consumed;
  const kcalGoal = goal?.kcal_goal ?? 0;
  const kcalConsumed = consumed?.kcal ?? 0;
  const kcalRemaining = Math.round((kcalGoal || 0) - kcalConsumed);
  const kcalProgress = kcalGoal > 0 ? clamp(kcalConsumed / kcalGoal, 0, 1) : 0;
  const exceededKcal = kcalGoal > 0 && kcalConsumed > kcalGoal;

  const quickInsights = useMemo(() => {
    if (!summary || !goal) {
      return ["Registra tu primer consumo del día para activar recomendaciones."];
    }
    const notes: string[] = [];

    const proteinRemaining = goal.protein_goal - summary.consumed.protein_g;
    if (proteinRemaining > 0) {
      notes.push(`Te faltan ${Math.round(proteinRemaining)} g de proteína para tu objetivo.`);
    }
    if (summary.consumed.kcal > goal.kcal_goal * 1.15) {
      notes.push("Hoy vas alto en kcal (+15% sobre objetivo). Ajusta la siguiente comida.");
    }
    if (summary.consumed.fat_g > goal.fat_goal * 1.2) {
      notes.push("Grasas altas vs objetivo diario.");
    }
    if (summary.intakes.length === 0) {
      notes.push("Aún no registras comidas hoy.");
    }

    return notes.length > 0 ? notes.slice(0, 3) : ["Buen trabajo, tu día va dentro de rango."];
  }, [goal, summary]);

  const segments: Segment[] = [
    { label: "Prote", value: summary?.consumed.protein_g ?? 0, color: theme.protein },
    { label: "Carbs", value: summary?.consumed.carbs_g ?? 0, color: theme.carbs },
    { label: "Grasas", value: summary?.consumed.fat_g ?? 0, color: theme.fats },
  ];

  const cells = calendarCells(monthKey);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.mainScroll}>
        <View style={styles.dashboardHeaderRow}>
          <View style={styles.dashboardHeaderLeft}>
            <Text style={styles.dashboardGreeting}>
              {greeting}, {displayName}
            </Text>
            <Text style={styles.dashboardDate}>{selectedDate}</Text>
          </View>
          <Pressable style={styles.quickWeightBtn} onPress={onOpenBodyProgress}>
            <Text style={styles.quickWeightBtnText}>+</Text>
          </Pressable>
          <AvatarCircle letter={displayName.slice(0, 1)} />
        </View>

        <AppCard style={[styles.heroCard, exceededKcal && styles.heroCardExceeded]}>
          <SectionHeader title="Resumen del día" subtitle="Kcal restantes" />
          <Text style={styles.heroRemainingValue}>{kcalGoal > 0 ? kcalRemaining : "-"}</Text>
          <Text style={styles.heroRemainingSub}>
            {Math.round(kcalConsumed)} consumidas / {Math.round(kcalGoal)} objetivo
          </Text>
          <View style={styles.heroProgressTrack}>
            <View
              style={[
                styles.heroProgressFill,
                { width: `${kcalProgress * 100}%`, backgroundColor: exceededKcal ? theme.danger : theme.kcal },
              ]}
            />
          </View>
          <View style={styles.heroPillsRow}>
            <TagChip label={exceededKcal ? "Sobre objetivo" : "En rango"} tone={exceededKcal ? "danger" : "accent"} />
            <TagChip
              label={`${summary?.intakes.length ?? 0} registro${(summary?.intakes.length ?? 0) === 1 ? "" : "s"}`}
              tone={summary?.intakes.length ? "default" : "warning"}
            />
          </View>
        </AppCard>

        <AppCard>
          <SectionHeader title="Accesos rápidos" subtitle="Registro en 1 toque" />
          <View style={styles.quickActionRow}>
            <Pressable style={styles.quickActionBtn} onPress={onOpenAdd}>
              <Text style={styles.quickActionBtnText}>Escanear / Añadir</Text>
            </Pressable>
            <Pressable style={styles.quickActionBtn} onPress={onOpenAdd}>
              <Text style={styles.quickActionBtnText}>Foto comida</Text>
            </Pressable>
            <Pressable style={styles.quickActionBtn} onPress={onOpenBodyProgress}>
              <Text style={styles.quickActionBtnText}>Registrar peso</Text>
            </Pressable>
          </View>
        </AppCard>

        <AppCard>
          <SectionHeader title="Macros del día" subtitle="Vista rápida" />
          <View style={styles.macroToggleRow}>
            <Pressable
              style={[styles.macroToggleChip, macroViewMode === "rings" && styles.macroToggleChipActive]}
              onPress={() => setMacroViewMode("rings")}
            >
              <Text style={[styles.macroToggleText, macroViewMode === "rings" && styles.macroToggleTextActive]}>Rings</Text>
            </Pressable>
            <Pressable
              style={[styles.macroToggleChip, macroViewMode === "bars" && styles.macroToggleChipActive]}
              onPress={() => setMacroViewMode("bars")}
            >
              <Text style={[styles.macroToggleText, macroViewMode === "bars" && styles.macroToggleTextActive]}>Barras</Text>
            </Pressable>
          </View>

          {macroViewMode === "rings" ? (
            <View style={styles.rowWrap}>
              <RingProgress
                label="kcal"
                consumed={summary?.consumed.kcal ?? 0}
                goal={summary?.goal?.kcal_goal ?? Math.max(summary?.consumed.kcal ?? 0, 1)}
                color={theme.kcal}
                unit="kcal"
              />
              <RingProgress
                label="prote"
                consumed={summary?.consumed.protein_g ?? 0}
                goal={summary?.goal?.protein_goal ?? Math.max(summary?.consumed.protein_g ?? 0, 1)}
                color={theme.protein}
                unit="g"
              />
              <RingProgress
                label="carbs"
                consumed={summary?.consumed.carbs_g ?? 0}
                goal={summary?.goal?.carbs_goal ?? Math.max(summary?.consumed.carbs_g ?? 0, 1)}
                color={theme.carbs}
                unit="g"
              />
              <RingProgress
                label="grasas"
                consumed={summary?.consumed.fat_g ?? 0}
                goal={summary?.goal?.fat_goal ?? Math.max(summary?.consumed.fat_g ?? 0, 1)}
                color={theme.fats}
                unit="g"
              />
            </View>
          ) : (
            <View style={styles.barsList}>
              <MacroProgressBar
                label="Kcal"
                consumed={summary?.consumed.kcal ?? 0}
                goal={summary?.goal?.kcal_goal ?? 1}
                color={theme.kcal}
                unit="kcal"
              />
              <MacroProgressBar
                label="Proteína"
                consumed={summary?.consumed.protein_g ?? 0}
                goal={summary?.goal?.protein_goal ?? 1}
                color={theme.protein}
                unit="g"
              />
              <MacroProgressBar
                label="Carbs"
                consumed={summary?.consumed.carbs_g ?? 0}
                goal={summary?.goal?.carbs_goal ?? 1}
                color={theme.carbs}
                unit="g"
              />
              <MacroProgressBar
                label="Grasas"
                consumed={summary?.consumed.fat_g ?? 0}
                goal={summary?.goal?.fat_goal ?? 1}
                color={theme.fats}
                unit="g"
              />
            </View>
          )}
        </AppCard>

        <MacroDonut segments={segments} title="Distribución de macros consumidos" />

        <AppCard>
          <SectionHeader
            title="Seguimiento corporal"
            subtitle="Estado actual"
            actionLabel="Registrar peso"
            onAction={onOpenBodyProgress}
          />
          <View style={styles.metricTileRow}>
            <MetricCard label="Peso" value={auth.profile ? `${auth.profile.weight_kg} kg` : "-"} />
            <MetricCard label="IMC" value={auth.profile?.bmi ? auth.profile.bmi.toFixed(1) : "-"} />
            <MetricCard
              label="% grasa"
              value={auth.profile?.body_fat_percent ? `${auth.profile.body_fat_percent.toFixed(1)}%` : "N/D"}
            />
          </View>
          <Text style={styles.helperText}>
            Próximo paso: tendencia semanal de peso y cambio vs semana anterior.
          </Text>
        </AppCard>

        <AppCard>
          <SectionHeader title="Calendario y actividad" subtitle={monthKey} />
          <View style={styles.calendarHeader}>
            <Pressable onPress={() => setMonthKey((current) => moveMonth(current, -1))} style={styles.calendarNavBtn}>
              <Text style={styles.calendarNavText}>{"<"}</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>{monthKey}</Text>
            <Pressable onPress={() => setMonthKey((current) => moveMonth(current, 1))} style={styles.calendarNavBtn}>
              <Text style={styles.calendarNavText}>{">"}</Text>
            </Pressable>
          </View>

          {loadingCalendar ? <ActivityIndicator color={theme.accent} /> : null}

          <View style={styles.weekDaysRow}>
            {["L", "M", "X", "J", "V", "S", "D"].map((label) => (
              <Text key={label} style={styles.weekDayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {cells.map((cell, idx) => {
              if (cell === null) {
                return <View key={`empty-${idx}`} style={styles.calendarCellEmpty} />;
              }

              const isoDate = dayFromMonthAndCell(monthKey, cell);
              const active = selectedDate === isoDate;
              const entry = dayMap.get(cell);
              return (
                <Pressable
                  key={isoDate}
                  onPress={() => setSelectedDate(isoDate)}
                  style={[styles.calendarCell, active && styles.calendarCellActive]}
                >
                  <Text style={[styles.calendarCellText, active && styles.calendarCellTextActive]}>{cell}</Text>
                  {entry && entry.intake_count > 0 ? <View style={styles.calendarDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </AppCard>

        <AppCard>
          <SectionHeader title="Intakes de hoy" subtitle="Línea temporal" actionLabel="Recargar" onAction={() => void loadSummary()} />
          {loadingSummary ? <ActivityIndicator color={theme.accent} /> : null}

          {!loadingSummary && summary && summary.intakes.length === 0 ? (
            <EmptyState title="Aún sin registros" subtitle="Escanea tu primer producto para empezar a construir tu día." />
          ) : null}

          {!loadingSummary && summary
            ? summary.intakes.map((item) => (
                <View key={item.id} style={styles.intakeRow}>
                  <View style={styles.intakeTimeDotWrap}>
                    <View style={styles.intakeTimeDot} />
                    <Text style={styles.intakeMeta}>{new Date(item.created_at).toLocaleTimeString()}</Text>
                  </View>
                  <View style={styles.intakeMain}>
                    <Text style={styles.intakeName}>{item.product_name ?? "Producto"}</Text>
                    <Text style={styles.intakeMeta}>
                      {Math.round(item.quantity_g ?? 0)} g | P {Math.round(item.nutrients.protein_g)} / C{" "}
                      {Math.round(item.nutrients.carbs_g)} / G {Math.round(item.nutrients.fat_g)}
                    </Text>
                  </View>
                  <Text style={styles.intakeKcal}>{Math.round(item.nutrients.kcal)} kcal</Text>
                </View>
              ))
            : null}
        </AppCard>

        <AppCard>
          <SectionHeader title="Insights rápidos" subtitle="Recomendaciones prácticas" />
          {quickInsights.map((insight) => (
            <View key={insight} style={styles.insightRow}>
              <View style={styles.insightDot} />
              <Text style={styles.helperText}>{insight}</Text>
            </View>
          ))}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function BodyProgressScreen() {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingWeight, setSavingWeight] = useState(false);
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [showQuickWeightForm, setShowQuickWeightForm] = useState(true);

  const [summary, setSummary] = useState<BodySummary | null>(null);
  const [weightLogs, setWeightLogs] = useState<BodyWeightLog[]>([]);
  const [measurementLogs, setMeasurementLogs] = useState<BodyMeasurementLog[]>([]);

  const [weightInput, setWeightInput] = useState("");
  const [weightNote, setWeightNote] = useState("");
  const [waistInput, setWaistInput] = useState("");
  const [neckInput, setNeckInput] = useState("");
  const [hipInput, setHipInput] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummary, nextWeights, nextMeasurements] = await Promise.all([
        auth.fetchBodySummary(),
        auth.fetchWeightLogs(180),
        auth.fetchMeasurementLogs(180),
      ]);
      setSummary(nextSummary);
      setWeightLogs(nextWeights);
      setMeasurementLogs(nextMeasurements);
    } catch (error) {
      Alert.alert("Progreso corporal", parseApiError(error));
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredWeightLogs = useMemo(() => {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return [...weightLogs]
      .filter((row) => new Date(row.created_at) >= cutoff)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  }, [range, weightLogs]);

  const chartStats = useMemo(() => {
    if (filteredWeightLogs.length === 0) {
      return { min: 0, max: 0 };
    }
    const values = filteredWeightLogs.map((row) => row.weight_kg);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [filteredWeightLogs]);

  const filteredBodyFatPoints = useMemo(() => {
    if (!auth.profile) {
      return [];
    }
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return [...measurementLogs]
      .filter((row) => new Date(row.created_at) >= cutoff)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      .map((row) => ({
        id: row.id,
        date: row.created_at,
        value: estimateBodyFatPreview({
          sex: auth.profile?.sex ?? "other",
          heightCm: auth.profile?.height_cm ?? null,
          waistCm: row.waist_cm,
          neckCm: row.neck_cm,
          hipCm: row.hip_cm,
        }),
      }))
      .filter((row) => row.value !== null) as Array<{ id: number; date: string; value: number }>;
  }, [auth.profile, measurementLogs, range]);

  const bodyFatStats = useMemo(() => {
    if (filteredBodyFatPoints.length === 0) {
      return { min: 0, max: 0 };
    }
    const values = filteredBodyFatPoints.map((row) => row.value);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [filteredBodyFatPoints]);

  const saveWeight = async () => {
    const value = toPositiveNumberOrNull(weightInput);
    if (!value) {
      Alert.alert("Peso", "Introduce un peso válido.");
      return;
    }
    setSavingWeight(true);
    try {
      await auth.createWeightLog({ weight_kg: value, note: weightNote.trim() || undefined });
      setWeightInput("");
      setWeightNote("");
      await reload();
    } catch (error) {
      Alert.alert("Peso", parseApiError(error));
    } finally {
      setSavingWeight(false);
    }
  };

  const saveMeasurement = async () => {
    const payload = {
      waist_cm: toOptionalNumber(waistInput) ?? undefined,
      neck_cm: toOptionalNumber(neckInput) ?? undefined,
      hip_cm: toOptionalNumber(hipInput) ?? undefined,
    };
    if (!payload.waist_cm && !payload.neck_cm && !payload.hip_cm) {
      Alert.alert("Medidas", "Añade al menos una medida.");
      return;
    }
    setSavingMeasure(true);
    try {
      await auth.createMeasurementLog(payload);
      setWaistInput("");
      setNeckInput("");
      setHipInput("");
      await reload();
    } catch (error) {
      Alert.alert("Medidas", parseApiError(error));
    } finally {
      setSavingMeasure(false);
    }
  };

  const bmiCategoryLabel = summary?.bmi_category ?? "unknown";
  const bmiCategoryColor = (() => {
    const normalized = bmiCategoryLabel.toLowerCase();
    if (normalized.includes("under")) {
      return "#8ba3c7";
    }
    if (normalized.includes("normal")) {
      return "#7bb8ad";
    }
    if (normalized.includes("over")) {
      return "#ccb086";
    }
    if (normalized.includes("obes")) {
      return "#c89a9a";
    }
    return theme.muted;
  })();

  const recentWeights = useMemo(() => weightLogs.slice(0, 6), [weightLogs]);
  const recentMeasurements = useMemo(() => measurementLogs.slice(0, 4), [measurementLogs]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.mainScroll}>
        <View style={styles.bodyPageHeader}>
          <View style={styles.bodyPageHeaderCopy}>
            <Text style={styles.bodyPageTitle}>Body</Text>
            <Text style={styles.bodyPageSubtitle}>Composición corporal, tendencia y métricas clave.</Text>
          </View>
          <Pressable
            onPress={() => setShowQuickWeightForm((current) => !current)}
            style={styles.bodyHeaderActionBtn}
          >
            <Text style={styles.bodyHeaderActionText}>Registrar peso</Text>
          </Pressable>
        </View>

        {showQuickWeightForm ? (
          <AppCard>
            <SectionHeader title="Registro rápido de peso" subtitle="Añade hoy en un toque" />
            <View style={styles.bodyQuickWeightRow}>
              <View style={styles.bodyQuickWeightInputWrap}>
                <InputField
                  label="Peso (kg)"
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.bodyQuickWeightInputWrap}>
                <InputField label="Nota (opcional)" value={weightNote} onChangeText={setWeightNote} />
              </View>
            </View>
            <View style={styles.bodyQuickWeightActions}>
              <PrimaryButton title="Guardar peso" onPress={() => void saveWeight()} loading={savingWeight} />
              <SecondaryButton title="Ocultar" onPress={() => setShowQuickWeightForm(false)} />
            </View>
          </AppCard>
        ) : null}

        <AppCard>
          <SectionHeader
            title="Resumen actual"
            subtitle="Peso, cambio semanal, IMC y % grasa"
            actionLabel="Recargar"
            onAction={() => void reload()}
          />
          <View style={styles.bodySummaryGrid}>
            <MetricCard
              label="Peso actual"
              value={summary?.latest_weight_kg != null ? `${summary.latest_weight_kg.toFixed(1)} kg` : "N/D"}
              subtitle="Último registro"
            />
            <MetricCard
              label="Cambio semanal"
              value={
                summary?.weekly_change_kg != null
                  ? `${summary.weekly_change_kg > 0 ? "+" : ""}${summary.weekly_change_kg.toFixed(2)} kg`
                  : "N/D"
              }
              subtitle="Vs semana previa"
              color={summary?.weekly_change_kg != null && summary.weekly_change_kg > 0 ? theme.warning : theme.text}
            />
            <MetricCard
              label="IMC"
              value={summary?.bmi != null ? summary.bmi.toFixed(1) : "N/D"}
              subtitle={bmiCategoryLabel}
              color={bmiCategoryColor}
            />
            <MetricCard
              label="% grasa"
              value={summary?.body_fat_percent != null ? `${summary.body_fat_percent.toFixed(1)}%` : "N/D"}
              subtitle={summary?.body_fat_category ?? "N/D"}
            />
          </View>
          {summary?.needs_weight_checkin ? (
            <Text style={styles.helperText}>Sugerencia: registra peso al menos una vez por semana.</Text>
          ) : null}
        </AppCard>

        <AppCard>
          <SectionHeader title="Avatar corporal" subtitle="Vista técnica por grupos musculares" />
          <BodyAvatarSvg
            bmi={summary?.bmi ?? null}
            bmiCategory={summary?.bmi_category ?? "unknown"}
            bodyFatPercent={summary?.body_fat_percent ?? null}
            latestWeightKg={summary?.latest_weight_kg ?? null}
            weeklyChangeKg={summary?.weekly_change_kg ?? null}
          />
          <View style={styles.bodyLegendRow}>
            {[
              ["Underweight", "#8ba3c7"],
              ["Normal", "#7bb8ad"],
              ["Overweight", "#ccb086"],
              ["Obesity", "#c89a9a"],
            ].map(([label, color]) => (
              <View key={label} style={styles.bodyLegendItem}>
                <View style={[styles.bodyLegendSwatch, { backgroundColor: color }]} />
                <Text style={styles.bodyLegendLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard>
          <SectionHeader title="Tendencia de peso" subtitle="7 / 30 / 90 días" />
          <View style={styles.macroToggleRow}>
            {(["7d", "30d", "90d"] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setRange(option)}
                style={[styles.macroToggleChip, range === option && styles.macroToggleChipActive]}
              >
                <Text style={[styles.macroToggleText, range === option && styles.macroToggleTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator color={theme.accent} />
          ) : filteredWeightLogs.length === 0 ? (
            <EmptyState title="Sin registros de peso" subtitle="Añade tu primer peso para ver la tendencia." />
          ) : (
            <View style={styles.weightChartWrap}>
              {filteredWeightLogs.slice(-16).map((entry) => {
                const min = chartStats.min;
                const max = chartStats.max;
                const ratio = max - min <= 0 ? 1 : (entry.weight_kg - min) / (max - min);
                const height = 24 + ratio * 86;
                return (
                  <View key={entry.id} style={styles.weightBarCol}>
                    <View style={[styles.weightBar, { height }]} />
                    <Text style={styles.weightBarLabel}>{new Date(entry.created_at).getDate()}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </AppCard>

        <AppCard>
          <SectionHeader title="Tendencia % grasa" subtitle="Estimación por medidas" />
          {loading ? (
            <ActivityIndicator color={theme.accent} />
          ) : filteredBodyFatPoints.length === 0 ? (
            <EmptyState title="Sin datos suficientes" subtitle="Registra cintura/cuello (y cadera si aplica)." />
          ) : (
            <View style={styles.weightChartWrap}>
              {filteredBodyFatPoints.slice(-16).map((entry) => {
                const min = bodyFatStats.min;
                const max = bodyFatStats.max;
                const ratio = max - min <= 0 ? 1 : (entry.value - min) / (max - min);
                const height = 24 + ratio * 86;
                return (
                  <View key={entry.id} style={styles.weightBarCol}>
                    <View style={[styles.bodyFatBar, { height }]} />
                    <Text style={styles.weightBarLabel}>{new Date(entry.date).getDate()}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </AppCard>

        <AppCard>
          <SectionHeader title="Registros recientes" subtitle="Últimas entradas de peso y medidas" />
          {recentWeights.length === 0 ? (
            <EmptyState title="Sin peso registrado" subtitle="Usa 'Registrar peso' para empezar tu historial." />
          ) : (
            <>
              {recentWeights.map((entry) => (
                <View key={entry.id} style={styles.bodyRecordRow}>
                  <View>
                    <Text style={styles.bodyRecordTitle}>{entry.weight_kg.toFixed(1)} kg</Text>
                    <Text style={styles.bodyRecordMeta}>{new Date(entry.created_at).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.bodyRecordNote}>{entry.note?.trim() ? entry.note : "Sin nota"}</Text>
                </View>
              ))}
            </>
          )}
          {recentMeasurements.length ? (
            <View style={styles.bodyMeasurementSummary}>
              <Text style={styles.bodyMeasurementSummaryTitle}>Últimas medidas</Text>
              {recentMeasurements.map((entry) => (
                <Text key={entry.id} style={styles.bodyMeasurementSummaryLine}>
                  {new Date(entry.created_at).toLocaleDateString()} · Cintura {entry.waist_cm ?? "N/D"} · Cuello{" "}
                  {entry.neck_cm ?? "N/D"} · Cadera {entry.hip_cm ?? "N/D"}
                </Text>
              ))}
            </View>
          ) : null}
        </AppCard>

        <AppCard>
          <SectionHeader title="Registrar medidas" subtitle="Opcional para mejorar estimación de % grasa" />
          <InputField label="Cintura (cm)" value={waistInput} onChangeText={setWaistInput} keyboardType="numeric" />
          <InputField label="Cuello (cm)" value={neckInput} onChangeText={setNeckInput} keyboardType="numeric" />
          <InputField label="Cadera (cm)" value={hipInput} onChangeText={setHipInput} keyboardType="numeric" />
          <PrimaryButton title="Guardar medidas" onPress={() => void saveMeasurement()} loading={savingMeasure} />
          <Text style={styles.helperText}>Registros de medidas acumulados: {measurementLogs.length}</Text>
        </AppCard>

        <AppCard>
          <SectionHeader title="Coach hints" subtitle="Reglas simples basadas en tu día" />
          {(summary?.hints ?? []).length === 0 ? (
            <EmptyState title="Sin alertas" subtitle="Tus métricas actuales no generan avisos." />
          ) : (
            (summary?.hints ?? []).map((hint) => (
              <View key={hint} style={styles.insightRow}>
                <View style={styles.insightDot} />
                <Text style={styles.helperText}>{hint}</Text>
              </View>
            ))
          )}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function HistoryScreen() {
  const auth = useAuth();
  const [monthKey, setMonthKey] = useState(formatMonth(new Date()));
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [onlyWithRecords, setOnlyWithRecords] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [days, setDays] = useState<CalendarDayEntry[]>([]);
  const [dayDetailMap, setDayDetailMap] = useState<Record<string, DaySummary>>({});
  const [weightDateMap, setWeightDateMap] = useState<Record<string, number>>({});
  const [weeklyStats, setWeeklyStats] = useState<{
    avgKcal: number;
    avgProtein: number;
    adherenceProteinPct: number;
    streakDays: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const computeWeeklyStats = useCallback(async () => {
    const today = new Date();
    const rows: DaySummary[] = [];

    for (let i = 0; i < 7; i += 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const iso = formatDateLocal(day);
      try {
        const summary = await auth.fetchDaySummary(iso);
        rows.push(summary);
      } catch {
        // Keep stats resilient for missing data.
      }
    }

    if (rows.length === 0) {
      setWeeklyStats(null);
      return;
    }

    const avgKcal = rows.reduce((acc, row) => acc + row.consumed.kcal, 0) / rows.length;
    const avgProtein = rows.reduce((acc, row) => acc + row.consumed.protein_g, 0) / rows.length;
    const goalRows = rows.filter((row) => row.goal && row.goal.protein_goal > 0);
    const adhered = goalRows.filter((row) => row.goal && row.consumed.protein_g >= row.goal.protein_goal * 0.95).length;
    const adherenceProteinPct = goalRows.length ? (adhered / goalRows.length) * 100 : 0;

    let streakDays = 0;
    for (const row of rows) {
      if (row.intakes.length > 0) {
        streakDays += 1;
      } else {
        break;
      }
    }

    setWeeklyStats({
      avgKcal: Math.round(avgKcal),
      avgProtein: Math.round(avgProtein * 10) / 10,
      adherenceProteinPct: Math.round(adherenceProteinPct),
      streakDays,
    });
  }, [auth]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, weights] = await Promise.all([auth.fetchCalendar(monthKey), auth.fetchWeightLogs(365)]);
      setDays(response.days);

      const dateToWeight: Record<string, number> = {};
      weights.forEach((row) => {
        const day = row.created_at.slice(0, 10);
        if (!dateToWeight[day]) {
          dateToWeight[day] = row.weight_kg;
        }
      });
      setWeightDateMap(dateToWeight);

      const detailMap: Record<string, DaySummary> = {};
      for (const day of response.days) {
        if (day.intake_count === 0) {
          continue;
        }
        try {
          const detail = await auth.fetchDaySummary(day.date);
          detailMap[day.date] = detail;
        } catch {
          // Keep rendering even if one day fails.
        }
      }
      setDayDetailMap(detailMap);

      await computeWeeklyStats();
    } catch (error) {
      Alert.alert("Historial", parseApiError(error));
    } finally {
      setLoading(false);
    }
  }, [auth, computeWeeklyStats, monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedDays = useMemo(() => [...days].sort((a, b) => b.date.localeCompare(a.date)), [days]);

  const filteredDays = useMemo(() => {
    const today = new Date();
    const weekCutoff = new Date(today);
    weekCutoff.setDate(today.getDate() - 6);

    return sortedDays.filter((entry) => {
      if (onlyWithRecords && entry.intake_count <= 0) {
        return false;
      }
      if (period === "week") {
        return new Date(entry.date) >= weekCutoff;
      }
      return true;
    });
  }, [onlyWithRecords, period, sortedDays]);

  const selectedDetail = selectedDay ? dayDetailMap[selectedDay] : null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.mainScroll}>
        <AppHeader title="History" subtitle="Actividad, adherencia y tendencias" />

        <AppCard>
          <SectionHeader title="Métricas últimos 7 días" />
          {weeklyStats ? (
            <View style={styles.bodyStatsRow}>
              <StatPill label="Prom kcal" value={`${weeklyStats.avgKcal}`} tone="accent" />
              <StatPill label="Prom proteína" value={`${weeklyStats.avgProtein} g`} />
              <StatPill label="Adherencia proteína" value={`${weeklyStats.adherenceProteinPct}%`} tone="warning" />
              <StatPill label="Racha" value={`${weeklyStats.streakDays} días`} />
            </View>
          ) : (
            <EmptyState title="Sin suficientes datos" subtitle="Registra varios días para activar estadísticas." />
          )}
        </AppCard>

        <AppCard>
          <SectionHeader title="Filtros" subtitle="Periodo y tipo de días" actionLabel="Recargar" onAction={() => void load()} />
          <View style={styles.historyFilterRow}>
            <Pressable
              onPress={() => setPeriod("week")}
              style={[styles.historyFilterChip, period === "week" && styles.historyFilterChipActive]}
            >
              <Text style={[styles.historyFilterText, period === "week" && styles.historyFilterTextActive]}>Semana</Text>
            </Pressable>
            <Pressable
              onPress={() => setPeriod("month")}
              style={[styles.historyFilterChip, period === "month" && styles.historyFilterChipActive]}
            >
              <Text style={[styles.historyFilterText, period === "month" && styles.historyFilterTextActive]}>Mes</Text>
            </Pressable>
            <Pressable
              onPress={() => setOnlyWithRecords((current) => !current)}
              style={[styles.historyFilterChip, onlyWithRecords && styles.historyFilterChipActive]}
            >
              <Text style={[styles.historyFilterText, onlyWithRecords && styles.historyFilterTextActive]}>
                {onlyWithRecords ? "Con registros" : "Todos"}
              </Text>
            </Pressable>
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.calendarHeader}>
            <Pressable onPress={() => setMonthKey((current) => moveMonth(current, -1))} style={styles.calendarNavBtn}>
              <Text style={styles.calendarNavText}>{"<"}</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>{monthKey}</Text>
            <Pressable onPress={() => setMonthKey((current) => moveMonth(current, 1))} style={styles.calendarNavBtn}>
              <Text style={styles.calendarNavText}>{">"}</Text>
            </Pressable>
          </View>

          {loading ? <ActivityIndicator color={theme.accent} /> : null}
          {filteredDays.length === 0 && !loading ? (
            <EmptyState title="Sin días para mostrar" subtitle="Cambia filtros o registra más comidas." />
          ) : null}

          {filteredDays.map((entry) => {
            const detail = dayDetailMap[entry.date];
            const dayWeight = weightDateMap[entry.date];
            return (
              <Pressable key={entry.date} style={styles.historyDayCard} onPress={() => setSelectedDay(entry.date)}>
                <View style={styles.historyDayHead}>
                  <Text style={styles.historyDate}>{entry.date}</Text>
                  <Text style={styles.historyValue}>{Math.round(entry.kcal)} kcal</Text>
                </View>
                <Text style={styles.helperText}>{entry.intake_count} registros</Text>
                <Text style={styles.helperText}>
                  P {Math.round(detail?.consumed.protein_g ?? 0)} / C {Math.round(detail?.consumed.carbs_g ?? 0)} / G{" "}
                  {Math.round(detail?.consumed.fat_g ?? 0)}
                </Text>
                <Text style={styles.helperText}>
                  Peso: {typeof dayWeight === "number" ? `${dayWeight.toFixed(1)} kg` : "sin dato"}
                </Text>
              </Pressable>
            );
          })}
        </AppCard>

        {selectedDay ? (
          <AppCard>
            <SectionHeader title={`Detalle ${selectedDay}`} />
            {selectedDetail ? (
              <>
                <Text style={styles.helperText}>
                  Kcal {Math.round(selectedDetail.consumed.kcal)} | Proteína {Math.round(selectedDetail.consumed.protein_g)} g | Carbs{" "}
                  {Math.round(selectedDetail.consumed.carbs_g)} g | Grasas {Math.round(selectedDetail.consumed.fat_g)} g
                </Text>
                {selectedDetail.intakes.map((intake) => (
                  <View key={intake.id} style={styles.historyIntakeRow}>
                    <Text style={styles.historyValue}>{intake.product_name ?? "Producto"}</Text>
                    <Text style={styles.helperText}>
                      {Math.round(intake.quantity_g ?? 0)} g · {Math.round(intake.nutrients.kcal)} kcal
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.helperText}>No hay detalle disponible para este día.</Text>
            )}
          </AppCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsScreen() {
  const auth = useAuth();
  const today = useMemo(() => formatDateLocal(new Date()), []);
  const [apiDraft, setApiDraft] = useState(auth.apiBaseUrl);
  const [checking, setChecking] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAIKey, setSavingAIKey] = useState(false);
  const [testingAIKey, setTestingAIKey] = useState(false);
  const [deletingAIKey, setDeletingAIKey] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const [unitMode, setUnitMode] = useState<"metric" | "imperial">("metric");
  const [aiProvider, setAiProvider] = useState<"openai" | "gemini">("openai");
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [aiKeyStatus, setAiKeyStatus] = useState<UserAIKeyStatus | null>(null);

  const [goalDraft, setGoalDraft] = useState({
    kcal_goal: "",
    protein_goal: "",
    fat_goal: "",
    carbs_goal: "",
  });
  const [recommendedGoal, setRecommendedGoal] = useState<GoalPayload | null>(null);
  const [bodyHints, setBodyHints] = useState<string[]>([]);

  const [profileDraft, setProfileDraft] = useState({
    weight_kg: auth.profile?.weight_kg ? String(auth.profile.weight_kg) : "",
    height_cm: auth.profile?.height_cm ? String(auth.profile.height_cm) : "",
    age: auth.profile?.age ? String(auth.profile.age) : "",
    sex: auth.profile?.sex ?? "other",
    activity_level: auth.profile?.activity_level ?? "moderate",
    goal_type: auth.profile?.goal_type ?? "maintain",
    waist_cm: auth.profile?.waist_cm ? String(auth.profile.waist_cm) : "",
    neck_cm: auth.profile?.neck_cm ? String(auth.profile.neck_cm) : "",
    hip_cm: auth.profile?.hip_cm ? String(auth.profile.hip_cm) : "",
  });

  useEffect(() => {
    setProfileDraft({
      weight_kg: auth.profile?.weight_kg ? String(auth.profile.weight_kg) : "",
      height_cm: auth.profile?.height_cm ? String(auth.profile.height_cm) : "",
      age: auth.profile?.age ? String(auth.profile.age) : "",
      sex: auth.profile?.sex ?? "other",
      activity_level: auth.profile?.activity_level ?? "moderate",
      goal_type: auth.profile?.goal_type ?? "maintain",
      waist_cm: auth.profile?.waist_cm ? String(auth.profile.waist_cm) : "",
      neck_cm: auth.profile?.neck_cm ? String(auth.profile.neck_cm) : "",
      hip_cm: auth.profile?.hip_cm ? String(auth.profile.hip_cm) : "",
    });
  }, [auth.profile]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [goalResponse, analysis, bodySummary, aiStatus] = await Promise.all([
        auth.fetchGoal(today),
        auth.fetchAnalysis(today),
        auth.fetchBodySummary(),
        auth.fetchUserAIKeyStatus(),
      ]);

      setRecommendedGoal(analysis.recommended_goal);
      setBodyHints(bodySummary.hints);
      setAiKeyStatus(aiStatus);
      if (aiStatus.provider) {
        setAiProvider(aiStatus.provider);
      }

      if (goalResponse) {
        setGoalDraft({
          kcal_goal: String(goalResponse.kcal_goal),
          protein_goal: String(goalResponse.protein_goal),
          fat_goal: String(goalResponse.fat_goal),
          carbs_goal: String(goalResponse.carbs_goal),
        });
      } else {
        setGoalDraft({
          kcal_goal: String(analysis.recommended_goal.kcal_goal),
          protein_goal: String(analysis.recommended_goal.protein_goal),
          fat_goal: String(analysis.recommended_goal.fat_goal),
          carbs_goal: String(analysis.recommended_goal.carbs_goal),
        });
      }
    } catch (error) {
      Alert.alert("Settings", parseApiError(error));
    } finally {
      setLoadingMeta(false);
    }
  }, [auth, today]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const applyApi = async () => {
    const normalized = normalizeBaseUrl(apiDraft);
    if (!normalized) {
      Alert.alert("API", "URL inválida.");
      return;
    }

    auth.setApiBaseUrl(normalized);
    setChecking(true);
    const ok = await auth.checkHealth(normalized);
    setChecking(false);

    if (!ok) {
      Alert.alert("API", "No se pudo conectar con esa URL.");
      return;
    }

    Alert.alert("API", "Conexión OK.");
  };

  const saveGoals = async () => {
    const payload = {
      kcal_goal: Number(goalDraft.kcal_goal),
      protein_goal: Number(goalDraft.protein_goal),
      fat_goal: Number(goalDraft.fat_goal),
      carbs_goal: Number(goalDraft.carbs_goal),
    };
    if (!payload.kcal_goal || !payload.protein_goal || !payload.fat_goal || !payload.carbs_goal) {
      Alert.alert("Objetivos", "Revisa los valores.");
      return;
    }
    setSavingGoals(true);
    try {
      await auth.saveGoal(today, payload);
      Alert.alert("Objetivos", "Objetivos guardados.");
      await loadMeta();
    } catch (error) {
      Alert.alert("Objetivos", parseApiError(error));
    } finally {
      setSavingGoals(false);
    }
  };

  const useRecommendedGoals = () => {
    if (!recommendedGoal) {
      return;
    }
    setGoalDraft({
      kcal_goal: String(recommendedGoal.kcal_goal),
      protein_goal: String(recommendedGoal.protein_goal),
      fat_goal: String(recommendedGoal.fat_goal),
      carbs_goal: String(recommendedGoal.carbs_goal),
    });
  };

  const saveProfile = async () => {
    const weight = toPositiveNumberOrNull(profileDraft.weight_kg);
    const height = toPositiveNumberOrNull(profileDraft.height_cm);
    if (!weight || !height) {
      Alert.alert("Perfil", "Peso y altura son obligatorios.");
      return;
    }

    setSavingProfile(true);
    try {
      await auth.saveProfile({
        weight_kg: weight,
        height_cm: height,
        age: profileDraft.age.trim() ? Number(profileDraft.age) : null,
        sex: profileDraft.sex,
        activity_level: profileDraft.activity_level,
        goal_type: profileDraft.goal_type,
        waist_cm: toOptionalNumber(profileDraft.waist_cm),
        neck_cm: toOptionalNumber(profileDraft.neck_cm),
        hip_cm: toOptionalNumber(profileDraft.hip_cm),
        chest_cm: null,
        arm_cm: null,
        thigh_cm: null,
      });
      Alert.alert("Perfil", "Perfil actualizado.");
      await loadMeta();
    } catch (error) {
      Alert.alert("Perfil", parseApiError(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const exportData = async () => {
    try {
      const [summary, weights, measurements, body] = await Promise.all([
        auth.fetchDaySummary(today),
        auth.fetchWeightLogs(365),
        auth.fetchMeasurementLogs(365),
        auth.fetchBodySummary(),
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        today,
        summary,
        weights,
        measurements,
        body,
      };
      const text = JSON.stringify(payload);
      console.log("NUTRI_EXPORT_JSON", text);
      Alert.alert("Datos", `Export JSON generado (${Math.round(text.length / 1024)} KB). Revisar consola del bundler.`);
    } catch (error) {
      Alert.alert("Datos", parseApiError(error));
    }
  };

  const saveAIKey = async () => {
    if (!aiKeyInput.trim()) {
      Alert.alert("IA", "Pega una API key válida.");
      return;
    }

    setSavingAIKey(true);
    try {
      const statusPayload = await auth.saveUserAIKey({
        provider: aiProvider,
        apiKey: aiKeyInput.trim(),
      });
      setAiKeyStatus(statusPayload);
      setAiKeyInput("");
      Alert.alert("IA", "Clave guardada correctamente.");
    } catch (error) {
      Alert.alert("IA", parseApiError(error));
    } finally {
      setSavingAIKey(false);
    }
  };

  const testAIKey = async () => {
    setTestingAIKey(true);
    try {
      const response = await auth.testUserAIKey({
        provider: aiProvider,
        apiKey: aiKeyInput.trim() || undefined,
      });
      Alert.alert("IA", response.message);
      const statusPayload = await auth.fetchUserAIKeyStatus();
      setAiKeyStatus(statusPayload);
    } catch (error) {
      Alert.alert("IA", parseApiError(error));
    } finally {
      setTestingAIKey(false);
    }
  };

  const deleteAIKey = async () => {
    setDeletingAIKey(true);
    try {
      await auth.deleteUserAIKey();
      setAiKeyInput("");
      const statusPayload = await auth.fetchUserAIKeyStatus();
      setAiKeyStatus(statusPayload);
      Alert.alert("IA", "Clave eliminada.");
    } catch (error) {
      Alert.alert("IA", parseApiError(error));
    } finally {
      setDeletingAIKey(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.mainScroll}>
        <AppHeader title="Settings" subtitle="Cuenta, objetivos, perfil y app" />

        <AppCard>
          <SectionHeader title="Cuenta" subtitle="Estado de autenticación" />
          <StatRow label="Email" value={auth.user?.email ?? "-"} />
          <StatRow label="Email verificado" value={auth.user?.email_verified ? "Sí" : "No"} />
          <StatRow label="Onboarding" value={auth.user?.onboarding_completed ? "Completado" : "Pendiente"} />
          <SecondaryButton title="Cerrar sesión" onPress={() => void auth.logout()} />
        </AppCard>

        <AppCard>
          <SectionHeader
            title="Objetivos diarios"
            subtitle="Ajusta kcal/proteína/grasa/carbs"
            actionLabel="Recalcular recomendación"
            onAction={useRecommendedGoals}
          />
          {loadingMeta ? <ActivityIndicator color={theme.accent} /> : null}
          <InputField
            label="Kcal"
            value={goalDraft.kcal_goal}
            onChangeText={(value) => setGoalDraft((current) => ({ ...current, kcal_goal: value }))}
            keyboardType="numeric"
          />
          <InputField
            label="Proteína (g)"
            value={goalDraft.protein_goal}
            onChangeText={(value) => setGoalDraft((current) => ({ ...current, protein_goal: value }))}
            keyboardType="numeric"
          />
          <InputField
            label="Grasa (g)"
            value={goalDraft.fat_goal}
            onChangeText={(value) => setGoalDraft((current) => ({ ...current, fat_goal: value }))}
            keyboardType="numeric"
          />
          <InputField
            label="Carbs (g)"
            value={goalDraft.carbs_goal}
            onChangeText={(value) => setGoalDraft((current) => ({ ...current, carbs_goal: value }))}
            keyboardType="numeric"
          />
          {recommendedGoal ? (
            <Text style={styles.helperText}>
              Recomendado: {recommendedGoal.kcal_goal} kcal | P {recommendedGoal.protein_goal} | G {recommendedGoal.fat_goal} | C{" "}
              {recommendedGoal.carbs_goal}
            </Text>
          ) : null}
          <PrimaryButton title="Guardar objetivos" onPress={() => void saveGoals()} loading={savingGoals} />
        </AppCard>

        <AppCard>
          <SectionHeader title="Perfil corporal" subtitle="Datos base para cálculos" />
          <InputField
            label="Peso (kg)"
            value={profileDraft.weight_kg}
            onChangeText={(value) => setProfileDraft((current) => ({ ...current, weight_kg: value }))}
            keyboardType="numeric"
          />
          <InputField
            label="Altura (cm)"
            value={profileDraft.height_cm}
            onChangeText={(value) => setProfileDraft((current) => ({ ...current, height_cm: value }))}
            keyboardType="numeric"
          />
          <InputField
            label="Edad"
            value={profileDraft.age}
            onChangeText={(value) => setProfileDraft((current) => ({ ...current, age: value }))}
            keyboardType="numeric"
          />
          <ChoiceRow
            label="Sexo"
            value={profileDraft.sex}
            onChange={(value) => setProfileDraft((current) => ({ ...current, sex: value }))}
            options={[
              { label: "Masculino", value: "male" },
              { label: "Femenino", value: "female" },
              { label: "Otro", value: "other" },
            ]}
          />
          <ChoiceRow
            label="Actividad"
            value={profileDraft.activity_level}
            onChange={(value) => setProfileDraft((current) => ({ ...current, activity_level: value }))}
            options={[
              { label: "Sedentario", value: "sedentary" },
              { label: "Ligero", value: "light" },
              { label: "Moderado", value: "moderate" },
              { label: "Activo", value: "active" },
              { label: "Atleta", value: "athlete" },
            ]}
          />
          <ChoiceRow
            label="Objetivo"
            value={profileDraft.goal_type}
            onChange={(value) => setProfileDraft((current) => ({ ...current, goal_type: value }))}
            options={[
              { label: "Perder", value: "lose" },
              { label: "Mantener", value: "maintain" },
              { label: "Ganar", value: "gain" },
            ]}
          />
          <InputField
            label="Cintura (cm)"
            value={profileDraft.waist_cm}
            onChangeText={(value) => setProfileDraft((current) => ({ ...current, waist_cm: value }))}
            keyboardType="numeric"
          />
          <InputField
            label="Cuello (cm)"
            value={profileDraft.neck_cm}
            onChangeText={(value) => setProfileDraft((current) => ({ ...current, neck_cm: value }))}
            keyboardType="numeric"
          />
          <InputField
            label="Cadera (cm)"
            value={profileDraft.hip_cm}
            onChangeText={(value) => setProfileDraft((current) => ({ ...current, hip_cm: value }))}
            keyboardType="numeric"
          />
          <PrimaryButton title="Guardar perfil" onPress={() => void saveProfile()} loading={savingProfile} />
        </AppCard>

        <AppCard>
          <SectionHeader title="IA" subtitle="API key por usuario (BYOK)" />
          <Text style={styles.helperText}>Tu clave se usa solo para procesar imágenes con IA.</Text>
          <ChoiceRow
            label="Proveedor IA"
            value={aiProvider}
            onChange={setAiProvider}
            options={[
              { label: "OpenAI", value: "openai" },
              { label: "Gemini (futuro)", value: "gemini" },
            ]}
          />
          <InputField
            label="API key"
            value={aiKeyInput}
            onChangeText={setAiKeyInput}
            autoCapitalize="none"
            secureTextEntry
            placeholder="sk-..."
          />
          <Text style={styles.helperText}>
            Estado: {aiKeyStatus?.configured ? "configurada" : "sin configurar"}{" "}
            {aiKeyStatus?.key_hint ? `(${aiKeyStatus.key_hint})` : ""}
          </Text>
          <PrimaryButton title="Guardar clave" onPress={() => void saveAIKey()} loading={savingAIKey} />
          <SecondaryButton
            title="Probar clave"
            onPress={() => void testAIKey()}
            disabled={testingAIKey || savingAIKey || deletingAIKey}
          />
          <SecondaryButton
            title="Eliminar clave"
            onPress={() => void deleteAIKey()}
            disabled={deletingAIKey || savingAIKey || testingAIKey || !aiKeyStatus?.configured}
          />
        </AppCard>

        <AppCard>
          <SectionHeader title="App" subtitle="Conectividad y preferencias" />
          <Text style={styles.sectionTitle}>API base URL</Text>
          <InputField label="URL" value={apiDraft} onChangeText={setApiDraft} autoCapitalize="none" />
          <PrimaryButton title="Guardar y probar" onPress={() => void applyApi()} loading={checking} />
          <ChoiceRow
            label="Tema"
            value={themeMode}
            onChange={setThemeMode}
            options={[
              { label: "Dark", value: "dark" },
              { label: "Light (futuro)", value: "light" },
            ]}
          />
          <ChoiceRow
            label="Unidades"
            value={unitMode}
            onChange={setUnitMode}
            options={[
              { label: "Métrico", value: "metric" },
              { label: "Imperial (futuro)", value: "imperial" },
            ]}
          />
        </AppCard>

        <AppCard>
          <SectionHeader title="Datos" subtitle="Exportación y utilidades" />
          <SecondaryButton title="Exportar datos JSON" onPress={() => void exportData()} />
          <SecondaryButton title="Reset demo data (stub)" onPress={() => Alert.alert("Datos", "Stub listo. Pendiente endpoint de borrado seguro.")} />
          <SectionHeader title="Coach hints activos" />
          {bodyHints.length ? (
            bodyHints.map((hint) => (
              <View key={hint} style={styles.insightRow}>
                <View style={styles.insightDot} />
                <Text style={styles.helperText}>{hint}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.helperText}>Sin hints críticos por ahora.</Text>
          )}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuantityMethodSelector(props: {
  method: IntakeMethod;
  onChange: (method: IntakeMethod) => void;
  product: Product;
}) {
  const options: Array<{ label: string; value: IntakeMethod; disabled?: boolean }> = [
    { label: "Gramos", value: "grams" },
    { label: "Porción", value: "units", disabled: !props.product.serving_size_g },
    { label: "% paquete", value: "percent_pack", disabled: !props.product.net_weight_g },
  ];

  return (
    <View style={styles.methodRow}>
      {options.map((option) => {
        const active = option.value === props.method;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!option.disabled) {
                props.onChange(option.value);
              }
            }}
            style={[styles.methodChip, active && styles.methodChipActive, option.disabled && styles.methodChipDisabled]}
          >
            <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AddScreen() {
  const auth = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<AddMode>("hub");
  const [scanLocked, setScanLocked] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanSuccessFlash, setScanSuccessFlash] = useState(false);
  const [phase, setPhase] = useState<"camera" | "label" | "quantity">("camera");
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [productQuality, setProductQuality] = useState<ProductDataQuality | null>(null);
  const [preferredServing, setPreferredServing] = useState<ProductPreference | null>(null);
  const scanPulse = useRef(new Animated.Value(0)).current;
  const [recentProducts, setRecentProducts] = useState<Array<{ id: number; name: string }>>([]);

  const [labelName, setLabelName] = useState("");
  const [labelBrand, setLabelBrand] = useState("");
  const [labelText, setLabelText] = useState("");
  const [labelPhotos, setLabelPhotos] = useState<string[]>([]);
  const [labelQuestions, setLabelQuestions] = useState<string[]>([]);
  const [correctionPreview, setCorrectionPreview] = useState<ProductCorrectionResponse | null>(null);

  const [mealDescription, setMealDescription] = useState("");
  const [mealPhotos, setMealPhotos] = useState<string[]>([]);
  const [mealModel, setMealModel] = useState<MealModelOption>("gpt-4o-mini");
  const [mealPortion, setMealPortion] = useState<"" | "small" | "medium" | "large">("");
  const [mealAddedFat, setMealAddedFat] = useState<"unknown" | "yes" | "no">("unknown");
  const [mealQuantityNote, setMealQuantityNote] = useState("");
  const [mealAdjust, setMealAdjust] = useState(0);
  const [mealQuestions, setMealQuestions] = useState<string[]>([]);
  const [mealAssumptions, setMealAssumptions] = useState<string[]>([]);
  const [mealIngredients, setMealIngredients] = useState<string[]>([]);
  const [mealSuggestedModel, setMealSuggestedModel] = useState<"gpt-5.1" | null>(null);
  const [mealPreview, setMealPreview] = useState<MealPhotoEstimateResponse | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualKcal, setManualKcal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<FoodSearchItem[]>([]);
  const [searchingFoods, setSearchingFoods] = useState(false);

  const [method, setMethod] = useState<IntakeMethod>("grams");
  const [grams, setGrams] = useState(120);
  const [units, setUnits] = useState(1);
  const [percentPack, setPercentPack] = useState(25);
  const [saving, setSaving] = useState(false);
  const todayKey = useMemo(() => formatDateLocal(new Date()), []);

  const hasCamera = permission?.granted ?? false;

  const requestCameraAndUnlock = useCallback(async () => {
    const granted = permission?.granted ?? false;
    if (granted) {
      return;
    }

    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert("Permisos", "Activa permiso de cámara para usar el escáner.");
    }
  }, [permission?.granted, requestPermission]);

  const resetScanState = useCallback(() => {
    setPhase("camera");
    setScanLocked(false);
    setProcessing(false);
    setScanSuccessFlash(false);
    setProduct(null);
    setProductQuality(null);
    setPreferredServing(null);
    setBarcode("");
    setLabelName("");
    setLabelBrand("");
    setLabelText("");
    setLabelPhotos([]);
    setLabelQuestions([]);
    setCorrectionPreview(null);
    setMethod("grams");
    setGrams(120);
    setUnits(1);
    setPercentPack(25);
  }, []);

  const resetToHub = useCallback(() => {
    resetScanState();
    setMode("hub");
  }, [resetScanState]);

  const prefillFromPreference = useCallback((nextProduct: Product, pref: ProductPreference | null) => {
    if (!pref) {
      if (nextProduct.serving_size_g) {
        setMethod("units");
        setUnits(1);
      } else {
        setMethod("grams");
        setGrams(120);
      }
      return;
    }

    setMethod(pref.method);
    if (pref.quantity_g) {
      setGrams(pref.quantity_g);
    }
    if (pref.quantity_units) {
      setUnits(pref.quantity_units);
    }
    if (pref.percent_pack) {
      setPercentPack(pref.percent_pack);
    }
  }, []);

  const loadRecentProducts = useCallback(async () => {
    try {
      const summary = await auth.fetchDaySummary(todayKey);
      const seen = new Set<number>();
      const next: Array<{ id: number; name: string }> = [];
      [...summary.intakes]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .forEach((intake) => {
          if (seen.has(intake.product_id)) {
            return;
          }
          seen.add(intake.product_id);
          next.push({ id: intake.product_id, name: intake.product_name ?? `Producto ${intake.product_id}` });
        });
      setRecentProducts(next.slice(0, 6));
    } catch {
      setRecentProducts([]);
    }
  }, [auth, todayKey]);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(MEAL_MODEL_STORAGE_KEY)
      .then((stored) => {
        if (!active) {
          return;
        }
        setMealModel(normalizeMealModelOption(stored));
      })
      .catch(() => {
        // Keep default model when storage is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void SecureStore.setItemAsync(MEAL_MODEL_STORAGE_KEY, mealModel).catch(() => {
      // Preference persistence is best-effort.
    });
  }, [mealModel]);

  const startBarcodeFlow = async () => {
    resetScanState();
    setMode("barcode");
    setPhase("camera");
    await requestCameraAndUnlock();
  };

  const startLabelFlow = () => {
    resetScanState();
    setMode("label_fix");
    setPhase("label");
  };

  const ensureAIKeyConfigured = useCallback(async (): Promise<boolean> => {
    try {
      const statusPayload = await auth.fetchUserAIKeyStatus();
      if (statusPayload.configured) {
        return true;
      }
      Alert.alert("IA", "Configura tu API key en Settings > IA para usar estimación por foto.");
      return false;
    } catch (error) {
      Alert.alert("IA", parseApiError(error));
      return false;
    }
  }, [auth]);

  const startMealFlow = async () => {
    const hasKey = await ensureAIKeyConfigured();
    if (!hasKey) {
      return;
    }

    resetScanState();
    setMealDescription("");
    setMealPhotos([]);
    setMealPortion("");
    setMealAddedFat("unknown");
    setMealQuantityNote("");
    setMealAdjust(0);
    setMealQuestions([]);
    setMealAssumptions([]);
    setMealIngredients([]);
    setMealSuggestedModel(null);
    setMealPreview(null);
    setMode("meal_photo");
  };

  const startManualFlow = () => {
    resetScanState();
    setManualName("");
    setManualBrand("");
    setManualBarcode("");
    setManualImageUrl("");
    setManualKcal("");
    setManualProtein("");
    setManualFat("");
    setManualCarbs("");
    setManualSearch("");
    setManualResults([]);
    setMode("manual");
  };

  const resolvedQuantityG = useMemo(() => {
    if (!product) {
      return 0;
    }
    if (method === "grams") {
      return grams;
    }
    if (method === "units") {
      return (product.serving_size_g ?? 0) * units;
    }
    return (product.net_weight_g ?? 0) * (percentPack / 100);
  }, [grams, method, percentPack, product, units]);

  const previewNutrients = useMemo(() => {
    if (!product || resolvedQuantityG <= 0) {
      return null;
    }

    const factor =
      product.nutrition_basis === "per_serving"
        ? product.serving_size_g
          ? resolvedQuantityG / product.serving_size_g
          : 0
        : resolvedQuantityG / 100;

    if (factor <= 0) {
      return null;
    }
    return {
      kcal: Math.round(product.kcal * factor),
      protein: Math.round(product.protein_g * factor * 10) / 10,
      carbs: Math.round(product.carbs_g * factor * 10) / 10,
      fats: Math.round(product.fat_g * factor * 10) / 10,
    };
  }, [product, resolvedQuantityG]);

  const handleScan = async (result: BarcodeScanningResult) => {
    if (scanLocked) {
      return;
    }

    setScanLocked(true);
    setProcessing(true);
    Vibration.vibrate(50);
    setScanSuccessFlash(true);

    try {
      const raw = result.data.trim();
      setBarcode(raw);
      const lookup = await auth.lookupByBarcode(raw);

      if (lookup.product) {
        setProduct(lookup.product);
        prefillFromPreference(lookup.product, lookup.preferred_serving);
        setPreferredServing(lookup.preferred_serving);
        setLabelName(lookup.product.name);
        setLabelBrand(lookup.product.brand ?? "");
        await new Promise((resolve) => {
          setTimeout(resolve, 180);
        });
        setPhase("quantity");
      } else {
        setProduct(null);
        setPreferredServing(null);
        setLabelName("");
        setLabelBrand("");
        setLabelQuestions([
          lookup.message ?? "No hay nutrición suficiente para este barcode.",
          ...lookup.missing_fields.map((field) => `Falta ${field}`),
        ]);
        setPhase("label");
      }
    } catch (error) {
      Alert.alert("Escáner", parseApiError(error));
      setScanLocked(false);
      setPhase("camera");
    } finally {
      setProcessing(false);
    }
  };

  const captureLabelPhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permisos", "Necesitas permisos de cámara para capturar etiqueta.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    const firstAsset = result.canceled ? null : result.assets[0];
    if (!firstAsset?.uri) {
      return;
    }

    setCorrectionPreview(null);
    setLabelPhotos((current) => [...current, firstAsset.uri]);
  };

  const captureMealPhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permisos", "Necesitas permisos de cámara para capturar comida.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false });
    const firstAsset = result.canceled ? null : result.assets[0];
    if (!firstAsset?.uri) {
      return;
    }
    setMealPreview(null);
    setMealPhotos((current) => [...current, firstAsset.uri]);
  };

  const mealAddedFatFlag = mealAddedFat === "unknown" ? undefined : mealAddedFat === "yes";

  const runMealQuestions = async () => {
    const hasKey = await ensureAIKeyConfigured();
    if (!hasKey) {
      return;
    }
    if (!mealDescription.trim()) {
      Alert.alert("Estimación", "Añade una descripción breve de la comida.");
      return;
    }
    setSaving(true);
    try {
      const response = await auth.mealEstimateQuestions({
        description: mealDescription.trim(),
        model: mealModel,
        portionSize: mealPortion || undefined,
        hasAddedFats: mealAddedFatFlag,
        quantityNote: mealQuantityNote.trim() || undefined,
        photos: mealPhotos,
      });
      setMealQuestions(response.questions);
      setMealAssumptions(response.assumptions);
      setMealIngredients(response.detected_ingredients);
      setMealSuggestedModel(response.suggested_model);
    } catch (error) {
      Alert.alert("Estimación", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const runMealPreview = async (adjustPercent = mealAdjust) => {
    const hasKey = await ensureAIKeyConfigured();
    if (!hasKey) {
      return;
    }
    if (!mealDescription.trim()) {
      Alert.alert("Estimación", "Añade una descripción breve de la comida.");
      return;
    }
    setSaving(true);
    try {
      const response = await auth.mealPhotoEstimate({
        description: mealDescription.trim(),
        model: mealModel,
        portionSize: mealPortion || undefined,
        hasAddedFats: mealAddedFatFlag,
        quantityNote: mealQuantityNote.trim() || undefined,
        photos: mealPhotos,
        adjustPercent,
        commit: false,
      });
      setMealPreview(response);
      setMealQuestions(response.questions);
      setMealAssumptions(response.assumptions);
      setMealIngredients(response.detected_ingredients);
      setMealSuggestedModel(response.suggested_model);
      setMealAdjust(adjustPercent);
    } catch (error) {
      Alert.alert("Estimación", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveMealEstimate = async () => {
    const hasKey = await ensureAIKeyConfigured();
    if (!hasKey) {
      return;
    }
    if (!mealDescription.trim()) {
      Alert.alert("Estimación", "Añade una descripción breve de la comida.");
      return;
    }
    setSaving(true);
    try {
      const response = await auth.mealPhotoEstimate({
        description: mealDescription.trim(),
        model: mealModel,
        portionSize: mealPortion || undefined,
        hasAddedFats: mealAddedFatFlag,
        quantityNote: mealQuantityNote.trim() || undefined,
        photos: mealPhotos,
        adjustPercent: mealAdjust,
        commit: true,
      });
      if (!response.saved || !response.intake) {
        Alert.alert("Estimación", "No se pudo guardar. Revisa las preguntas sugeridas.");
        return;
      }
      Alert.alert("Estimación", "Comida estimada guardada correctamente.");
      resetToHub();
    } catch (error) {
      Alert.alert("Estimación", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const createFromLabel = async () => {
    if (!labelName.trim()) {
      Alert.alert("Producto", "Indica nombre del producto.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "label_fix") {
        if (!product?.id && !barcode.trim()) {
          Alert.alert("Corrección", "Necesitas un producto activo o un barcode para corregir.");
          return;
        }

        const correction = await auth.correctProductFromLabel({
          productId: product?.id,
          barcode: product?.id ? undefined : barcode.trim(),
          name: labelName.trim(),
          brand: labelBrand.trim(),
          labelText: labelText.trim(),
          photos: labelPhotos,
          confirmUpdate: false,
        });
        setCorrectionPreview(correction);
        const correctionNotes = [...correction.questions, ...(correction.warnings ?? [])];
        if (correctionNotes.length) {
          setLabelQuestions(correctionNotes);
        }
        return;
      }

      const response = await auth.createProductFromLabel({
        barcode: barcode.trim() || undefined,
        name: labelName.trim(),
        brand: labelBrand.trim(),
        labelText: labelText.trim(),
        photos: labelPhotos,
      });

      if (!response.created || !response.product) {
        const notes = [...response.questions, ...(response.warnings ?? [])];
        const questions = notes.join("\n") || "No se pudo crear/actualizar el producto.";
        Alert.alert("Etiqueta", questions);
        setLabelQuestions(notes);
        return;
      }

      setProduct(response.product);
      prefillFromPreference(response.product, preferredServing);
      setMode("barcode");
      setPhase("quantity");
    } catch (error) {
      Alert.alert("Etiqueta", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmCorrection = async () => {
    if (mode !== "label_fix") {
      return;
    }
    if (!product?.id && !barcode.trim()) {
      Alert.alert("Corrección", "Necesitas un producto activo o un barcode para confirmar.");
      return;
    }

    setSaving(true);
    try {
      const response = await auth.correctProductFromLabel({
        productId: product?.id,
        barcode: product?.id ? undefined : barcode.trim(),
        name: labelName.trim(),
        brand: labelBrand.trim(),
        labelText: labelText.trim(),
        photos: labelPhotos,
        confirmUpdate: true,
      });
      setCorrectionPreview(response);
      if (!response.updated) {
        Alert.alert("Corrección", response.message);
        return;
      }
      setProduct(response.product);
      prefillFromPreference(response.product, preferredServing);
      setMode("barcode");
      setPhase("quantity");
      Alert.alert("Corrección", "Producto actualizado con datos verificados.");
    } catch (error) {
      Alert.alert("Corrección", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const searchManualFoods = async () => {
    const query = manualSearch.trim();
    if (query.length < 2) {
      Alert.alert("Buscar", "Escribe al menos 2 caracteres.");
      return;
    }

    setSearchingFoods(true);
    try {
      const response = await auth.searchFoods(query);
      setManualResults(response.results);
      if (!response.results.length) {
        Alert.alert("Buscar", "Sin resultados para esa búsqueda.");
      }
    } catch (error) {
      Alert.alert("Buscar", parseApiError(error));
    } finally {
      setSearchingFoods(false);
    }
  };

  const selectManualResult = (item: FoodSearchItem) => {
    setProduct(item.product);
    setPreferredServing(null);
    setLabelName(item.product.name);
    setLabelBrand(item.product.brand ?? "");
    setMode("barcode");
    setPhase("quantity");
  };

  const saveManualProduct = async () => {
    const kcal = Number(manualKcal);
    const protein = Number(manualProtein);
    const fat = Number(manualFat);
    const carbs = Number(manualCarbs);

    if (!manualName.trim()) {
      Alert.alert("Manual", "El nombre es obligatorio.");
      return;
    }
    if (![kcal, protein, fat, carbs].every((value) => Number.isFinite(value) && value >= 0)) {
      Alert.alert("Manual", "Completa macros válidos por 100 g.");
      return;
    }

    setSaving(true);
    try {
      const response = await auth.createCommunityFood({
        barcode: manualBarcode.trim() || undefined,
        name: manualName.trim(),
        brand: manualBrand.trim() || undefined,
        imageUrl: manualImageUrl.trim() || undefined,
        nutrition_basis: "per_100g",
        kcal,
        protein_g: protein,
        fat_g: fat,
        carbs_g: carbs,
      });
      setProduct(response);
      setPreferredServing(null);
      setMode("barcode");
      setPhase("quantity");
      setMethod("grams");
      setGrams(120);
      Alert.alert("Manual", "Producto compartido en la base comunitaria.");
    } catch (error) {
      Alert.alert("Manual", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveIntake = async () => {
    if (!product) {
      return;
    }

    setSaving(true);
    try {
      if (method === "grams") {
        await auth.createIntake({ product_id: product.id, method: "grams", quantity_g: grams });
      } else if (method === "units") {
        await auth.createIntake({ product_id: product.id, method: "units", quantity_units: units });
      } else {
        await auth.createIntake({ product_id: product.id, method: "percent_pack", percent_pack: percentPack });
      }

      Alert.alert("Consumo", "Intake guardado correctamente.");
      resetToHub();
    } catch (error) {
      Alert.alert("Consumo", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveWithPreferredQuantity = async () => {
    if (!product || !preferredServing) {
      Alert.alert("Cantidad", "No hay una cantidad previa guardada para este producto.");
      return;
    }

    setSaving(true);
    try {
      if (preferredServing.method === "grams") {
        await auth.createIntake({
          product_id: product.id,
          method: "grams",
          quantity_g: preferredServing.quantity_g ?? grams,
        });
      } else if (preferredServing.method === "units") {
        await auth.createIntake({
          product_id: product.id,
          method: "units",
          quantity_units: preferredServing.quantity_units ?? 1,
        });
      } else {
        await auth.createIntake({
          product_id: product.id,
          method: "percent_pack",
          percent_pack: preferredServing.percent_pack ?? 25,
        });
      }
      Alert.alert("Consumo", "Guardado con la última cantidad usada.");
      resetToHub();
    } catch (error) {
      Alert.alert("Consumo", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openCorrectionFromProduct = () => {
    if (!product) {
      return;
    }
    setMode("label_fix");
    setPhase("label");
    setBarcode(product.barcode ?? "");
    setLabelName(product.name);
    setLabelBrand(product.brand ?? "");
    setLabelText("");
    setLabelPhotos([]);
    setLabelQuestions([]);
    setCorrectionPreview(null);
  };

  useEffect(() => {
    if (mode !== "barcode" || phase !== "camera") {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.cubic),
        }),
        Animated.timing(scanPulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.cubic),
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mode, phase, scanPulse]);

  useEffect(() => {
    if (!scanSuccessFlash) {
      return;
    }
    const timer = setTimeout(() => setScanSuccessFlash(false), 900);
    return () => clearTimeout(timer);
  }, [scanSuccessFlash]);

  useEffect(() => {
    if (mode !== "hub") {
      return;
    }
    void loadRecentProducts();
  }, [loadRecentProducts, mode]);

  useEffect(() => {
    if (mode !== "barcode" || phase !== "quantity" || !product) {
      return;
    }
    let active = true;
    void auth
      .fetchProductDataQuality(product.id)
      .then((quality) => {
        if (active) {
          setProductQuality(quality);
        }
      })
      .catch(() => {
        if (active) {
          setProductQuality(null);
        }
      });
    return () => {
      active = false;
    };
  }, [auth, mode, phase, product]);

  const subtitle =
    mode === "hub"
      ? "Escáner, etiqueta, foto de comida o carga manual"
      : mode === "barcode"
        ? "Escáner de código de barras"
        : mode === "label_fix"
          ? "Corregir o añadir datos nutricionales por etiqueta"
          : mode === "meal_photo"
            ? "Estimación guiada de plato por foto + descripción"
            : "Carga manual rápida de producto";

  const showLabelForm = mode === "label_fix" || (mode === "barcode" && phase === "label");

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.scanContainer}>
        <AppHeader title="Añadir" subtitle={subtitle} />

        {mode === "hub" ? (
          <ScrollView contentContainerStyle={styles.addHubPane}>
            <AddActionCard
              title="Escanear código de barras"
              subtitle="Busca en BD/OpenFoodFacts y registra cantidad"
              onPress={() => void startBarcodeFlow()}
            />
            <AddActionCard
              title="Corregir etiqueta nutricional"
              subtitle="Sube foto de etiqueta para actualizar valores"
              onPress={startLabelFlow}
            />
            <AddActionCard
              title="Estimar comida por foto"
              subtitle="Foto + descripción con estimación conservadora"
              onPress={() => void startMealFlow()}
            />
            <AddActionCard
              title="Añadir manualmente"
              subtitle="Crea producto rápido con macros por 100 g"
              onPress={startManualFlow}
            />
            {recentProducts.length ? (
              <AppCard>
                <SectionHeader title="Últimos productos" subtitle="Acceso rápido reciente" />
                <View style={styles.portionQuickRow}>
                  {recentProducts.map((item) => (
                    <TagChip key={item.id} label={item.name} />
                  ))}
                </View>
              </AppCard>
            ) : null}
          </ScrollView>
        ) : null}

        {mode === "barcode" && phase === "camera" ? (
          <View style={styles.scanCameraWrap}>
            {hasCamera ? (
              <CameraView
                style={styles.cameraView}
                onBarcodeScanned={scanLocked ? undefined : handleScan}
                barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
              />
            ) : (
              <View style={styles.centered}>
                <Text style={styles.helperText}>Permiso de cámara pendiente.</Text>
                <SecondaryButton title="Conceder permiso" onPress={() => void requestCameraAndUnlock()} />
              </View>
            )}

            <View pointerEvents="none" style={styles.scanOverlay}>
              <Animated.View
                style={[
                  styles.scanFrame,
                  {
                    transform: [
                      {
                        scale: scanPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.03],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
              </Animated.View>
              <Text style={styles.scanHint}>Centra el código de barras</Text>
              {scanSuccessFlash ? (
                <View style={styles.scanSuccessBadge}>
                  <Text style={styles.scanSuccessBadgeText}>OK</Text>
                </View>
              ) : null}
            </View>

            {processing ? (
              <View style={styles.scanBusyOverlay}>
                <ActivityIndicator color={theme.accent} size="large" />
                <Text style={styles.helperText}>Buscando producto...</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {showLabelForm ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {mode === "label_fix" ? "Corregir valores con foto de etiqueta" : "Producto no encontrado o incompleto"}
              </Text>

              <InputField
                label="Barcode (opcional)"
                value={barcode}
                onChangeText={(value) => {
                  setBarcode(value);
                  setCorrectionPreview(null);
                }}
                keyboardType="numeric"
                placeholder="EAN/UPC"
              />
              <InputField
                label="Nombre"
                value={labelName}
                onChangeText={(value) => {
                  setLabelName(value);
                  setCorrectionPreview(null);
                }}
              />
              <InputField
                label="Marca"
                value={labelBrand}
                onChangeText={(value) => {
                  setLabelBrand(value);
                  setCorrectionPreview(null);
                }}
              />
              <InputField
                label="Texto etiqueta (opcional)"
                value={labelText}
                onChangeText={(value) => {
                  setLabelText(value);
                  setCorrectionPreview(null);
                }}
              />

              {labelQuestions.map((question) => (
                <Text key={question} style={styles.helperText}>
                  - {question}
                </Text>
              ))}

              <SecondaryButton title="Tomar foto de etiqueta" onPress={() => void captureLabelPhoto()} />
              <Text style={styles.helperText}>{labelPhotos.length} foto(s) adjuntas</Text>

              <PrimaryButton
                title={mode === "label_fix" ? "Analizar corrección" : "Crear producto"}
                onPress={() => void createFromLabel()}
                loading={saving}
              />
              {mode === "label_fix" && correctionPreview ? (
                <AppCard style={styles.previewCard}>
                  <SectionHeader title="Comparación" subtitle={correctionPreview.message} />
                  <Text style={styles.helperText}>
                    Método de análisis: {correctionPreview.analysis_method === "ai_vision" ? "IA visión" : "OCR clásico"}
                  </Text>
                  <Text style={styles.helperText}>
                    kcal actual/detectado: {Math.round(correctionPreview.current.kcal ?? 0)} /{" "}
                    {Math.round(correctionPreview.detected.kcal ?? 0)}
                  </Text>
                  <Text style={styles.helperText}>
                    proteína actual/detectado: {Math.round(correctionPreview.current.protein_g ?? 0)} /{" "}
                    {Math.round(correctionPreview.detected.protein_g ?? 0)} g
                  </Text>
                  <Text style={styles.helperText}>
                    grasas actual/detectado: {Math.round(correctionPreview.current.fat_g ?? 0)} /{" "}
                    {Math.round(correctionPreview.detected.fat_g ?? 0)} g
                  </Text>
                  <Text style={styles.helperText}>
                    carbs actual/detectado: {Math.round(correctionPreview.current.carbs_g ?? 0)} /{" "}
                    {Math.round(correctionPreview.detected.carbs_g ?? 0)} g
                  </Text>
                  {correctionPreview.missing_fields.length ? (
                    <Text style={styles.helperText}>Faltan campos: {correctionPreview.missing_fields.join(", ")}</Text>
                  ) : null}
                  {correctionPreview.warnings?.length
                    ? correctionPreview.warnings.map((warning) => (
                        <Text key={warning} style={styles.helperText}>
                          - {warning}
                        </Text>
                      ))
                    : null}
                  <PrimaryButton
                    title="Confirmar actualización"
                    onPress={() => void confirmCorrection()}
                    disabled={correctionPreview.missing_fields.length > 0}
                    loading={saving}
                  />
                </AppCard>
              ) : null}
              <SecondaryButton title="Volver" onPress={resetToHub} disabled={saving} />
            </View>
          </ScrollView>
        ) : null}

        {mode === "meal_photo" ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Estimar comida por foto</Text>
              <Text style={styles.helperText}>
                Estimación conservadora: kcal/grasas al alza y proteína/fibra a la baja. Revisa el preview y confirma antes de guardar.
              </Text>
              <InputField
                label="Descripción (recomendada)"
                value={mealDescription}
                onChangeText={(value) => {
                  setMealDescription(value);
                  setMealPreview(null);
                }}
                placeholder="Ej: arroz con pollo y mayonesa"
              />
              <InputField
                label="Cantidad aproximada (opcional)"
                value={mealQuantityNote}
                onChangeText={(value) => {
                  setMealQuantityNote(value);
                  setMealPreview(null);
                }}
                placeholder="Ej: 1 plato / 2 cucharadas"
              />

              <Text style={styles.fieldLabel}>Modelo IA</Text>
              <View style={styles.methodRow}>
                {([
                  ["gpt-4o-mini", "4o mini (rápido/barato)"],
                  ["gpt-5.1", "5.1 (más preciso)"],
                  ["auto", "Auto (sugerido)"],
                ] as const).map(([value, label]) => (
                  <Pressable
                    key={value}
                    style={[styles.methodChip, mealModel === value && styles.methodChipActive]}
                    onPress={() => {
                      setMealModel(value);
                      setMealPreview(null);
                      setMealSuggestedModel(null);
                    }}
                  >
                    <Text style={[styles.methodChipText, mealModel === value && styles.methodChipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.helperText}>Usa 5.1 para fotos difíciles o cuando necesites mayor precisión.</Text>
              {mealSuggestedModel && mealModel !== mealSuggestedModel ? (
                <Pressable
                  style={styles.modelSuggestionCard}
                  onPress={() => {
                    setMealModel(mealSuggestedModel);
                    setMealPreview(null);
                  }}
                >
                  <Text style={styles.modelSuggestionTitle}>Confianza baja detectada</Text>
                  <Text style={styles.modelSuggestionText}>Cambiar a {mealSuggestedModel} para mejorar precisión</Text>
                </Pressable>
              ) : null}

              <Text style={styles.fieldLabel}>Tamaño de ración</Text>
              <View style={styles.methodRow}>
                {(["small", "medium", "large"] as const).map((portion) => (
                  <Pressable
                    key={portion}
                    style={[styles.methodChip, mealPortion === portion && styles.methodChipActive]}
                    onPress={() => {
                      setMealPortion(portion);
                      setMealPreview(null);
                    }}
                  >
                    <Text style={[styles.methodChipText, mealPortion === portion && styles.methodChipTextActive]}>
                      {portion === "small" ? "Pequeña" : portion === "medium" ? "Media" : "Grande"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>¿Aceites/salsas añadidas?</Text>
              <View style={styles.methodRow}>
                {([
                  ["unknown", "No sé"],
                  ["yes", "Sí"],
                  ["no", "No"],
                ] as const).map(([value, label]) => (
                  <Pressable
                    key={value}
                    style={[styles.methodChip, mealAddedFat === value && styles.methodChipActive]}
                    onPress={() => {
                      setMealAddedFat(value);
                      setMealPreview(null);
                    }}
                  >
                    <Text style={[styles.methodChipText, mealAddedFat === value && styles.methodChipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              <SecondaryButton title="Tomar foto de comida" onPress={() => void captureMealPhoto()} />
              <Text style={styles.helperText}>{mealPhotos.length} foto(s) adjuntas</Text>

              <PrimaryButton title="Generar preguntas" onPress={() => void runMealQuestions()} loading={saving} />
              <SecondaryButton title="Previsualizar estimación" onPress={() => void runMealPreview()} disabled={saving} />

              {mealIngredients.length > 0 ? (
                <Text style={styles.helperText}>Ingredientes detectados: {mealIngredients.join(", ")}</Text>
              ) : null}
              {mealQuestions.map((question) => (
                <Text key={question} style={styles.helperText}>
                  - {question}
                </Text>
              ))}
              {mealAssumptions.map((assumption) => (
                <Text key={assumption} style={styles.helperText}>
                  · {assumption}
                </Text>
              ))}

              {mealPreview ? (
                <AppCard style={styles.previewCard}>
                  <SectionHeader title="Preview estimado" subtitle={`Confianza: ${mealPreview.confidence_level}`} />
                  <Text style={styles.helperText}>
                    Método: {mealPreview.analysis_method === "ai_vision" ? "IA visión" : "Heurístico"}
                  </Text>
                  <Text style={styles.helperText}>Modelo usado: {mealPreview.model_used}</Text>
                  {mealPreview.suggested_model && mealModel !== mealPreview.suggested_model ? (
                    <Text style={styles.helperText}>Sugerencia: prueba {mealPreview.suggested_model} para más precisión.</Text>
                  ) : null}
                  <View style={styles.previewRow}>
                    <StatPill label="kcal" value={`${Math.round(mealPreview.preview_nutrients.kcal)}`} tone="warning" />
                    <StatPill label="prote" value={`${Math.round(mealPreview.preview_nutrients.protein_g)} g`} />
                    <StatPill label="carbs" value={`${Math.round(mealPreview.preview_nutrients.carbs_g)} g`} tone="warning" />
                    <StatPill label="grasas" value={`${Math.round(mealPreview.preview_nutrients.fat_g)} g`} tone="danger" />
                  </View>
                  <View style={styles.portionQuickRow}>
                    <Pressable style={styles.portionQuickChip} onPress={() => void runMealPreview(-10)}>
                      <Text style={styles.portionQuickChipText}>-10%</Text>
                    </Pressable>
                    <Pressable style={styles.portionQuickChip} onPress={() => void runMealPreview(0)}>
                      <Text style={styles.portionQuickChipText}>Aceptar</Text>
                    </Pressable>
                    <Pressable style={styles.portionQuickChip} onPress={() => void runMealPreview(10)}>
                      <Text style={styles.portionQuickChipText}>+10%</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.helperText}>Ajuste actual: {mealAdjust > 0 ? `+${mealAdjust}` : mealAdjust}%</Text>
                  <PrimaryButton title="Guardar estimación" onPress={() => void saveMealEstimate()} loading={saving} />
                </AppCard>
              ) : null}

              <SecondaryButton title="Volver" onPress={resetToHub} disabled={saving} />
            </View>
          </ScrollView>
        ) : null}

        {mode === "manual" ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Añadir manualmente / Comunidad</Text>
              <InputField
                label="Buscar alimento (nombre/marca/barcode)"
                value={manualSearch}
                onChangeText={setManualSearch}
                placeholder="Ej: yogur proteico"
              />
              <PrimaryButton title="Buscar alimentos" onPress={() => void searchManualFoods()} loading={searchingFoods} />
              {manualResults.length ? (
                <View style={styles.searchResultsWrap}>
                  {manualResults.map((item) => (
                    <Pressable
                      key={`${item.product.id}-${item.badge}`}
                      style={styles.searchResultRow}
                      onPress={() => selectManualResult(item)}
                    >
                      <View style={styles.searchResultTextWrap}>
                        <Text style={styles.searchResultTitle}>{item.product.name}</Text>
                        <Text style={styles.searchResultSubtitle}>
                          {item.product.brand ?? "Sin marca"} · {item.product.kcal} kcal
                        </Text>
                      </View>
                      <TagChip label={item.badge} />
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <SectionHeader title="Crear y compartir alimento" subtitle="Se publica para búsquedas de otros usuarios" />
              <InputField label="Nombre" value={manualName} onChangeText={setManualName} placeholder="Producto manual" />
              <InputField label="Marca (opcional)" value={manualBrand} onChangeText={setManualBrand} />
              <InputField
                label="Barcode opcional"
                value={manualBarcode}
                onChangeText={setManualBarcode}
                keyboardType="numeric"
                placeholder="EAN/UPC"
              />
              <InputField
                label="URL foto (opcional)"
                value={manualImageUrl}
                onChangeText={setManualImageUrl}
                autoCapitalize="none"
                placeholder="https://..."
              />
              <InputField label="Kcal por 100 g" value={manualKcal} onChangeText={setManualKcal} keyboardType="numeric" />
              <InputField
                label="Proteína por 100 g"
                value={manualProtein}
                onChangeText={setManualProtein}
                keyboardType="numeric"
              />
              <InputField label="Grasa por 100 g" value={manualFat} onChangeText={setManualFat} keyboardType="numeric" />
              <InputField label="Carbs por 100 g" value={manualCarbs} onChangeText={setManualCarbs} keyboardType="numeric" />
              <PrimaryButton title="Guardar y compartir" onPress={() => void saveManualProduct()} loading={saving} />
              <SecondaryButton title="Volver" onPress={resetToHub} disabled={saving} />
            </View>
          </ScrollView>
        ) : null}

        {mode === "barcode" && phase === "quantity" && product ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{product.name}</Text>
              <Text style={styles.helperText}>Marca: {product.brand ?? "-"}</Text>
              {product.image_url ? (
                <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="contain" />
              ) : (
                <View style={styles.productImagePlaceholder}>
                  <Text style={styles.helperText}>Sin foto disponible para este producto</Text>
                </View>
              )}
              <Text style={styles.helperText}>
                {product.kcal} kcal | P {product.protein_g} | G {product.fat_g} | C {product.carbs_g} ({product.nutrition_basis})
              </Text>
              {productQuality ? (
                <>
                  <TagChip
                    label={`Calidad: ${productQuality.label}`}
                    tone={
                      productQuality.status === "verified"
                        ? "accent"
                        : productQuality.status === "estimated"
                          ? "warning"
                          : "default"
                    }
                  />
                  <Text style={styles.helperText}>{productQuality.message}</Text>
                </>
              ) : null}

              <QuantityMethodSelector method={method} onChange={setMethod} product={product} />

              {method === "grams" ? (
                <View style={styles.sliderWrap}>
                  <Text style={styles.sliderLabel}>{Math.round(grams)} g</Text>
                  <Slider
                    minimumValue={5}
                    maximumValue={500}
                    step={5}
                    value={grams}
                    onValueChange={setGrams}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  <TextInput
                    value={String(Math.round(grams))}
                    onChangeText={(value) => {
                      const parsed = Number(value);
                      if (Number.isFinite(parsed)) {
                        setGrams(clamp(parsed, 1, 2000));
                      }
                    }}
                    keyboardType="numeric"
                    style={styles.quantityInput}
                  />
                </View>
              ) : null}

              {method === "units" ? (
                <View style={styles.sliderWrap}>
                  <Text style={styles.sliderLabel}>{units.toFixed(1)} porciones</Text>
                  <View style={styles.portionQuickRow}>
                    {[0.5, 1, 1.5, 2].map((multiplier) => (
                      <Pressable
                        key={multiplier}
                        style={styles.portionQuickChip}
                        onPress={() => setUnits(clamp(multiplier, 0.25, 12))}
                      >
                        <Text style={styles.portionQuickChipText}>{multiplier}x</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Slider
                    minimumValue={0.25}
                    maximumValue={12}
                    step={0.25}
                    value={units}
                    onValueChange={setUnits}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  <TextInput
                    value={String(units)}
                    onChangeText={(value) => {
                      const parsed = Number(value);
                      if (Number.isFinite(parsed)) {
                        setUnits(clamp(parsed, 0.25, 12));
                      }
                    }}
                    keyboardType="numeric"
                    style={styles.quantityInput}
                  />
                  <Text style={styles.helperText}>serving_size_g: {product.serving_size_g ?? "N/A"}</Text>
                </View>
              ) : null}

              {method === "percent_pack" ? (
                <View style={styles.sliderWrap}>
                  <Text style={styles.sliderLabel}>{Math.round(percentPack)}% paquete</Text>
                  <Slider
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={percentPack}
                    onValueChange={setPercentPack}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  <TextInput
                    value={String(Math.round(percentPack))}
                    onChangeText={(value) => {
                      const parsed = Number(value);
                      if (Number.isFinite(parsed)) {
                        setPercentPack(clamp(parsed, 0, 100));
                      }
                    }}
                    keyboardType="numeric"
                    style={styles.quantityInput}
                  />
                  <Text style={styles.helperText}>net_weight_g: {product.net_weight_g ?? "N/A"}</Text>
                </View>
              ) : null}

              <AppCard style={styles.previewCard}>
                <SectionHeader title="Preview nutricional" subtitle={`${Math.round(resolvedQuantityG)} g equivalentes`} />
                {previewNutrients ? (
                  <View style={styles.previewRow}>
                    <StatPill label="kcal" value={String(previewNutrients.kcal)} tone="accent" />
                    <StatPill label="prote" value={`${previewNutrients.protein} g`} />
                    <StatPill label="carbs" value={`${previewNutrients.carbs} g`} tone="warning" />
                    <StatPill label="grasas" value={`${previewNutrients.fats} g`} tone="danger" />
                  </View>
                ) : (
                  <Text style={styles.helperText}>Sin datos para este método/cantidad.</Text>
                )}
              </AppCard>

              <PrimaryButton title="Guardar consumo" onPress={() => void saveIntake()} loading={saving} />
              {preferredServing ? (
                <SecondaryButton
                  title="Guardar con última cantidad usada"
                  onPress={() => void saveWithPreferredQuantity()}
                  disabled={saving}
                />
              ) : null}
              <SecondaryButton title="Corregir valores con foto de etiqueta" onPress={openCorrectionFromProduct} disabled={saving} />
              <SecondaryButton title="Escanear otro" onPress={() => void startBarcodeFlow()} disabled={saving} />
              <SecondaryButton title="Volver a Añadir" onPress={resetToHub} disabled={saving} />
            </View>
          </ScrollView>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function MainAppTabs() {
  const [tab, setTab] = useState<MainTab>("dashboard");

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.flex1}>
        {tab === "dashboard" ? (
          <DashboardScreen onOpenBodyProgress={() => setTab("body")} onOpenAdd={() => setTab("add")} />
        ) : null}
        {tab === "add" ? <AddScreen /> : null}
        {tab === "body" ? <BodyProgressScreen /> : null}
        {tab === "history" ? <HistoryScreen /> : null}
        {tab === "settings" ? <SettingsScreen /> : null}
      </View>

      <View style={styles.tabBar}>
        {([
          ["dashboard", "Dashboard"],
          ["add", "Añadir"],
          ["body", "Body"],
          ["history", "History"],
          ["settings", "Settings"],
        ] as Array<[MainTab, string]>).map(([value, label]) => {
          const active = tab === value;
          return (
            <Pressable key={value} onPress={() => setTab(value)} style={[styles.tabItem, active && styles.tabItemActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function RootNavigator() {
  const auth = useAuth();

  if (auth.loading) {
    return <LoadingGate />;
  }

  if (!auth.user && !auth.pendingVerificationEmail) {
    return <AuthStack />;
  }

  if ((auth.user && !auth.user.email_verified) || auth.pendingVerificationEmail) {
    return <VerifyEmailOnlyScreen />;
  }

  if (auth.user && auth.user.email_verified && !auth.user.onboarding_completed) {
    return <OnboardingWizard />;
  }

  return <MainAppTabs />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  headerWrap: {
    gap: 6,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  authScroll: {
    padding: 20,
    gap: 14,
  },
  brandCard: {
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    gap: 12,
  },
  brandEyebrow: {
    color: theme.accent,
    fontWeight: "700",
    letterSpacing: 1.8,
    fontSize: 12,
  },
  brandTitle: {
    color: theme.text,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 34,
  },
  brandText: {
    color: theme.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    backgroundColor: theme.panelSoft,
  },
  primaryButton: {
    backgroundColor: theme.accent,
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#050505",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panelSoft,
  },
  secondaryButtonText: {
    color: theme.text,
    fontWeight: "600",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  helperText: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  devHint: {
    color: theme.warning,
    fontSize: 12,
    fontWeight: "700",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.panelSoft,
  },
  chipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  chipText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: theme.text,
  },
  appCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    padding: 18,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionHeaderWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  sectionHeaderTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
  },
  sectionHeaderSubtitle: {
    color: theme.muted,
    fontSize: 12,
  },
  sectionHeaderAction: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sectionHeaderActionText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  statPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 2,
  },
  statPillDefault: {
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
  },
  statPillAccent: {
    borderColor: "#525252",
    backgroundColor: "#252525",
  },
  statPillWarning: {
    borderColor: theme.warning,
    backgroundColor: "rgba(241,208,142,0.12)",
  },
  statPillDanger: {
    borderColor: theme.danger,
    backgroundColor: "rgba(244,143,143,0.12)",
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  tagChipDefault: {
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
  },
  tagChipAccent: {
    borderColor: "#4a4a4a",
    backgroundColor: "#232323",
  },
  tagChipWarning: {
    borderColor: theme.warning,
    backgroundColor: "rgba(241,208,142,0.1)",
  },
  tagChipDanger: {
    borderColor: theme.danger,
    backgroundColor: "rgba(244,143,143,0.1)",
  },
  tagChipLabel: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  statRow: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  statRowLabel: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  statRowValue: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  statPillLabel: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statPillValue: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: theme.panelSoft,
    borderWidth: 1,
    borderColor: "#3e3e3e",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
  },
  emptyStateCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateTitle: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 15,
  },
  emptyStateSubtitle: {
    color: theme.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  sectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    padding: 18,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  metricCard: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  metricTitle: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  metricValue: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "700",
  },
  metricBadge: {
    fontSize: 13,
    fontWeight: "700",
  },
  bmiTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
  },
  bmiBand: {
    flex: 1,
  },
  bmiPointer: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  recoBox: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.panelSoft,
  },
  recoTitle: {
    color: theme.text,
    fontWeight: "700",
    marginBottom: 6,
  },
  feedbackBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.ok,
    padding: 12,
    backgroundColor: "rgba(112,227,159,0.08)",
    gap: 6,
  },
  feedbackBoxWarning: {
    borderColor: theme.warning,
    backgroundColor: "rgba(255,199,120,0.08)",
  },
  feedbackTitle: {
    color: theme.text,
    fontWeight: "700",
  },
  feedbackLine: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  mainScroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 90,
  },
  dashboardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dashboardHeaderLeft: {
    flex: 1,
  },
  dashboardGreeting: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  dashboardDate: {
    color: theme.muted,
    fontSize: 13,
    marginTop: 2,
  },
  quickWeightBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickWeightBtnText: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 20,
    marginTop: -1,
  },
  heroCard: {
    gap: 10,
  },
  heroCardExceeded: {
    borderColor: theme.danger,
  },
  heroRemainingValue: {
    color: theme.text,
    fontSize: 48,
    fontWeight: "800",
    lineHeight: 52,
  },
  heroRemainingSub: {
    color: theme.muted,
    fontSize: 13,
  },
  heroProgressTrack: {
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    overflow: "hidden",
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  heroPillsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  quickActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickActionBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.panelSoft,
  },
  quickActionBtnText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  macroToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  macroToggleChip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  macroToggleChipActive: {
    borderColor: "#525252",
    backgroundColor: "#252525",
  },
  macroToggleText: {
    color: theme.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  macroToggleTextActive: {
    color: theme.text,
  },
  bodyPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bodyPageHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  bodyPageTitle: {
    color: theme.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  bodyPageSubtitle: {
    color: theme.muted,
    fontSize: 13,
  },
  bodyHeaderActionBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bodyHeaderActionText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  bodyQuickWeightRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  bodyQuickWeightInputWrap: {
    flex: 1,
    minWidth: 160,
  },
  bodyQuickWeightActions: {
    gap: 8,
  },
  bodySummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bodyLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bodyLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.panelSoft,
  },
  bodyLegendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  bodyLegendLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  barsList: {
    gap: 8,
  },
  bodyStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricTileRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  metricTile: {
    minWidth: 92,
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: theme.panelSoft,
    gap: 3,
  },
  metricTileLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  metricTileValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  metricTileSubtitle: {
    color: theme.muted,
    fontSize: 11,
  },
  weightChartWrap: {
    minHeight: 126,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.panelSoft,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  weightBarCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  weightBar: {
    width: "90%",
    borderRadius: 6,
    backgroundColor: theme.accent,
    minHeight: 10,
  },
  bodyFatBar: {
    width: "90%",
    borderRadius: 6,
    backgroundColor: theme.fats,
    minHeight: 10,
  },
  weightBarLabel: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  bodyAvatarWrap: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  bodyAvatarCaption: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  bodyRecordRow: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  bodyRecordTitle: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 14,
  },
  bodyRecordMeta: {
    color: theme.muted,
    fontSize: 11,
    marginTop: 2,
  },
  bodyRecordNote: {
    color: theme.muted,
    fontSize: 12,
    flexShrink: 1,
    textAlign: "right",
  },
  bodyMeasurementSummary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    padding: 10,
    gap: 4,
  },
  bodyMeasurementSummaryTitle: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 12,
  },
  bodyMeasurementSummaryLine: {
    color: theme.muted,
    fontSize: 11,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  metricProgressRow: {
    gap: 6,
  },
  metricProgressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricProgressLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  metricProgressValue: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  metricProgressTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.panelSoft,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  metricProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  ringCard: {
    width: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
  },
  ringCenter: {
    position: "absolute",
    top: 38,
    alignItems: "center",
    width: "100%",
  },
  ringLabel: {
    color: theme.muted,
    fontSize: 12,
  },
  ringValue: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "700",
  },
  ringUnit: {
    color: theme.muted,
    fontSize: 11,
  },
  ringFoot: {
    color: theme.muted,
    fontSize: 12,
    marginTop: -8,
  },
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenterBox: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  donutCenterTitle: {
    color: theme.muted,
    fontSize: 12,
  },
  donutCenterSub: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 16,
  },
  legendWrap: {
    gap: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: theme.muted,
    fontSize: 13,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panelSoft,
  },
  calendarNavText: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 16,
  },
  weekDaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekDayLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  calendarCell: {
    width: "13.2%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panelSoft,
  },
  calendarCellActive: {
    borderColor: "#4d4d4d",
    backgroundColor: "#252525",
  },
  calendarCellText: {
    color: theme.text,
    fontWeight: "600",
    fontSize: 12,
  },
  calendarCellTextActive: {
    color: theme.text,
  },
  calendarDot: {
    marginTop: 4,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#fafafa",
  },
  calendarCellEmpty: {
    width: "13.2%",
    aspectRatio: 1,
  },
  intakeRow: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.panelSoft,
    gap: 10,
  },
  intakeTimeDotWrap: {
    width: 64,
    alignItems: "flex-start",
    gap: 4,
  },
  intakeTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  intakeMain: {
    flex: 1,
    gap: 2,
  },
  intakeName: {
    color: theme.text,
    fontWeight: "600",
    fontSize: 14,
  },
  intakeMeta: {
    color: theme.muted,
    fontSize: 12,
  },
  intakeKcal: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 13,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: "#fafafa",
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  historyFilterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  historyFilterChip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  historyFilterChipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  historyFilterText: {
    color: theme.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  historyFilterTextActive: {
    color: theme.text,
  },
  historyDayCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: theme.panelSoft,
    gap: 4,
  },
  historyDayHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  historyIntakeRow: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.panelSoft,
    gap: 2,
  },
  historyDate: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 13,
  },
  historyValue: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  addHubPane: {
    gap: 12,
    paddingBottom: 100,
  },
  addActionCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: theme.panel,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6,
  },
  addActionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
  },
  addActionSubtitle: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  scanContainer: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  scanCameraWrap: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
  },
  cameraView: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: "82%",
    height: 160,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.12)",
    position: "relative",
  },
  scanCorner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "#ffffff",
  },
  scanCornerTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  scanCornerTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  scanCornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  scanCornerBottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  scanHint: {
    marginTop: 12,
    color: theme.text,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  scanSuccessBadge: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ffffff",
    backgroundColor: "#272727",
  },
  scanSuccessBadgeText: {
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 1,
  },
  scanBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,7,13,0.68)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  scanPane: {
    paddingBottom: 100,
    gap: 12,
  },
  searchResultsWrap: {
    marginTop: 2,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.panelSoft,
  },
  searchResultTextWrap: {
    flex: 1,
    gap: 3,
  },
  searchResultTitle: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 14,
  },
  searchResultSubtitle: {
    color: theme.muted,
    fontSize: 12,
  },
  productImage: {
    width: "100%",
    height: 180,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: "#090d16",
  },
  productImagePlaceholder: {
    width: "100%",
    height: 120,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  methodRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  methodChip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.panelSoft,
  },
  methodChipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  methodChipDisabled: {
    opacity: 0.45,
  },
  methodChipText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  methodChipTextActive: {
    color: theme.text,
  },
  modelSuggestionCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  modelSuggestionTitle: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  modelSuggestionText: {
    color: theme.muted,
    fontSize: 12,
  },
  sliderWrap: {
    gap: 8,
  },
  sliderLabel: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 15,
  },
  quantityInput: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    borderRadius: 12,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  portionQuickRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  portionQuickChip: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  portionQuickChipText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  previewCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.panelMuted,
    borderColor: theme.border,
  },
  previewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: "row",
    backgroundColor: theme.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 6,
    gap: 6,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemActive: {
    backgroundColor: "#252525",
  },
  tabText: {
    color: theme.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  tabTextActive: {
    color: theme.text,
  },
});
