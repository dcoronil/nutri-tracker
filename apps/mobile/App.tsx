import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
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
  Share,
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
import Svg, { Circle, G, Line, Path, Rect, SvgXml } from "react-native-svg";

import { BodyAvatarSvg } from "./components/BodyAvatarSvg";

type NutritionBasis = "per_100g" | "per_100ml" | "per_serving";
type LookupSource = "local" | "openfoodfacts_imported" | "openfoodfacts_incomplete" | "not_found";
type IntakeMethod = "grams" | "percent_pack" | "units";
type Sex = "male" | "female" | "other";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "athlete";
type GoalType = "lose" | "maintain" | "gain";
type MainTab = "dashboard" | "add" | "body" | "history" | "settings";
type AddMode = "hub" | "barcode" | "label_fix" | "meal_photo" | "manual";
type QuickAddAction = Exclude<AddMode, "hub">;
type AddLaunchAction = {
  requestId: number;
  action: QuickAddAction;
};
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
  weekly_weight_goal_kg: number | null;
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
  goal_type: GoalType | null;
  weekly_weight_goal_kg: number | null;
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

type MealEstimateQuestion = {
  id: string;
  prompt: string;
  answer_type: "single_choice" | "number" | "text";
  options: string[];
  placeholder: string | null;
};

type MealEstimateQuestionsResponse = {
  model_used: "gpt-4o-mini";
  questions: string[];
  question_items: MealEstimateQuestion[];
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
  origin: "local" | "openfoodfacts_remote";
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
  model_used: "gpt-4o-mini";
  confidence_level: "high" | "medium" | "low";
  analysis_method?: "ai_vision" | "heuristic";
  assumptions: string[];
  questions: string[];
  question_items: MealEstimateQuestion[];
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
  water_ml: number;
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
  suggested_kcal_adjustment: number | null;
  weekly_weight_goal_kg: number | null;
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
  weekly_weight_goal_kg: number | null;
  waist_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
};

type WaterLog = {
  id: number;
  ml: number;
  created_at: string;
};

type FavoriteProduct = {
  product: Product;
  created_at: string;
};

type RepeatIntakesResponse = {
  copied: number;
  from_day: string;
  to_day: string;
};

type WidgetTodaySummary = {
  date: string;
  kcal_remaining: number;
  protein_consumed_g: number;
  protein_goal_g: number;
  water_ml: number;
  latest_weight_kg: number | null;
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
  fetchWidgetTodaySummary: () => Promise<WidgetTodaySummary>;
  createWaterLog: (payload: { ml: number; created_at?: string }) => Promise<WaterLog>;
  fetchWaterLogs: (input?: { day?: string; limit?: number }) => Promise<WaterLog[]>;
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
    description?: string;
    portionSize?: "small" | "medium" | "large";
    hasAddedFats?: boolean;
    quantityNote?: string;
    photos: string[];
  }) => Promise<MealEstimateQuestionsResponse>;
  mealPhotoEstimateCalculate: (input: {
    description?: string;
    answers?: Record<string, string>;
    portionSize?: "small" | "medium" | "large";
    hasAddedFats?: boolean;
    quantityNote?: string;
    photos: string[];
    adjustPercent?: number;
    commit?: boolean;
  }) => Promise<MealPhotoEstimateResponse>;
  mealPhotoEstimate: (input: {
    description?: string;
    answers?: Record<string, string>;
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
  deleteIntake: (intakeId: number) => Promise<void>;
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
  fetchFavoriteProducts: (limit?: number) => Promise<FavoriteProduct[]>;
  addFavoriteProduct: (productId: number) => Promise<void>;
  removeFavoriteProduct: (productId: number) => Promise<void>;
  repeatIntakesFromDay: (fromDay: string, toDay?: string) => Promise<RepeatIntakesResponse>;
  setApiBaseUrl: (url: string) => void;
  checkHealth: (url?: string) => Promise<boolean>;
};

type Segment = {
  label: string;
  value: number;
  color: string;
};

const TOKEN_STORAGE_KEY = "nutri_tracker_access_token";
const DEV_SETTINGS_MODE = (process.env.EXPO_PUBLIC_DEV_SETTINGS ?? "false").toLowerCase() === "true";
const CALENDAR_LEFT_ARROW_PATH =
  "M98.44,0H24.44C17.75,0,11.67,2.75,7.24,7.17C2.77,11.64,0,17.82,0,24.62v67.35c0,6.8,2.78,12.98,7.25,17.45 c4.42,4.42,10.51,7.17,17.19,7.17h74.01c6.68,0,12.77-2.75,17.19-7.17c4.47-4.47,7.24-10.65,7.24-17.45V24.62 c0-6.81-2.77-12.99-7.24-17.45C111.21,2.75,105.13,0,98.44,0L98.44,0z M50.64,46.95h28.33c0.85,0,1.62,0.34,2.17,0.9 c0.56,0.56,0.9,1.33,0.9,2.17c0,0.85-0.34,1.62-0.9,2.17c-0.56,0.56-1.32,0.9-2.17,0.9H50.64l9.53,10.92 c0.55,0.63,0.8,1.43,0.76,2.21c-0.05,0.79-0.39,1.55-1.02,2.12c-0.63,0.56-1.43,0.81-2.21,0.77c-0.78-0.05-1.54-0.39-2.1-1.02 l-14-16.04c-0.52-0.59-0.77-1.33-0.77-2.06c0.01-0.73,0.28-1.46,0.8-2.02l14-16.03c0.56-0.61,1.31-0.95,2.08-1 c0.78-0.05,1.57,0.21,2.2,0.77l0.02,0.02c0.62,0.56,0.95,1.32,1,2.09v0.01c0.04,0.78-0.21,1.58-0.77,2.21L50.64,46.95L50.64,46.95z M117.95,82.85c-0.85,3.45-2.55,6.55-4.83,9.01c-3.36,3.62-7.99,5.87-13.1,5.87H22.85c-0.21,0-0.41,0-0.62-0.01l-1.25-0.09 c-4.36-0.47-8.29-2.6-11.23-5.77c-2.28-2.46-3.97-5.55-4.83-9V24.62c0-5.28,2.17-10.09,5.67-13.58C14.14,7.5,19.04,5.3,24.44,5.3 h74.01c5.4,0,10.3,2.2,13.84,5.74c3.49,3.49,5.66,8.3,5.66,13.58V82.85L117.95,82.85z";
const CALENDAR_RIGHT_ARROW_PATH =
  "M24.44,0h74.01c6.68,0,12.77,2.75,17.19,7.17c4.47,4.47,7.24,10.65,7.24,17.45v67.35c0,6.8-2.78,12.98-7.25,17.45 c-4.42,4.42-10.51,7.17-17.19,7.17H24.44c-6.68,0-12.77-2.75-17.19-7.17C2.77,104.96,0,98.78,0,91.98V24.62 c0-6.81,2.77-12.99,7.24-17.45C11.67,2.75,17.75,0,24.44,0L24.44,0z M72.24,46.95H43.9c-0.85,0-1.62,0.34-2.17,0.9 c-0.56,0.56-0.9,1.33-0.9,2.17c0,0.85,0.34,1.62,0.9,2.17c0.56,0.56,1.32,0.9,2.17,0.9h28.33L62.7,64.01 c-0.55,0.63-0.8,1.43-0.76,2.21c0.05,0.79,0.39,1.55,1.02,2.12c0.63,0.56,1.43,0.81,2.21,0.77c0.78-0.05,1.54-0.39,2.1-1.02 l14-16.04c0.52-0.59,0.77-1.33,0.77-2.06c-0.01-0.73-0.28-1.46-0.8-2.02l-14-16.03c-0.56-0.61-1.31-0.95-2.08-1 c-0.78-0.05-1.57,0.21-2.2,0.77l-0.02,0.02c-0.62,0.56-0.95,1.32-1,2.09v0.01c-0.04,0.78,0.21,1.58,0.77,2.21L72.24,46.95 L72.24,46.95z M4.93,82.85c0.85,3.45,2.55,6.55,4.83,9.01c3.36,3.62,7.99,5.87,13.1,5.87h77.17c0.21,0,0.41,0,0.62-0.01l1.25-0.09 c4.36-0.47,8.29-2.6,11.23-5.77c2.28-2.46,3.97-5.55,4.83-9V24.62c0-5.28-2.17-10.09-5.67-13.58c-3.54-3.54-8.44-5.74-13.84-5.74 H24.44c-5.4,0-10.3,2.2-13.84,5.74c-3.49,3.49-5.66,8.3-5.66,13.58V82.85L4.93,82.85z";
const STREAK_FLAME_SVG_XML =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92.27 122.88"><g><path fill="#EC6F59" fill-rule="evenodd" clip-rule="evenodd" d="M18.61,54.89C15.7,28.8,30.94,10.45,59.52,0C42.02,22.71,74.44,47.31,76.23,70.89c4.19-7.15,6.57-16.69,7.04-29.45c21.43,33.62,3.66,88.57-43.5,80.67c-4.33-0.72-8.5-2.09-12.3-4.13C10.27,108.8,0,88.79,0,69.68C0,57.5,5.21,46.63,11.95,37.99C12.85,46.45,14.77,52.76,18.61,54.89L18.61,54.89z"/><path fill="#FAD15C" fill-rule="evenodd" clip-rule="evenodd" d="M33.87,92.58c-4.86-12.55-4.19-32.82,9.42-39.93c0.1,23.3,23.05,26.27,18.8,51.14c3.92-4.44,5.9-11.54,6.25-17.15c6.22,14.24,1.34,25.63-7.53,31.43c-26.97,17.64-50.19-18.12-34.75-37.72C26.53,84.73,31.89,91.49,33.87,92.58L33.87,92.58z"/></g></svg>';
const theme = {
  bg: "#050505",
  bgElevated: "#0b0b0c",
  panel: "#101010",
  panelSoft: "#171717",
  panelMuted: "#1d1d1f",
  border: "#262626",
  text: "#F5F5F5",
  muted: "#A1A1AA",
  accent: "#F5F5F5",
  accentSoft: "#222225",
  danger: "#D17A7A",
  warning: "#D4A24C",
  ok: "#6EE7B7",
  info: "#7AA2E3",
  protein: "#60A5FA",
  carbs: "#f59e0b",
  fats: "#EC4899",
  kcal: "#2DD4BF",
  fiber: "#86EFAC",
  water: "#7DD3FC",
  bmiUnderweight: "#86A6CF",
  bmiNormal: "#6EE7B7",
  bmiOverweight: "#D4A24C",
  bmiObesity: "#D17A7A",
  blue: "#C3C8D1",
  yellow: "#E2D3B0",
  red: "#D9A2A2",
};

const type = {
  display: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: "800" as const,
    letterSpacing: -0.7,
  },
  h1: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800" as const,
    letterSpacing: -0.4,
  },
  h2: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800" as const,
    letterSpacing: -0.2,
  },
  h3: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700" as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500" as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
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
    return "Ha ocurrido un error inesperado.";
  }

  const message = error.message;

  if (message.includes("Network request failed")) {
    return "No se pudo conectar con el servidor. Revisa tu red y que el backend esté encendido.";
  }
  if (message.includes("Invalid verification code")) {
    return "El código de verificación no es correcto.";
  }
  if (message.includes("Verification code expired")) {
    return "El código ha caducado. Solicita uno nuevo.";
  }
  if (message.includes("Too many") || message.includes("Demasiadas solicitudes") || message.includes("429")) {
    return "Hay demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.";
  }
  if (message.includes("Product not found")) {
    return "No encontramos ese producto. Puedes crearlo manualmente o subir etiqueta.";
  }
  if (message.includes("Invalid email")) {
    return "El email no tiene un formato válido.";
  }
  if (message.includes("pending verification")) {
    return "Ese email aún no está verificado. Completa primero la verificación del código.";
  }

  return message;
}

function stringifyErrorDetail(detail: unknown): string | null {
  if (detail === null || detail === undefined) {
    return null;
  }
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed || null;
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }
  if (Array.isArray(detail)) {
    const pieces = detail
      .map((item) => stringifyErrorDetail(item))
      .filter((item): item is string => Boolean(item));
    if (pieces.length > 0) {
      return pieces.join(" | ");
    }
    return null;
  }
  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const fromMsg = stringifyErrorDetail(record.msg);
    if (fromMsg) {
      return fromMsg;
    }
    const fromMessage = stringifyErrorDetail(record.message);
    if (fromMessage) {
      return fromMessage;
    }
    const fromDetail = stringifyErrorDetail(record.detail);
    if (fromDetail) {
      return fromDetail;
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return "Error de servidor no legible.";
    }
  }
  return null;
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

function evaluatePasswordStrength(password: string): {
  label: string;
  color: string;
  progress: number;
  isStrongEnough: boolean;
} {
  if (!password) {
    return {
      label: "Empieza a escribir una contraseña",
      color: theme.muted,
      progress: 0,
      isStrongEnough: false,
    };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const categories = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
  const longEnough = password.length >= 8;
  const strongLength = password.length >= 12;

  if (!longEnough || categories <= 1) {
    return {
      label: "Contraseña poco segura",
      color: theme.danger,
      progress: 34,
      isStrongEnough: false,
    };
  }

  if (!strongLength || categories <= 2) {
    return {
      label: "Contraseña débil",
      color: theme.warning,
      progress: 67,
      isStrongEnough: true,
    };
  }

  return {
    label: "Contraseña segura",
    color: theme.ok,
    progress: 100,
    isStrongEnough: true,
  };
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
        const rawDetail = typeof body === "object" && body !== null ? (body as { detail?: unknown; message?: unknown }).detail ?? (body as { message?: unknown }).message : body;
        const detail = stringifyErrorDetail(rawDetail);
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

  const fetchWidgetTodaySummary = useCallback(
    async (): Promise<WidgetTodaySummary> => request<WidgetTodaySummary>("/widget/summary/today"),
    [request],
  );

  const createWaterLog = useCallback(
    async (payload: { ml: number; created_at?: string }): Promise<WaterLog> => {
      return request<WaterLog>("/water/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    [request],
  );

  const fetchWaterLogs = useCallback(
    async (input?: { day?: string; limit?: number }): Promise<WaterLog[]> => {
      const params = new URLSearchParams();
      if (input?.day) {
        params.set("day", input.day);
      }
      if (input?.limit) {
        params.set("limit", String(input.limit));
      }
      const suffix = params.size ? `?${params.toString()}` : "";
      return request<WaterLog[]>(`/water/logs${suffix}`);
    },
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
      description?: string;
      portionSize?: "small" | "medium" | "large";
      hasAddedFats?: boolean;
      quantityNote?: string;
      photos: string[];
    }): Promise<MealEstimateQuestionsResponse> => {
      const form = new FormData();
      form.append("description", input.description?.trim() ?? "");
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

  const mealPhotoEstimateCalculate = useCallback(
    async (input: {
      description?: string;
      answers?: Record<string, string>;
      portionSize?: "small" | "medium" | "large";
      hasAddedFats?: boolean;
      quantityNote?: string;
      photos: string[];
      adjustPercent?: number;
      commit?: boolean;
    }): Promise<MealPhotoEstimateResponse> => {
      const form = new FormData();
      form.append("description", input.description?.trim() ?? "");
      if (input.answers && Object.keys(input.answers).length > 0) {
        form.append("answers_json", JSON.stringify(input.answers));
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
      return request<MealPhotoEstimateResponse>("/meal-photo-estimate/calculate", {
        method: "POST",
        body: form,
      });
    },
    [request],
  );

  const mealPhotoEstimate = useCallback(
    async (input: {
      description?: string;
      answers?: Record<string, string>;
      portionSize?: "small" | "medium" | "large";
      hasAddedFats?: boolean;
      quantityNote?: string;
      photos: string[];
      adjustPercent?: number;
      commit?: boolean;
    }): Promise<MealPhotoEstimateResponse> => {
      const form = new FormData();
      form.append("description", input.description?.trim() ?? "");
      if (input.answers && Object.keys(input.answers).length > 0) {
        form.append("answers_json", JSON.stringify(input.answers));
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

  const deleteIntake = useCallback(
    async (intakeId: number): Promise<void> => {
      await request<{ deleted: boolean; intake_id: number }>(`/intakes/${intakeId}`, {
        method: "DELETE",
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

  const fetchFavoriteProducts = useCallback(
    async (limit = 60): Promise<FavoriteProduct[]> => request<FavoriteProduct[]>(`/favorites/products?limit=${limit}`),
    [request],
  );

  const addFavoriteProduct = useCallback(
    async (productId: number): Promise<void> => {
      await request<{ favorited: boolean; product_id: number }>(`/favorites/products/${productId}`, {
        method: "POST",
      });
    },
    [request],
  );

  const removeFavoriteProduct = useCallback(
    async (productId: number): Promise<void> => {
      await request<{ favorited: boolean; product_id: number }>(`/favorites/products/${productId}`, {
        method: "DELETE",
      });
    },
    [request],
  );

  const repeatIntakesFromDay = useCallback(
    async (fromDay: string, toDay?: string): Promise<RepeatIntakesResponse> => {
      const suffix = toDay ? `?to_day=${encodeURIComponent(toDay)}` : "";
      return request<RepeatIntakesResponse>(`/intakes/repeat-from-day/${fromDay}${suffix}`, {
        method: "POST",
      });
    },
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
      fetchWidgetTodaySummary,
      createWaterLog,
      fetchWaterLogs,
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
      mealPhotoEstimateCalculate,
      mealPhotoEstimate,
      createIntake,
      deleteIntake,
      fetchBodySummary,
      fetchWeightLogs,
      createWeightLog,
      fetchMeasurementLogs,
      createMeasurementLog,
      fetchFavoriteProducts,
      addFavoriteProduct,
      removeFavoriteProduct,
      repeatIntakesFromDay,
      setApiBaseUrl: (url: string) => setApiBaseUrl(normalizeBaseUrl(url)),
      checkHealth,
    }),
    [
      apiBaseUrl,
      checkHealth,
      clearPendingVerification,
      createIntake,
      deleteIntake,
      createMeasurementLog,
      createWeightLog,
      addFavoriteProduct,
      createWaterLog,
      createProductFromLabel,
      correctProductFromLabel,
      mealEstimateQuestions,
      mealPhotoEstimateCalculate,
      mealPhotoEstimate,
      saveUserAIKey,
      testUserAIKey,
      deleteUserAIKey,
      createCommunityFood,
      fetchAnalysis,
      fetchBodySummary,
      fetchCalendar,
      fetchDaySummary,
      fetchFavoriteProducts,
      fetchWaterLogs,
      fetchWidgetTodaySummary,
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
      removeFavoriteProduct,
      repeatIntakesFromDay,
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

function ScreenContainer(props: {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: object;
  style?: object;
}) {
  if (props.scroll === false) {
    return (
      <SafeAreaView style={[styles.screen, props.style]}>
        <View style={[styles.flex1, props.contentContainerStyle]}>{props.children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, props.style]}>
      <ScrollView contentContainerStyle={[styles.mainScroll, props.contentContainerStyle]}>{props.children}</ScrollView>
    </SafeAreaView>
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
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled && styles.primaryButtonPressed,
        disabled && styles.disabledButton,
      ]}
    >
      {props.loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.primaryButtonText}>{props.title}</Text>}
    </Pressable>
  );
}

function SecondaryButton(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && !props.disabled && styles.secondaryButtonPressed,
        props.disabled && styles.disabledButton,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{props.title}</Text>
    </Pressable>
  );
}

function GhostButton(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [styles.ghostButton, pressed && !props.disabled && styles.ghostButtonPressed, props.disabled && styles.disabledButton]}
    >
      <Text style={styles.ghostButtonText}>{props.title}</Text>
    </Pressable>
  );
}

function AppCard(props: { children: import("react").ReactNode; style?: object }) {
  return <View style={[styles.appCard, props.style]}>{props.children}</View>;
}

function HeroCard(props: { children: ReactNode; style?: object }) {
  return <View style={[styles.appCard, styles.heroCardShell, props.style]}>{props.children}</View>;
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
        <Pressable
          style={({ pressed }) => [styles.sectionHeaderAction, pressed && styles.sectionHeaderActionPressed]}
          onPress={props.onAction}
        >
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

function StatusBadge(props: { label: string; tone?: "default" | "accent" | "warning" | "danger" }) {
  return <TagChip label={props.label} tone={props.tone} />;
}

function StatRow(props: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statRowLabel}>{props.label}</Text>
      <Text style={styles.statRowValue}>{props.value}</Text>
    </View>
  );
}

function InlineInfoRow(props: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.inlineInfoRow}>
      <Text style={styles.inlineInfoLabel}>{props.label}</Text>
      <Text style={[styles.inlineInfoValue, props.valueColor ? { color: props.valueColor } : null]}>{props.value}</Text>
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

function EmptyState(props: { title: string; subtitle: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.emptyStateCard}>
      <Text style={styles.emptyStateTitle}>{props.title}</Text>
      <Text style={styles.emptyStateSubtitle}>{props.subtitle}</Text>
      {props.actionLabel && props.onAction ? <GhostButton title={props.actionLabel} onPress={props.onAction} /> : null}
    </View>
  );
}

function ToastFeedback(props: { kind: "success" | "error"; message: string }) {
  return (
    <View style={[styles.toastWrap, props.kind === "success" ? styles.toastSuccess : styles.toastError]}>
      <Text style={styles.toastText}>{props.message}</Text>
    </View>
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

function SegmentedControl<T extends string>(props: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
}) {
  return (
    <View style={styles.segmentedWrap}>
      {props.options.map((option) => {
        const active = option.value === props.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => props.onChange(option.value)}
            style={({ pressed }) => [
              styles.segmentedItem,
              active && styles.segmentedItemActive,
              pressed && styles.segmentedItemPressed,
            ]}
          >
            <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
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
    <Pressable style={({ pressed }) => [styles.addActionCard, pressed && styles.addActionCardPressed]} onPress={props.onPress}>
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
  const passwordStrength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordStrengthAnim = useRef(new Animated.Value(0)).current;
  const passwordStrengthWidth = useMemo(
    () =>
      passwordStrengthAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
      }),
    [passwordStrengthAnim],
  );

  useEffect(() => {
    Animated.timing(passwordStrengthAnim, {
      toValue: passwordStrength.progress / 100,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [passwordStrength.progress, passwordStrengthAnim]);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Faltan datos", "Completa email y contraseña.");
      return;
    }
    if (!passwordStrength.isStrongEnough) {
      Alert.alert("Contraseña", "La contraseña es poco segura. Usa una contraseña al menos débil o segura.");
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
          {password.length > 0 ? (
            <View style={styles.passwordStrengthWrap}>
              <View style={styles.passwordStrengthTrack}>
                <Animated.View
                  style={[
                    styles.passwordStrengthFill,
                    {
                      width: passwordStrengthWidth,
                      backgroundColor: passwordStrength.color,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.passwordStrengthText, { color: passwordStrength.color }]}>{passwordStrength.label}</Text>
            </View>
          ) : null}
          <InputField label="Confirmar contraseña" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

          <PrimaryButton title="Crear cuenta" onPress={submit} loading={loading} disabled={!passwordStrength.isStrongEnough} />
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
  const [visibleScreen, setVisibleScreen] = useState<AuthStackScreen>("welcome");
  const [incomingScreen, setIncomingScreen] = useState<AuthStackScreen | null>(null);
  const authScreenTransition = useRef(new Animated.Value(1)).current;

  const switchAuthScreen = useCallback(
    (next: AuthStackScreen) => {
      if (next === screen || next === incomingScreen) {
        return;
      }
      setScreen(next);
      setIncomingScreen(next);
      authScreenTransition.stopAnimation();
      authScreenTransition.setValue(0);
      Animated.timing(authScreenTransition, {
        toValue: 1,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }
        setVisibleScreen(next);
        setIncomingScreen(null);
        authScreenTransition.setValue(1);
      });
    },
    [authScreenTransition, incomingScreen, screen],
  );

  const renderAuthScreen = useCallback(
    (activeScreen: AuthStackScreen): ReactElement => {
      if (activeScreen === "signup") {
        return <SignupScreen onBack={() => switchAuthScreen("welcome")} />;
      }
      if (activeScreen === "login") {
        return <LoginScreen onBack={() => switchAuthScreen("welcome")} />;
      }
      return <WelcomeScreen onCreate={() => switchAuthScreen("signup")} onLogin={() => switchAuthScreen("login")} />;
    },
    [switchAuthScreen],
  );

  const outgoingOpacity = authScreenTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={styles.crossfadeHost}>
      <Animated.View style={[styles.crossfadeLayer, incomingScreen ? { opacity: outgoingOpacity } : null]} pointerEvents={incomingScreen ? "none" : "auto"}>
        {renderAuthScreen(visibleScreen)}
      </Animated.View>
      {incomingScreen ? (
        <Animated.View style={[styles.crossfadeLayer, { opacity: authScreenTransition }]}>
          {renderAuthScreen(incomingScreen)}
        </Animated.View>
      ) : null}
    </View>
  );
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
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
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
        weekly_weight_goal_kg: null,
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
  onQuickAddAction,
}: {
  onOpenBodyProgress: () => void;
  onQuickAddAction: (action: QuickAddAction) => void;
}) {
  const auth = useAuth();
  const selectedDate = useMemo(() => formatDateLocal(new Date()), []);
  const [macroViewMode, setMacroViewMode] = useState<"rings" | "bars">("rings");
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const accountMenuAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openAccountMenu = useCallback(() => {
    if (accountMenuOpen) {
      return;
    }
    setAccountMenuVisible(true);
    setAccountMenuOpen(true);
    accountMenuAnim.stopAnimation();
    Animated.spring(accountMenuAnim, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.95,
      useNativeDriver: true,
    }).start();
  }, [accountMenuAnim, accountMenuOpen]);

  const closeAccountMenu = useCallback(
    (onClosed?: () => void) => {
      if (!accountMenuVisible) {
        onClosed?.();
        return;
      }
      setAccountMenuOpen(false);
      accountMenuAnim.stopAnimation();
      Animated.timing(accountMenuAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setAccountMenuVisible(false);
        }
        onClosed?.();
      });
    },
    [accountMenuAnim, accountMenuVisible],
  );

  const toggleAccountMenu = useCallback(() => {
    if (accountMenuOpen) {
      closeAccountMenu();
      return;
    }
    openAccountMenu();
  }, [accountMenuOpen, closeAccountMenu, openAccountMenu]);

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
  const accountMenuTranslateY = accountMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 0],
  });
  const accountMenuScale = accountMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const accountMenuBackdropOpacity = accountMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const confirmDeleteIntake = (intakeId: number) => {
    Alert.alert("Eliminar consumo", "Este registro se borrará del día actual.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await auth.deleteIntake(intakeId);
              await loadSummary();
            } catch (error) {
              Alert.alert("Eliminar consumo", parseApiError(error));
            }
          })();
        },
      },
    ]);
  };

  return (
    <>
      <ScreenContainer>
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
          <Pressable
            onPress={toggleAccountMenu}
            style={({ pressed }) => [styles.avatarPressable, pressed && styles.avatarPressablePressed]}
          >
            <AvatarCircle letter={displayName.slice(0, 1)} />
          </Pressable>
        </View>

        <HeroCard style={[styles.heroCard, exceededKcal && styles.heroCardExceeded]}>
          <SectionHeader title="Resumen del día" subtitle="Balance energético de hoy" />
          <Text style={styles.heroRemainingValue}>{kcalGoal > 0 ? kcalRemaining : "-"}</Text>
          <Text style={styles.heroRemainingSub}>kcal restantes</Text>
          <View style={styles.heroProgressTrack}>
            <View
              style={[
                styles.heroProgressFill,
                { width: `${kcalProgress * 100}%`, backgroundColor: exceededKcal ? theme.danger : theme.kcal },
              ]}
            />
          </View>
          <View style={styles.heroMiniGrid}>
            <View style={styles.heroMiniCard}>
              <Text style={styles.heroMiniLabel}>Objetivo</Text>
              <Text style={styles.heroMiniValue}>{Math.round(kcalGoal)}</Text>
            </View>
            <View style={styles.heroMiniCard}>
              <Text style={styles.heroMiniLabel}>Consumidas</Text>
              <Text style={styles.heroMiniValue}>{Math.round(kcalConsumed)}</Text>
            </View>
            <View style={styles.heroMiniCard}>
              <Text style={styles.heroMiniLabel}>Restantes</Text>
              <Text style={[styles.heroMiniValue, exceededKcal && { color: theme.danger }]}>{kcalGoal > 0 ? kcalRemaining : "-"}</Text>
            </View>
          </View>
          <View style={styles.heroPillsRow}>
            <StatusBadge label={exceededKcal ? "Sobre objetivo" : "En rango"} tone={exceededKcal ? "danger" : "accent"} />
            <StatusBadge
              label={`${summary?.intakes.length ?? 0} registro${(summary?.intakes.length ?? 0) === 1 ? "" : "s"}`}
              tone={summary?.intakes.length ? "default" : "warning"}
            />
          </View>
        </HeroCard>

        <AppCard>
          <SectionHeader title="Acciones principales" subtitle="Registra en menos toques" />
          <View style={styles.dashboardActionGrid}>
            <Pressable
              style={({ pressed }) => [styles.dashboardActionCard, pressed && styles.dashboardActionCardPressed]}
              onPress={() => onQuickAddAction("barcode")}
            >
              <View style={[styles.dashboardActionIcon, { backgroundColor: "rgba(46,217,195,0.16)" }]}>
                <QuickAddIcon action="barcode" />
              </View>
              <Text style={styles.dashboardActionTitle}>Escanear</Text>
              <Text style={styles.dashboardActionSubtitle}>Código de barras</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.dashboardActionCard, pressed && styles.dashboardActionCardPressed]}
              onPress={() => onQuickAddAction("manual")}
            >
              <View style={[styles.dashboardActionIcon, { backgroundColor: "rgba(79,141,253,0.16)" }]}>
                <QuickAddIcon action="manual" />
              </View>
              <Text style={styles.dashboardActionTitle}>Buscar</Text>
              <Text style={styles.dashboardActionSubtitle}>Nombre o marca</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.dashboardActionCard, pressed && styles.dashboardActionCardPressed]}
              onPress={() => onQuickAddAction("meal_photo")}
            >
              <View style={[styles.dashboardActionIcon, { backgroundColor: "rgba(245,158,11,0.16)" }]}>
                <QuickAddIcon action="meal_photo" />
              </View>
              <Text style={styles.dashboardActionTitle}>Foto comida</Text>
              <Text style={styles.dashboardActionSubtitle}>Estimación IA</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.dashboardActionCard, pressed && styles.dashboardActionCardPressed]}
              onPress={onOpenBodyProgress}
            >
              <View style={[styles.dashboardActionIcon, { backgroundColor: "rgba(244,114,182,0.16)" }]}>
                <Text style={styles.dashboardActionWeightIcon}>kg</Text>
              </View>
              <Text style={styles.dashboardActionTitle}>Peso</Text>
              <Text style={styles.dashboardActionSubtitle}>Registrar ahora</Text>
            </Pressable>
          </View>
        </AppCard>

        <AppCard>
          <SectionHeader title="Macros del día" subtitle="Vista rápida" />
          <SegmentedControl
            value={macroViewMode}
            onChange={setMacroViewMode}
            options={[
              { label: "Rings", value: "rings" },
              { label: "Barras", value: "bars" },
            ]}
          />

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
          <SectionHeader title="Intakes de hoy" subtitle="Línea temporal" actionLabel="Recargar" onAction={() => void loadSummary()} />
          {loadingSummary ? <ActivityIndicator color={theme.accent} /> : null}

          {!loadingSummary && summary && summary.intakes.length === 0 ? (
            <EmptyState
              title="Todavía no has registrado comida hoy"
              subtitle="Empieza con escaneo o búsqueda manual para activar tu progreso del día."
              actionLabel="Escanear producto"
              onAction={() => onQuickAddAction("barcode")}
            />
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
                  <View style={styles.intakeRight}>
                    <Text style={styles.intakeKcal}>{Math.round(item.nutrients.kcal)} kcal</Text>
                    <Pressable onPress={() => confirmDeleteIntake(item.id)} style={styles.intakeDeleteBtn}>
                      <Text style={styles.intakeDeleteText}>Eliminar</Text>
                    </Pressable>
                  </View>
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
      </ScreenContainer>
      {accountMenuVisible ? (
        <View style={styles.accountMenuLayer} pointerEvents="box-none">
          <Pressable style={styles.accountMenuBackdrop} onPress={() => closeAccountMenu()}>
            <Animated.View style={[styles.accountMenuScrim, { opacity: accountMenuBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.accountMenuContainer,
              {
                opacity: accountMenuAnim,
                transform: [{ translateY: accountMenuTranslateY }, { scale: accountMenuScale }],
              },
            ]}
          >
            <Pressable style={styles.accountMenuCard} onPress={() => {}}>
              <Text style={styles.accountMenuTitle}>Mi cuenta</Text>
              <InlineInfoRow label="Email" value={auth.user?.email ?? "-"} />
              <InlineInfoRow label="Email verificado" value={auth.user?.email_verified ? "Sí" : "No"} />
              <InlineInfoRow label="Onboarding" value={auth.user?.onboarding_completed ? "Completado" : "Pendiente"} />
              <SecondaryButton
                title="Cerrar sesión"
                onPress={() =>
                  closeAccountMenu(() => {
                    void auth.logout();
                  })
                }
              />
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}

function BodyProgressScreen() {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingWeight, setSavingWeight] = useState(false);
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [showQuickWeightForm, setShowQuickWeightForm] = useState(false);
  const [showMeasurementsForm, setShowMeasurementsForm] = useState(false);
  const [showRecentLogs, setShowRecentLogs] = useState(true);

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
      return theme.bmiUnderweight;
    }
    if (normalized.includes("normal")) {
      return theme.bmiNormal;
    }
    if (normalized.includes("over")) {
      return theme.bmiOverweight;
    }
    if (normalized.includes("obes")) {
      return theme.bmiObesity;
    }
    return theme.muted;
  })();

  const recentWeights = useMemo(() => weightLogs.slice(0, 6), [weightLogs]);
  const recentMeasurements = useMemo(() => measurementLogs.slice(0, 4), [measurementLogs]);

  return (
    <ScreenContainer>
        <View style={styles.bodyPageHeader}>
          <View style={styles.bodyPageHeaderCopy}>
            <Text style={styles.bodyPageTitle}>Body</Text>
            <Text style={styles.bodyPageSubtitle}>Composición corporal, tendencia y métricas clave.</Text>
          </View>
          <Pressable
            onPress={() => setShowQuickWeightForm((current) => !current)}
            style={({ pressed }) => [styles.bodyHeaderActionBtn, pressed && styles.bodyHeaderActionBtnPressed]}
          >
            <Text style={styles.bodyHeaderActionText}>{showQuickWeightForm ? "Ocultar" : "Registrar peso"}</Text>
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

        <HeroCard style={styles.bodySummaryHero}>
          <SectionHeader
            title="Resumen actual"
            subtitle="Peso, cambio semanal, IMC y % grasa"
            actionLabel={showQuickWeightForm ? "Cerrar registro" : "Registrar peso"}
            onAction={() => setShowQuickWeightForm((current) => !current)}
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
          {summary?.weekly_weight_goal_kg != null ? (
            <InlineInfoRow label="Objetivo semanal" value={`${summary.weekly_weight_goal_kg.toFixed(2)} kg`} valueColor={theme.kcal} />
          ) : null}
          {summary?.needs_weight_checkin ? (
            <InlineInfoRow label="Check-in recomendado" value="Registrar peso esta semana" valueColor={theme.warning} />
          ) : null}
          <GhostButton title="Recargar datos" onPress={() => void reload()} />
        </HeroCard>

        <AppCard>
          <SectionHeader title="Avatar corporal" subtitle="Silueta corporal por perfil" />
          <BodyAvatarSvg
            sex={auth.profile?.sex ?? "other"}
            bmi={summary?.bmi ?? null}
            bmiCategory={summary?.bmi_category ?? "unknown"}
            bodyFatPercent={summary?.body_fat_percent ?? null}
            latestWeightKg={summary?.latest_weight_kg ?? null}
            weeklyChangeKg={summary?.weekly_change_kg ?? null}
          />
          <View style={styles.bodyLegendRow}>
            {[
              ["Underweight", theme.bmiUnderweight],
              ["Normal", theme.bmiNormal],
              ["Overweight", theme.bmiOverweight],
              ["Obesity", theme.bmiObesity],
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
          <SegmentedControl
            value={range}
            onChange={setRange}
            options={[
              { label: "7d", value: "7d" },
              { label: "30d", value: "30d" },
              { label: "90d", value: "90d" },
            ]}
          />

          {loading ? (
            <ActivityIndicator color={theme.accent} />
          ) : filteredWeightLogs.length === 0 ? (
            <EmptyState
              title="Sin registros de peso"
              subtitle="Añade tu primer peso para desbloquear tendencia y cambio semanal."
              actionLabel="Registrar peso ahora"
              onAction={() => setShowQuickWeightForm(true)}
            />
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
            <EmptyState
              title="Sin datos suficientes"
              subtitle="Registra cintura y cuello (más cadera si aplica) para estimar % grasa."
              actionLabel="Añadir medidas"
              onAction={() => setShowMeasurementsForm(true)}
            />
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
          <SectionHeader
            title="Registros recientes"
            subtitle="Últimas entradas de peso y medidas"
            actionLabel={showRecentLogs ? "Ocultar" : "Mostrar"}
            onAction={() => setShowRecentLogs((current) => !current)}
          />
          {showRecentLogs ? (
            <>
              {recentWeights.length === 0 ? (
                <EmptyState
                  title="Sin peso registrado"
                  subtitle="Usa 'Registrar peso' para empezar tu historial."
                  actionLabel="Registrar peso"
                  onAction={() => setShowQuickWeightForm(true)}
                />
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
            </>
          ) : (
            <Text style={styles.helperText}>Vista resumida activa. Pulsa "Mostrar" para ver el detalle.</Text>
          )}
        </AppCard>

        <AppCard>
          <SectionHeader
            title="Registrar medidas"
            subtitle="Opcional para mejorar estimación de % grasa"
            actionLabel={showMeasurementsForm ? "Ocultar" : "Abrir"}
            onAction={() => setShowMeasurementsForm((current) => !current)}
          />
          {showMeasurementsForm ? (
            <>
              <InputField label="Cintura (cm)" value={waistInput} onChangeText={setWaistInput} keyboardType="numeric" />
              <InputField label="Cuello (cm)" value={neckInput} onChangeText={setNeckInput} keyboardType="numeric" />
              <InputField label="Cadera (cm)" value={hipInput} onChangeText={setHipInput} keyboardType="numeric" />
              <PrimaryButton title="Guardar medidas" onPress={() => void saveMeasurement()} loading={savingMeasure} />
              <Text style={styles.helperText}>Registros de medidas acumulados: {measurementLogs.length}</Text>
            </>
          ) : (
            <Text style={styles.helperText}>Añade medidas cuando quieras mejorar la precisión del % grasa.</Text>
          )}
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
      </ScreenContainer>
  );
}

function HistoryScreen() {
  const auth = useAuth();
  const todayIso = useMemo(() => formatDateLocal(new Date()), []);
  const [monthKey, setMonthKey] = useState(formatMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso);
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

    for (let i = 0; i < 30; i += 1) {
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

    const statsRows = rows.slice(0, 7);
    const avgKcal = statsRows.reduce((acc, row) => acc + row.consumed.kcal, 0) / Math.max(statsRows.length, 1);
    const avgProtein = statsRows.reduce((acc, row) => acc + row.consumed.protein_g, 0) / Math.max(statsRows.length, 1);
    const goalRows = statsRows.filter((row) => row.goal && row.goal.protein_goal > 0);
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
      const detailDays = response.days.filter((day) => day.intake_count > 0).map((day) => day.date);
      const details = await Promise.all(
        detailDays.map(async (date) => {
          try {
            const detail = await auth.fetchDaySummary(date);
            return { date, detail };
          } catch {
            return null;
          }
        }),
      );
      details.forEach((item) => {
        if (item) {
          detailMap[item.date] = item.detail;
        }
      });
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

  useEffect(() => {
    setSelectedDay((current) => {
      if (current && current.startsWith(monthKey)) {
        return current;
      }
      if (todayIso.startsWith(monthKey)) {
        return todayIso;
      }
      return days[0]?.date ?? null;
    });
  }, [days, monthKey, todayIso]);

  const cells = useMemo(() => calendarCells(monthKey), [monthKey]);
  const dayMap = useMemo(() => {
    const map = new Map<number, CalendarDayEntry>();
    days.forEach((entry) => {
      const day = Number(entry.date.slice(-2));
      if (Number.isFinite(day)) {
        map.set(day, entry);
      }
    });
    return map;
  }, [days]);
  const monthLabel = useMemo(
    () => monthFromKey(monthKey).toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
    [monthKey],
  );
  const selectedEntry = useMemo(
    () => (selectedDay ? days.find((entry) => entry.date === selectedDay) ?? null : null),
    [days, selectedDay],
  );
  const selectedDetail = selectedDay ? dayDetailMap[selectedDay] : null;
  const selectedWeight = selectedDay ? weightDateMap[selectedDay] : undefined;
  const streakDays = weeklyStats?.streakDays ?? 0;
  const selectedDayTitle = useMemo(() => {
    if (!selectedDay) {
      return "Detalle del día";
    }
    const parsed = new Date(`${selectedDay}T00:00:00`);
    const label = parsed.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [selectedDay]);

  const confirmDeleteIntake = (intakeId: number) => {
    Alert.alert("Eliminar consumo", "Este registro se eliminará del historial.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await auth.deleteIntake(intakeId);
              await load();
            } catch (error) {
              Alert.alert("Eliminar consumo", parseApiError(error));
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.mainScroll}>
        <AppHeader title="Historial" subtitle="Actividad mensual, racha y detalle diario" />

        <AppCard>
          <SectionHeader title="Métricas últimos 7 días" />
          {weeklyStats ? (
            <View style={styles.bodyStatsRow}>
              <StatPill label="Prom kcal" value={`${weeklyStats.avgKcal}`} tone="accent" />
              <StatPill label="Prom proteína" value={`${weeklyStats.avgProtein} g`} />
              <StatPill label="Adherencia proteína" value={`${weeklyStats.adherenceProteinPct}%`} tone="warning" />
            </View>
          ) : (
            <EmptyState title="Sin suficientes datos" subtitle="Registra varios días para activar estadísticas." />
          )}
        </AppCard>

        <AppCard style={styles.historyCalendarCard}>
          <View style={styles.historyCalendarTopRow}>
            <View style={styles.historyCalendarTitleWrap}>
              <Text style={styles.historyCalendarTitle}>Calendario</Text>
              <Text style={styles.historyCalendarSubtitle}>Comidas y peso por día, en una vista mensual</Text>
            </View>
            <Pressable onPress={() => void load()} style={({ pressed }) => [styles.historyCalendarReloadBtn, pressed && styles.historyCalendarReloadBtnPressed]}>
              <Text style={styles.historyCalendarReloadText}>Recargar</Text>
            </Pressable>
          </View>

          <View style={styles.historyCalendarMonthNav}>
            <Pressable
              hitSlop={10}
              onPress={() => setMonthKey((current) => moveMonth(current, -1))}
              style={({ pressed }) => [styles.historyCalendarArrowTouch, pressed && styles.historyCalendarArrowTouchPressed]}
            >
              <Svg width={20} height={20} viewBox="0 0 122.88 116.6" fill="none">
                <Path d={CALENDAR_LEFT_ARROW_PATH} fill={theme.text} />
              </Svg>
            </Pressable>
            <Text style={styles.historyCalendarMonthLabel}>{monthLabel}</Text>
            <Pressable
              hitSlop={10}
              onPress={() => setMonthKey((current) => moveMonth(current, 1))}
              style={({ pressed }) => [styles.historyCalendarArrowTouch, pressed && styles.historyCalendarArrowTouchPressed]}
            >
              <Svg width={20} height={20} viewBox="0 0 122.88 116.6" fill="none">
                <Path d={CALENDAR_RIGHT_ARROW_PATH} fill={theme.text} />
              </Svg>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.historyCalendarLoadingRow}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}

          {!loading ? (
            <View
              style={[
                styles.historyCalendarStreakBadge,
                streakDays > 0 ? styles.historyCalendarStreakBadgeActive : styles.historyCalendarStreakBadgeIdle,
              ]}
            >
              <View style={styles.streakFlame}>
                <SvgXml xml={STREAK_FLAME_SVG_XML} width="100%" height="100%" />
              </View>
              <View style={styles.historyCalendarStreakTextWrap}>
                <Text style={styles.historyCalendarStreakTitle}>{streakDays > 0 ? "Racha activa" : "Racha inactiva"}</Text>
                <Text style={styles.historyCalendarStreakSubtitle}>
                  {streakDays > 0 ? "Consistencia semanal en curso" : "Registra comida hoy para activarla"}
                </Text>
              </View>
              <View style={styles.historyCalendarStreakMetric}>
                <Text style={styles.historyCalendarStreakDays}>{streakDays}</Text>
                <Text style={styles.historyCalendarStreakDaysLabel}>día{streakDays === 1 ? "" : "s"}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.historyWeekDaysRow}>
            {["L", "M", "X", "J", "V", "S", "D"].map((label) => (
              <Text key={label} style={styles.historyWeekDayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.historyCalendarGrid}>
            {cells.map((cell, idx) => {
              if (cell === null) {
                return <View key={`history-empty-${idx}`} style={styles.historyCalendarCellEmpty} />;
              }

              const isoDate = dayFromMonthAndCell(monthKey, cell);
              const active = selectedDay === isoDate;
              const isToday = isoDate === todayIso;
              const entry = dayMap.get(cell);
              const hasIntakes = (entry?.intake_count ?? 0) > 0;
              const hasWeight = typeof weightDateMap[isoDate] === "number";

              return (
                <Pressable
                  key={isoDate}
                  onPress={() => setSelectedDay(isoDate)}
                  style={({ pressed }) => [
                    styles.historyCalendarCell,
                    hasIntakes && styles.historyCalendarCellFilled,
                    hasWeight && styles.historyCalendarCellHasWeight,
                    isToday && styles.historyCalendarCellToday,
                    active && styles.historyCalendarCellActive,
                    pressed && styles.historyCalendarCellPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.historyCalendarDayText,
                      isToday && styles.historyCalendarDayTextToday,
                      active && styles.historyCalendarDayTextActive,
                    ]}
                  >
                    {cell}
                  </Text>
                  <View style={styles.historyCalendarMarkerRow}>
                    {hasIntakes ? <View style={styles.historyCalendarFoodDot} /> : null}
                    {hasWeight ? <View style={styles.historyCalendarWeightDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.historyLegendRow}>
            <View style={styles.historyLegendItem}>
              <View style={styles.historyCalendarFoodDot} />
              <Text style={styles.historyLegendText}>Comida</Text>
            </View>
            <View style={styles.historyLegendItem}>
              <View style={styles.historyCalendarWeightDot} />
              <Text style={styles.historyLegendText}>Peso</Text>
            </View>
          </View>

          {!loading && days.length === 0 ? <Text style={styles.historyCalendarEmptyText}>Sin registros este mes.</Text> : null}
        </AppCard>

        <AppCard>
          <SectionHeader title={selectedDayTitle} subtitle={selectedDay ?? "Sin fecha seleccionada"} />

          {selectedDay ? (
            <>
              <View style={styles.bodyStatsRow}>
                <StatPill label="Kcal" value={`${Math.round(selectedDetail?.consumed.kcal ?? selectedEntry?.kcal ?? 0)}`} tone="accent" />
                <StatPill
                  label="Registros"
                  value={`${selectedEntry?.intake_count ?? selectedDetail?.intakes.length ?? 0}`}
                  tone="warning"
                />
                <StatPill label="Peso" value={typeof selectedWeight === "number" ? `${selectedWeight.toFixed(1)} kg` : "N/D"} />
              </View>

              {selectedDetail && selectedDetail.intakes.length > 0 ? (
                <View style={styles.historyDetailList}>
                  {selectedDetail.intakes.map((intake) => (
                    <View key={intake.id} style={styles.historyIntakeRow}>
                      <View style={styles.historyDayHead}>
                        <Text style={styles.historyDate}>{intake.product_name ?? "Producto"}</Text>
                        <Text style={styles.historyValue}>{Math.round(intake.nutrients.kcal)} kcal</Text>
                      </View>
                      <Text style={styles.helperText}>
                        {new Date(intake.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                        {Math.round(intake.quantity_g ?? 0)} g · P {Math.round(intake.nutrients.protein_g)} / C{" "}
                        {Math.round(intake.nutrients.carbs_g)} / G {Math.round(intake.nutrients.fat_g)}
                      </Text>
                      <Pressable onPress={() => confirmDeleteIntake(intake.id)} style={styles.historyDeleteBtn}>
                        <Text style={styles.historyDeleteText}>Eliminar</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  title="Sin comidas en este día"
                  subtitle="Registra consumos para ver aquí el detalle completo."
                />
              )}
            </>
          ) : (
            <EmptyState title="Selecciona un día" subtitle="Pulsa una fecha del calendario para ver el resumen." />
          )}
        </AppCard>
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
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [aiKeyStatus, setAiKeyStatus] = useState<UserAIKeyStatus | null>(null);
  const [openSections, setOpenSections] = useState({
    goals: true,
    profile: false,
    ai: false,
    data: false,
    app: false,
  });

  const [goalDraft, setGoalDraft] = useState({
    kcal_goal: "",
    protein_goal: "",
    fat_goal: "",
    carbs_goal: "",
  });
  const [recommendedGoal, setRecommendedGoal] = useState<GoalPayload | null>(null);
  const [suggestedKcalAdjustment, setSuggestedKcalAdjustment] = useState<number | null>(null);
  const [bodyHints, setBodyHints] = useState<string[]>([]);

  const [profileDraft, setProfileDraft] = useState({
    weight_kg: auth.profile?.weight_kg ? String(auth.profile.weight_kg) : "",
    height_cm: auth.profile?.height_cm ? String(auth.profile.height_cm) : "",
    age: auth.profile?.age ? String(auth.profile.age) : "",
    sex: auth.profile?.sex ?? "other",
    activity_level: auth.profile?.activity_level ?? "moderate",
    goal_type: auth.profile?.goal_type ?? "maintain",
    weekly_weight_goal_kg: auth.profile?.weekly_weight_goal_kg ? String(auth.profile.weekly_weight_goal_kg) : "",
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
      weekly_weight_goal_kg: auth.profile?.weekly_weight_goal_kg ? String(auth.profile.weekly_weight_goal_kg) : "",
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
      setSuggestedKcalAdjustment(analysis.suggested_kcal_adjustment);
      setBodyHints(bodySummary.hints);
      setAiKeyStatus(aiStatus);

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

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

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
        weekly_weight_goal_kg: toOptionalNumber(profileDraft.weekly_weight_goal_kg),
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

  const exportCsv = async () => {
    try {
      const todayDate = new Date();
      const rows: string[] = ["date,kcal,protein_g,fat_g,carbs_g,water_ml,intakes_count"];

      for (let i = 0; i < 14; i += 1) {
        const day = new Date(todayDate);
        day.setDate(todayDate.getDate() - i);
        const iso = formatDateLocal(day);
        const summary = await auth.fetchDaySummary(iso);
        rows.push(
          [
            iso,
            summary.consumed.kcal.toFixed(2),
            summary.consumed.protein_g.toFixed(2),
            summary.consumed.fat_g.toFixed(2),
            summary.consumed.carbs_g.toFixed(2),
            String(summary.water_ml ?? 0),
            String(summary.intakes.length),
          ].join(","),
        );
      }

      const csv = rows.join("\n");
      console.log("NUTRI_EXPORT_CSV", csv);
      Alert.alert("Datos", `Export CSV generado (${rows.length - 1} días). Revisa consola del bundler.`);
    } catch (error) {
      Alert.alert("Datos", parseApiError(error));
    }
  };

  const shareWeeklySummary = async () => {
    try {
      const todayDate = new Date();
      const rows: DaySummary[] = [];
      for (let i = 0; i < 7; i += 1) {
        const day = new Date(todayDate);
        day.setDate(todayDate.getDate() - i);
        const iso = formatDateLocal(day);
        const summary = await auth.fetchDaySummary(iso);
        rows.push(summary);
      }
      if (!rows.length) {
        Alert.alert("Datos", "No hay datos suficientes para compartir.");
        return;
      }
      const avgKcal = rows.reduce((acc, row) => acc + row.consumed.kcal, 0) / rows.length;
      const avgProtein = rows.reduce((acc, row) => acc + row.consumed.protein_g, 0) / rows.length;
      const avgWater = rows.reduce((acc, row) => acc + (row.water_ml ?? 0), 0) / rows.length;

      await Share.share({
        message: [
          "Resumen semanal Nutri Tracker",
          `Kcal promedio: ${avgKcal.toFixed(0)}`,
          `Proteína promedio: ${avgProtein.toFixed(1)} g`,
          `Agua promedio: ${avgWater.toFixed(0)} ml`,
        ].join("\n"),
      });
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
        provider: "openai",
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
        provider: "openai",
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

  const hasGoalsConfigured = Boolean(goalDraft.kcal_goal && goalDraft.protein_goal && goalDraft.fat_goal && goalDraft.carbs_goal);
  const hasProfileConfigured = Boolean(profileDraft.weight_kg && profileDraft.height_cm);
  const activeHintsCount = bodyHints.length;

  return (
    <ScreenContainer>
        <AppHeader title="Ajustes" subtitle="Objetivos, perfil corporal, IA y datos" />

        <HeroCard style={styles.settingsHeroCard}>
          <SectionHeader title="Estado rápido" subtitle="Configuración clave del perfil" />
          <View style={styles.settingsStatusRow}>
            <StatusBadge label={hasGoalsConfigured ? "Objetivos listos" : "Faltan objetivos"} tone={hasGoalsConfigured ? "accent" : "warning"} />
            <StatusBadge
              label={hasProfileConfigured ? "Perfil completo" : "Perfil pendiente"}
              tone={hasProfileConfigured ? "accent" : "warning"}
            />
            <StatusBadge label={aiKeyStatus?.configured ? "IA activa" : "IA sin clave"} tone={aiKeyStatus?.configured ? "accent" : "default"} />
          </View>
          <InlineInfoRow label="Coach hints" value={`${activeHintsCount}`} valueColor={activeHintsCount ? theme.warning : theme.ok} />
          <InlineInfoRow
            label="Sugerencia kcal"
            value={suggestedKcalAdjustment !== null ? `${suggestedKcalAdjustment >= 0 ? "+" : ""}${suggestedKcalAdjustment.toFixed(0)} kcal` : "N/D"}
            valueColor={suggestedKcalAdjustment !== null ? theme.kcal : undefined}
          />
        </HeroCard>

        <AppCard>
          <SectionHeader
            title="Objetivos diarios"
            subtitle="Kcal y macros"
            actionLabel={openSections.goals ? "Ocultar" : "Editar"}
            onAction={() => toggleSection("goals")}
          />
          {openSections.goals ? (
            <>
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
              <View style={styles.settingsInlineActions}>
                <GhostButton title="Usar recomendación" onPress={useRecommendedGoals} />
                <PrimaryButton title="Guardar objetivos" onPress={() => void saveGoals()} loading={savingGoals} />
              </View>
              {recommendedGoal ? (
                <Text style={styles.helperText}>
                  Recomendado: {recommendedGoal.kcal_goal} kcal | P {recommendedGoal.protein_goal} | G {recommendedGoal.fat_goal} | C{" "}
                  {recommendedGoal.carbs_goal}
                </Text>
              ) : null}
              {suggestedKcalAdjustment !== null ? (
                <Text style={styles.helperText}>
                  Ajuste sugerido por tendencia: {suggestedKcalAdjustment >= 0 ? "+" : ""}
                  {suggestedKcalAdjustment.toFixed(0)} kcal/día
                </Text>
              ) : null}
            </>
          ) : (
            <View style={styles.settingsCollapsedSummary}>
              <InlineInfoRow label="Kcal" value={goalDraft.kcal_goal || "-"} />
              <InlineInfoRow label="Proteína" value={goalDraft.protein_goal ? `${goalDraft.protein_goal} g` : "-"} />
              <InlineInfoRow label="Grasas" value={goalDraft.fat_goal ? `${goalDraft.fat_goal} g` : "-"} />
              <InlineInfoRow label="Carbs" value={goalDraft.carbs_goal ? `${goalDraft.carbs_goal} g` : "-"} />
            </View>
          )}
        </AppCard>

        <AppCard>
          <SectionHeader
            title="Perfil corporal"
            subtitle="Datos base para cálculos"
            actionLabel={openSections.profile ? "Ocultar" : "Editar"}
            onAction={() => toggleSection("profile")}
          />
          {openSections.profile ? (
            <>
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
                label="Objetivo semanal de peso (kg)"
                value={profileDraft.weekly_weight_goal_kg}
                onChangeText={(value) => setProfileDraft((current) => ({ ...current, weekly_weight_goal_kg: value }))}
                keyboardType="numeric"
                placeholder="ej. 0.35"
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
            </>
          ) : (
            <View style={styles.settingsCollapsedSummary}>
              <InlineInfoRow label="Peso" value={profileDraft.weight_kg ? `${profileDraft.weight_kg} kg` : "-"} />
              <InlineInfoRow label="Altura" value={profileDraft.height_cm ? `${profileDraft.height_cm} cm` : "-"} />
              <InlineInfoRow label="Sexo" value={profileDraft.sex} />
            </View>
          )}
        </AppCard>

        <AppCard>
          <SectionHeader
            title="IA"
            subtitle="Clave por usuario para funciones de imagen"
            actionLabel={openSections.ai ? "Ocultar" : "Configurar"}
            onAction={() => toggleSection("ai")}
          />
          {openSections.ai ? (
            <>
              <Text style={styles.helperText}>Tu clave se usa solo para procesar imágenes. Nunca se muestra completa.</Text>
              <Text style={styles.helperText}>Proveedor activo: OpenAI</Text>
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
            </>
          ) : (
            <View style={styles.settingsCollapsedSummary}>
              <InlineInfoRow label="Proveedor" value="OpenAI" />
              <InlineInfoRow label="Estado" value={aiKeyStatus?.configured ? "Clave configurada" : "Sin clave configurada"} />
              {aiKeyStatus?.key_hint ? <InlineInfoRow label="Hint" value={aiKeyStatus.key_hint} /> : null}
            </View>
          )}
        </AppCard>

        {DEV_SETTINGS_MODE ? (
          <AppCard>
            <SectionHeader
              title="App (dev)"
              subtitle="Conectividad y preferencias técnicas"
              actionLabel={openSections.app ? "Ocultar" : "Abrir"}
              onAction={() => toggleSection("app")}
            />
            {openSections.app ? (
              <>
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
              </>
            ) : (
              <Text style={styles.helperText}>Opciones técnicas ocultas (modo desarrollador).</Text>
            )}
          </AppCard>
        ) : null}

        <AppCard>
          <SectionHeader
            title="Datos"
            subtitle="Exportación y utilidades"
            actionLabel={openSections.data ? "Ocultar" : "Abrir"}
            onAction={() => toggleSection("data")}
          />
          {openSections.data ? (
            <>
              <SecondaryButton title="Exportar datos JSON" onPress={() => void exportData()} />
              <SecondaryButton title="Exportar resumen CSV" onPress={() => void exportCsv()} />
              <SecondaryButton title="Compartir resumen semanal" onPress={() => void shareWeeklySummary()} />
              <SecondaryButton
                title="Reset demo data (stub)"
                onPress={() => Alert.alert("Datos", "Stub listo. Pendiente endpoint de borrado seguro.")}
              />
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
            </>
          ) : (
            <View style={styles.settingsCollapsedSummary}>
              <InlineInfoRow label="Export JSON" value="Disponible" />
              <InlineInfoRow label="Export CSV" value="Disponible" />
              <InlineInfoRow label="Resumen semanal" value="Compartible" />
            </View>
          )}
        </AppCard>
    </ScreenContainer>
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

function AddScreen(props: { launchAction: AddLaunchAction | null; onLaunchActionHandled: (requestId: number) => void }) {
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
  const [favoriteProducts, setFavoriteProducts] = useState<FavoriteProduct[]>([]);

  const [labelName, setLabelName] = useState("");
  const [labelBrand, setLabelBrand] = useState("");
  const [labelText, setLabelText] = useState("");
  const [labelPhotos, setLabelPhotos] = useState<string[]>([]);
  const [labelQuestions, setLabelQuestions] = useState<string[]>([]);
  const [correctionPreview, setCorrectionPreview] = useState<ProductCorrectionResponse | null>(null);

  const [mealDescription, setMealDescription] = useState("");
  const [mealPhotos, setMealPhotos] = useState<string[]>([]);
  const [mealStep, setMealStep] = useState<"compose" | "questions" | "result">("compose");
  const [mealAdjust, setMealAdjust] = useState(0);
  const [mealQuestions, setMealQuestions] = useState<MealEstimateQuestion[]>([]);
  const [mealQuestionAnswers, setMealQuestionAnswers] = useState<Record<string, string>>({});
  const [mealAssumptions, setMealAssumptions] = useState<string[]>([]);
  const [mealIngredients, setMealIngredients] = useState<string[]>([]);
  const [mealPreview, setMealPreview] = useState<MealPhotoEstimateResponse | null>(null);
  const [toastFeedback, setToastFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

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
  const [manualHasSearched, setManualHasSearched] = useState(false);
  const [showManualCreateForm, setShowManualCreateForm] = useState(false);
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
      const [summary, favorites] = await Promise.all([auth.fetchDaySummary(todayKey), auth.fetchFavoriteProducts(12)]);
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
      setFavoriteProducts(favorites);
    } catch {
      setRecentProducts([]);
      setFavoriteProducts([]);
    }
  }, [auth, todayKey]);

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
    setMealStep("compose");
    setMealAdjust(0);
    setMealQuestions([]);
    setMealQuestionAnswers({});
    setMealAssumptions([]);
    setMealIngredients([]);
    setMealPreview(null);
    setToastFeedback(null);
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
    setManualHasSearched(false);
    setShowManualCreateForm(false);
    setMode("manual");
  };

  const handledLaunchRef = useRef<number | null>(null);

  useEffect(() => {
    const launch = props.launchAction;
    if (!launch) {
      return;
    }
    if (handledLaunchRef.current === launch.requestId) {
      return;
    }
    handledLaunchRef.current = launch.requestId;

    const run = async () => {
      if (launch.action === "barcode") {
        await startBarcodeFlow();
        return;
      }
      if (launch.action === "label_fix") {
        startLabelFlow();
        return;
      }
      if (launch.action === "meal_photo") {
        await startMealFlow();
        return;
      }
      startManualFlow();
    };

    void run().finally(() => {
      props.onLaunchActionHandled(launch.requestId);
    });
  }, [props.launchAction, props.onLaunchActionHandled, startBarcodeFlow, startLabelFlow, startMealFlow, startManualFlow]);

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

  const favoriteProductIds = useMemo(
    () => new Set(favoriteProducts.map((item) => item.product.id)),
    [favoriteProducts],
  );

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
    setMealPhotos([firstAsset.uri]);
    setMealStep("compose");
    setMealQuestions([]);
    setMealQuestionAnswers({});
  };

  const pickMealPhotoFromLibrary = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permisos", "Necesitas permisos de galería para subir una foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
      selectionLimit: 1,
    });
    const firstAsset = result.canceled ? null : result.assets[0];
    if (!firstAsset?.uri) {
      return;
    }
    setMealPreview(null);
    setMealPhotos([firstAsset.uri]);
    setMealStep("compose");
    setMealQuestions([]);
    setMealQuestionAnswers({});
  };

  const removeMealPhoto = () => {
    setMealPhotos([]);
    setMealQuestions([]);
    setMealQuestionAnswers({});
    setMealAssumptions([]);
    setMealIngredients([]);
    setMealPreview(null);
    setMealStep("compose");
  };

  const runMealQuestions = async () => {
    const hasKey = await ensureAIKeyConfigured();
    if (!hasKey) {
      return;
    }
    if (mealPhotos.length === 0) {
      Alert.alert("Estimación", "Primero toma o sube una foto de la comida.");
      return;
    }
    setSaving(true);
    try {
      const response = await auth.mealEstimateQuestions({
        description: mealDescription.trim() || undefined,
        photos: mealPhotos,
      });
      const normalizedQuestions =
        response.question_items?.length > 0
          ? response.question_items
          : response.questions.slice(0, 3).map((prompt, index) => ({
              id: `q_${index + 1}`,
              prompt,
              answer_type: "text" as const,
              options: [],
              placeholder: "Respuesta breve",
            }));
      const safeQuestions = normalizedQuestions.slice(0, 3);
      setMealQuestions(safeQuestions);
      setMealQuestionAnswers(
        safeQuestions.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = "";
          return acc;
        }, {}),
      );
      setMealAssumptions(response.assumptions);
      setMealIngredients(response.detected_ingredients);
      setMealStep("questions");
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
    if (mealPhotos.length === 0) {
      Alert.alert("Estimación", "Añade una foto antes de calcular.");
      return;
    }
    setSaving(true);
    try {
      const response = await auth.mealPhotoEstimateCalculate({
        description: mealDescription.trim() || undefined,
        answers: mealQuestionAnswers,
        photos: mealPhotos,
        adjustPercent,
        commit: false,
      });
      setMealPreview(response);
      if (response.question_items?.length) {
        setMealQuestions(response.question_items);
      }
      setMealAssumptions(response.assumptions);
      setMealIngredients(response.detected_ingredients);
      setMealAdjust(adjustPercent);
      setMealStep("result");
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
    if (mealPhotos.length === 0) {
      Alert.alert("Estimación", "Añade una foto antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      const response = await auth.mealPhotoEstimate({
        description: mealDescription.trim() || undefined,
        answers: mealQuestionAnswers,
        photos: mealPhotos,
        adjustPercent: mealAdjust,
        commit: true,
      });
      if (!response.saved || !response.intake) {
        Alert.alert("Estimación", "No se pudo guardar. Revisa las preguntas sugeridas.");
        return;
      }
      setToastFeedback({ kind: "success", message: "Consumo guardado correctamente." });
      resetToHub();
    } catch (error) {
      setToastFeedback({ kind: "error", message: parseApiError(error) });
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

    setManualHasSearched(true);
    setSearchingFoods(true);
    try {
      const response = await auth.searchFoods(query);
      setManualResults(response.results);
    } catch (error) {
      Alert.alert("Buscar", parseApiError(error));
    } finally {
      setSearchingFoods(false);
    }
  };

  const selectManualResult = async (item: FoodSearchItem) => {
    if (item.origin === "openfoodfacts_remote" && item.product.barcode) {
      setSearchingFoods(true);
      try {
        const lookup = await auth.lookupByBarcode(item.product.barcode);
        if (lookup.product) {
          setProduct(lookup.product);
          prefillFromPreference(lookup.product, lookup.preferred_serving);
          setPreferredServing(lookup.preferred_serving);
          setLabelName(lookup.product.name);
          setLabelBrand(lookup.product.brand ?? "");
          setMode("barcode");
          setPhase("quantity");
          return;
        }

        setProduct(null);
        setPreferredServing(null);
        setBarcode(item.product.barcode);
        setLabelName(item.product.name);
        setLabelBrand(item.product.brand ?? "");
        setLabelQuestions([
          lookup.message ?? "No hay nutrición suficiente para este barcode.",
          ...lookup.missing_fields.map((field) => `Falta ${field}`),
        ]);
        setMode("barcode");
        setPhase("label");
        return;
      } catch (error) {
        Alert.alert("Buscar", parseApiError(error));
        return;
      } finally {
        setSearchingFoods(false);
      }
    }

    setProduct(item.product);
    setPreferredServing(null);
    setLabelName(item.product.name);
    setLabelBrand(item.product.brand ?? "");
    setMode("barcode");
    setPhase("quantity");
  };

  const selectFavoriteProduct = (favorite: FavoriteProduct) => {
    setProduct(favorite.product);
    setPreferredServing(null);
    setLabelName(favorite.product.name);
    setLabelBrand(favorite.product.brand ?? "");
    setMode("barcode");
    setPhase("quantity");
  };

  const toggleFavoriteForCurrentProduct = async () => {
    if (!product) {
      return;
    }
    setSaving(true);
    try {
      if (favoriteProductIds.has(product.id)) {
        await auth.removeFavoriteProduct(product.id);
      } else {
        await auth.addFavoriteProduct(product.id);
      }
      const favorites = await auth.fetchFavoriteProducts(12);
      setFavoriteProducts(favorites);
    } catch (error) {
      Alert.alert("Favoritos", parseApiError(error));
    } finally {
      setSaving(false);
    }
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
    if (!toastFeedback) {
      return;
    }
    const timer = setTimeout(() => setToastFeedback(null), 2600);
    return () => clearTimeout(timer);
  }, [toastFeedback]);

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

  const searchBadgeTone = useCallback((badge: FoodSearchItem["badge"]): "default" | "accent" | "warning" | "danger" => {
    if (badge === "Verificado") {
      return "accent";
    }
    if (badge === "Estimado") {
      return "warning";
    }
    if (badge === "Comunidad") {
      return "default";
    }
    return "default";
  }, []);

  const isUserCreatedProduct = useCallback((item: FoodSearchItem): boolean => {
    const source = item.product.source;
    return (
      item.product.created_by_user_id !== null ||
      source === "community" ||
      source === "community_verified"
    );
  }, []);

  const subtitle =
    mode === "hub"
      ? "Escáner, etiqueta, foto de comida o carga manual"
      : mode === "barcode"
        ? "Escáner de código de barras"
        : mode === "label_fix"
          ? "Corregir o añadir datos nutricionales por etiqueta"
          : mode === "meal_photo"
            ? "Estimación guiada de plato por foto + descripción"
            : "Búsqueda manual por nombre o marca";

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
              subtitle="Busca por nombre o marca y registra rápido"
              onPress={startManualFlow}
            />
            {favoriteProducts.length ? (
              <AppCard>
                <SectionHeader title="Favoritos" subtitle="Tus alimentos guardados" />
                <View style={styles.portionQuickRow}>
                  {favoriteProducts.map((item) => (
                    <Pressable key={item.product.id} style={styles.portionQuickChip} onPress={() => selectFavoriteProduct(item)}>
                      <Text style={styles.portionQuickChipText}>{item.product.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </AppCard>
            ) : null}
            {recentProducts.length ? (
              <AppCard>
                <SectionHeader title="Últimos productos" subtitle="Acceso rápido reciente" />
                <View style={styles.portionQuickRow}>
                  {recentProducts.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.portionQuickChip}
                      onPress={() => {
                        startManualFlow();
                        setManualSearch(item.name);
                      }}
                    >
                      <Text style={styles.portionQuickChipText}>{item.name}</Text>
                    </Pressable>
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
          <>
            {mealStep === "compose" ? (
              <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Estimar comida por foto</Text>
                  <Text style={styles.helperText}>1) Sube una foto 2) revisa preview 3) genera preguntas.</Text>
                  {mealPhotos[0] ? (
                    <View style={styles.mealPhotoPreviewWrap}>
                      <Image source={{ uri: mealPhotos[0] }} style={styles.mealPhotoPreviewImage} resizeMode="contain" />
                    </View>
                  ) : (
                    <View style={styles.mealPhotoPreviewEmpty}>
                      <Text style={styles.helperText}>Aún no hay foto seleccionada.</Text>
                    </View>
                  )}
                  <View style={styles.portionQuickRow}>
                    <SecondaryButton title={mealPhotos[0] ? "Cambiar foto" : "Tomar foto"} onPress={() => void captureMealPhoto()} />
                    <SecondaryButton title="Subir imagen" onPress={() => void pickMealPhotoFromLibrary()} />
                  </View>
                  {mealPhotos[0] ? <SecondaryButton title="Eliminar foto" onPress={removeMealPhoto} /> : null}
                  <InputField
                    label="Descripción (opcional)"
                    value={mealDescription}
                    onChangeText={(value) => {
                      setMealDescription(value);
                      setMealPreview(null);
                    }}
                    placeholder="Describe la comida (ej: arroz con pollo y mayonesa)"
                  />
                  <Text style={styles.helperText}>Una breve descripción mejora la precisión.</Text>
                  <PrimaryButton title="Generar preguntas" onPress={() => void runMealQuestions()} loading={saving} disabled={!mealPhotos[0]} />
                  <SecondaryButton title="Volver" onPress={resetToHub} disabled={saving} />
                </View>
              </ScrollView>
            ) : null}

            {mealStep === "questions" ? (
              <View style={styles.mealQuestionScreen}>
                <ScrollView contentContainerStyle={styles.mealQuestionContent} keyboardShouldPersistTaps="handled">
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Ayúdame a afinar la estimación</Text>
                    <Text style={styles.helperText}>Responde 2-3 preguntas para mejorar la precisión.</Text>
                  </View>
                  {mealQuestions.map((question) => (
                    <View key={question.id} style={styles.mealQuestionCard}>
                      <Text style={styles.mealQuestionPrompt}>{question.prompt}</Text>
                      {question.answer_type === "single_choice" ? (
                        <View style={styles.methodRow}>
                          {question.options.map((option) => {
                            const active = (mealQuestionAnswers[question.id] ?? "") === option;
                            return (
                              <Pressable
                                key={`${question.id}-${option}`}
                                style={[styles.methodChip, active && styles.methodChipActive]}
                                onPress={() =>
                                  setMealQuestionAnswers((current) => ({
                                    ...current,
                                    [question.id]: option,
                                  }))
                                }
                              >
                                <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>{option}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <TextInput
                          value={mealQuestionAnswers[question.id] ?? ""}
                          onChangeText={(value) =>
                            setMealQuestionAnswers((current) => ({
                              ...current,
                              [question.id]: value,
                            }))
                          }
                          keyboardType={question.answer_type === "number" ? "numeric" : "default"}
                          style={styles.quantityInput}
                          placeholder={question.placeholder ?? "Respuesta"}
                          placeholderTextColor={theme.muted}
                        />
                      )}
                    </View>
                  ))}
                  {mealIngredients.length > 0 ? (
                    <Text style={styles.helperText}>Detectado: {mealIngredients.join(", ")}</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.bottomActionBar}>
                  <SecondaryButton title="Volver" onPress={() => setMealStep("compose")} disabled={saving} />
                  <PrimaryButton
                    title="Calcular estimación"
                    onPress={() => void runMealPreview()}
                    loading={saving}
                    disabled={mealQuestions.some((item) => !(mealQuestionAnswers[item.id] ?? "").trim())}
                  />
                </View>
              </View>
            ) : null}

            {mealStep === "result" && mealPreview ? (
              <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Estimación nutricional</Text>
                  <TagChip
                    label={`Confianza ${mealPreview.confidence_level}`}
                    tone={mealPreview.confidence_level === "high" ? "accent" : mealPreview.confidence_level === "low" ? "danger" : "warning"}
                  />
                  {mealPhotos[0] ? <Image source={{ uri: mealPhotos[0] }} style={styles.mealResultImage} resizeMode="cover" /> : null}
                  <TagChip label="Estimado (no exacto)" tone="warning" />
                  <View style={styles.mealMetricsGrid}>
                    <View style={styles.mealMetricCard}>
                      <Text style={styles.mealMetricLabel}>kcal</Text>
                      <Text style={[styles.mealMetricValue, { color: theme.kcal }]}>
                        {Math.round(mealPreview.preview_nutrients.kcal)}
                      </Text>
                    </View>
                    <View style={styles.mealMetricCard}>
                      <Text style={styles.mealMetricLabel}>proteína</Text>
                      <Text style={[styles.mealMetricValue, { color: theme.protein }]}>
                        {Math.round(mealPreview.preview_nutrients.protein_g)} g
                      </Text>
                    </View>
                    <View style={styles.mealMetricCard}>
                      <Text style={styles.mealMetricLabel}>grasas</Text>
                      <Text style={[styles.mealMetricValue, { color: theme.fats }]}>
                        {Math.round(mealPreview.preview_nutrients.fat_g)} g
                      </Text>
                    </View>
                    <View style={styles.mealMetricCard}>
                      <Text style={styles.mealMetricLabel}>carbs</Text>
                      <Text style={[styles.mealMetricValue, { color: theme.carbs }]}>
                        {Math.round(mealPreview.preview_nutrients.carbs_g)} g
                      </Text>
                    </View>
                  </View>
                  <View style={styles.portionQuickRow}>
                    <Pressable style={styles.portionQuickChip} onPress={() => void runMealPreview(-10)}>
                      <Text style={styles.portionQuickChipText}>-10%</Text>
                    </Pressable>
                    <Pressable style={styles.portionQuickChip} onPress={() => void runMealPreview(0)}>
                      <Text style={styles.portionQuickChipText}>OK</Text>
                    </Pressable>
                    <Pressable style={styles.portionQuickChip} onPress={() => void runMealPreview(10)}>
                      <Text style={styles.portionQuickChipText}>+10%</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.helperText}>Ajuste actual: {mealAdjust > 0 ? `+${mealAdjust}` : mealAdjust}%</Text>
                  {mealIngredients.length ? (
                    <Text style={styles.helperText}>Estimado a partir de: {mealIngredients.join(", ")}</Text>
                  ) : null}
                  {mealAssumptions.length
                    ? mealAssumptions.map((assumption) => (
                        <Text key={assumption} style={styles.helperText}>
                          · {assumption}
                        </Text>
                      ))
                    : null}
                  <PrimaryButton title="Guardar consumo" onPress={() => void saveMealEstimate()} loading={saving} />
                  <SecondaryButton title="Cambiar foto" onPress={() => setMealStep("compose")} disabled={saving} />
                  <SecondaryButton title="Volver a Añadir" onPress={resetToHub} disabled={saving} />
                </View>
              </ScrollView>
            ) : null}
          </>
        ) : null}

        {mode === "manual" ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Buscar alimento</Text>
              <InputField
                label="Nombre o marca"
                value={manualSearch}
                onChangeText={(value) => {
                  setManualSearch(value);
                  setManualHasSearched(false);
                  if (!value.trim()) {
                    setManualResults([]);
                  }
                }}
                placeholder="Ej: Danone natural"
              />
              <Text style={styles.helperText}>Escribe el nombre y buscamos coincidencias por nombre o marca (no exactas).</Text>
              <PrimaryButton title="Buscar por nombre" onPress={() => void searchManualFoods()} loading={searchingFoods} />
              {manualResults.length ? (
                <View style={styles.searchResultsWrap}>
                  {manualResults.map((item) => (
                    <Pressable
                      key={`${item.product.id}-${item.badge}-${item.origin}`}
                      style={styles.searchResultRow}
                      onPress={() => void selectManualResult(item)}
                    >
                      {item.product.image_url ? (
                        <Image source={{ uri: item.product.image_url }} style={styles.searchResultImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.searchResultImagePlaceholder}>
                          <Text style={styles.searchResultImagePlaceholderText}>IMG</Text>
                        </View>
                      )}
                      <View style={styles.searchResultTextWrap}>
                        <Text style={styles.searchResultTitle}>{item.product.name}</Text>
                        <Text style={styles.searchResultSubtitle}>
                          {item.product.brand ?? "Sin marca"} · {Math.round(item.product.kcal)} kcal
                        </Text>
                      </View>
                      <View style={styles.searchResultBadgeWrap}>
                        <TagChip label={item.badge} tone={searchBadgeTone(item.badge)} />
                        {isUserCreatedProduct(item) ? <TagChip label="Creado por usuario" tone="default" /> : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {manualHasSearched && !searchingFoods && manualResults.length === 0 ? (
                <EmptyState title="Sin resultados" subtitle="Prueba otro nombre o marca. También puedes crear el alimento en comunidad." />
              ) : null}

              <SectionHeader
                title="Crear y compartir alimento"
                subtitle="Se guarda en la base global para que otros usuarios lo puedan buscar"
              />
              <SecondaryButton
                title={showManualCreateForm ? "Ocultar formulario" : "Crear producto comunidad"}
                onPress={() => setShowManualCreateForm((current) => !current)}
                disabled={saving}
              />
              {showManualCreateForm ? (
                <>
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
                </>
              ) : null}
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
              <SecondaryButton
                title={favoriteProductIds.has(product.id) ? "Quitar de favoritos" : "Guardar en favoritos"}
                onPress={() => void toggleFavoriteForCurrentProduct()}
                disabled={saving}
              />
              <SecondaryButton title="Corregir valores con foto de etiqueta" onPress={openCorrectionFromProduct} disabled={saving} />
              <SecondaryButton title="Escanear otro" onPress={() => void startBarcodeFlow()} disabled={saving} />
              <SecondaryButton title="Volver a Añadir" onPress={resetToHub} disabled={saving} />
            </View>
          </ScrollView>
        ) : null}
      </View>
      {toastFeedback ? <ToastFeedback kind={toastFeedback.kind} message={toastFeedback.message} /> : null}
    </SafeAreaView>
  );
}

function BottomTabIcon(props: { tab: Exclude<MainTab, "add">; active: boolean }) {
  const color = props.active ? theme.text : "#7d7d86";
  const strokeWidth = 1.8;

  if (props.tab === "dashboard") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={4} width={6} height={6} rx={1.4} stroke={color} strokeWidth={strokeWidth} />
        <Rect x={14} y={4} width={6} height={6} rx={1.4} stroke={color} strokeWidth={strokeWidth} />
        <Rect x={4} y={14} width={6} height={6} rx={1.4} stroke={color} strokeWidth={strokeWidth} />
        <Rect x={14} y={14} width={6} height={6} rx={1.4} stroke={color} strokeWidth={strokeWidth} />
      </Svg>
    );
  }

  if (props.tab === "body") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={5.3} r={2.2} stroke={color} strokeWidth={strokeWidth} />
        <Line x1={12} y1={7.8} x2={12} y2={14.3} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1={8.5} y1={10.6} x2={15.5} y2={10.6} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1={10.3} y1={14.3} x2={10.3} y2={19.3} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1={13.7} y1={14.3} x2={13.7} y2={19.3} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    );
  }

  if (props.tab === "history") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Line x1={4} y1={20} x2={20} y2={20} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Rect x={6} y={13} width={3} height={7} rx={1} fill={color} />
        <Rect x={11} y={10} width={3} height={10} rx={1} fill={color} />
        <Rect x={16} y={6} width={3} height={14} rx={1} fill={color} />
      </Svg>
    );
  }

  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.5} />
      <Path
        d="M3.66122 10.6392C4.13377 10.9361 4.43782 11.4419 4.43782 11.9999C4.43781 12.558 4.13376 13.0638 3.66122 13.3607C3.33966 13.5627 3.13248 13.7242 2.98508 13.9163C2.66217 14.3372 2.51966 14.869 2.5889 15.3949C2.64082 15.7893 2.87379 16.1928 3.33973 16.9999C3.80568 17.8069 4.03865 18.2104 4.35426 18.4526C4.77508 18.7755 5.30694 18.918 5.83284 18.8488C6.07287 18.8172 6.31628 18.7185 6.65196 18.5411C7.14544 18.2803 7.73558 18.2699 8.21895 18.549C8.70227 18.8281 8.98827 19.3443 9.00912 19.902C9.02332 20.2815 9.05958 20.5417 9.15224 20.7654C9.35523 21.2554 9.74458 21.6448 10.2346 21.8478C10.6022 22 11.0681 22 12 22C12.9319 22 13.3978 22 13.7654 21.8478C14.2554 21.6448 14.6448 21.2554 14.8478 20.7654C14.9404 20.5417 14.9767 20.2815 14.9909 19.9021C15.0117 19.3443 15.2977 18.8281 15.7811 18.549C16.2644 18.27 16.8545 18.2804 17.3479 18.5412C17.6837 18.7186 17.9271 18.8173 18.1671 18.8489C18.693 18.9182 19.2249 18.7756 19.6457 18.4527C19.9613 18.2106 20.1943 17.807 20.6603 17C20.8677 16.6407 21.029 16.3614 21.1486 16.1272M20.3387 13.3608C19.8662 13.0639 19.5622 12.5581 19.5621 12.0001C19.5621 11.442 19.8662 10.9361 20.3387 10.6392C20.6603 10.4372 20.8674 10.2757 21.0148 10.0836C21.3377 9.66278 21.4802 9.13092 21.411 8.60502C21.3591 8.2106 21.1261 7.80708 20.6601 7.00005C20.1942 6.19301 19.9612 5.7895 19.6456 5.54732C19.2248 5.22441 18.6929 5.0819 18.167 5.15113C17.927 5.18274 17.6836 5.2814 17.3479 5.45883C16.8544 5.71964 16.2643 5.73004 15.781 5.45096C15.2977 5.1719 15.0117 4.6557 14.9909 4.09803C14.9767 3.71852 14.9404 3.45835 14.8478 3.23463C14.6448 2.74458 14.2554 2.35523 13.7654 2.15224C13.3978 2 12.9319 2 12 2C11.0681 2 10.6022 2 10.2346 2.15224C9.74458 2.35523 9.35523 2.74458 9.15224 3.23463C9.05958 3.45833 9.02332 3.71848 9.00912 4.09794C8.98826 4.65566 8.70225 5.17191 8.21891 5.45096C7.73557 5.73002 7.14548 5.71959 6.65205 5.4588C6.31633 5.28136 6.0729 5.18269 5.83285 5.15108C5.30695 5.08185 4.77509 5.22436 4.35427 5.54727C4.03866 5.78945 3.80569 6.19297 3.33974 7C3.13231 7.35929 2.97105 7.63859 2.85138 7.87273"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function QuickAddIcon(props: { action: QuickAddAction }) {
  if (props.action === "manual") {
    return (
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <Circle cx={10.5} cy={10.5} r={5.5} stroke="#0b1220" strokeWidth={2} />
        <Line x1={14.8} y1={14.8} x2={20} y2={20} stroke="#0b1220" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    );
  }
  if (props.action === "barcode") {
    return (
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={4} width={2} height={16} rx={0.5} fill="#0b1220" />
        <Rect x={7} y={4} width={1.5} height={16} rx={0.5} fill="#0b1220" />
        <Rect x={10} y={4} width={3} height={16} rx={0.6} fill="#0b1220" />
        <Rect x={14.5} y={4} width={1.5} height={16} rx={0.5} fill="#0b1220" />
        <Rect x={18} y={4} width={3} height={16} rx={0.6} fill="#0b1220" />
      </Svg>
    );
  }
  if (props.action === "meal_photo") {
    return (
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={6} width={18} height={13} rx={3} stroke="#0b1220" strokeWidth={2} />
        <Circle cx={12} cy={12.5} r={3.2} stroke="#0b1220" strokeWidth={2} />
        <Rect x={7.2} y={4.2} width={3.8} height={2.5} rx={1} fill="#0b1220" />
      </Svg>
    );
  }
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={4} width={14} height={16} rx={2.3} stroke="#0b1220" strokeWidth={2} />
      <Line x1={8} y1={9} x2={16} y2={9} stroke="#0b1220" strokeWidth={2} strokeLinecap="round" />
      <Line x1={8} y1={13} x2={16} y2={13} stroke="#0b1220" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function QuickAddCard(props: { action: QuickAddAction; title: string; subtitle: string; onPress: () => void; accent: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.quickAddCard, pressed && styles.quickAddCardPressed]} onPress={props.onPress}>
      <View style={[styles.quickAddIconWrap, { backgroundColor: props.accent }]}>
        <QuickAddIcon action={props.action} />
      </View>
      <Text style={styles.quickAddTitle}>{props.title}</Text>
      <Text style={styles.quickAddSubtitle}>{props.subtitle}</Text>
    </Pressable>
  );
}

function MainAppTabs() {
  const [tab, setTab] = useState<MainTab>("dashboard");
  const [visibleTab, setVisibleTab] = useState<MainTab>("dashboard");
  const [incomingTab, setIncomingTab] = useState<MainTab | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [launchAction, setLaunchAction] = useState<AddLaunchAction | null>(null);
  const quickAddAnim = useRef(new Animated.Value(0)).current;
  const tabTransition = useRef(new Animated.Value(1)).current;

  const tabs: Array<{ value: MainTab; label: string; center?: boolean }> = [
    { value: "dashboard", label: "Panel" },
    { value: "body", label: "Body" },
    { value: "add", label: "", center: true },
    { value: "history", label: "Historial" },
    { value: "settings", label: "Ajustes" },
  ];

  const openQuickAdd = useCallback(() => {
    if (quickAddOpen) {
      return;
    }
    setQuickAddVisible(true);
    setQuickAddOpen(true);
    quickAddAnim.stopAnimation();
    Animated.spring(quickAddAnim, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.95,
      useNativeDriver: true,
    }).start();
  }, [quickAddAnim, quickAddOpen]);

  const closeQuickAdd = useCallback(
    (onClosed?: () => void) => {
      if (!quickAddVisible) {
        onClosed?.();
        return;
      }
      setQuickAddOpen(false);
      quickAddAnim.stopAnimation();
      Animated.timing(quickAddAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setQuickAddVisible(false);
        }
        onClosed?.();
      });
    },
    [quickAddAnim, quickAddVisible],
  );

  const runQuickAction = (action: QuickAddAction) => {
    closeQuickAdd(() => {
      setLaunchAction({
        requestId: Date.now(),
        action,
      });
      switchTab("add");
    });
  };

  const switchTab = useCallback(
    (nextTab: MainTab) => {
      if ((nextTab === tab && !incomingTab) || nextTab === incomingTab) {
        return;
      }
      setTab(nextTab);
      setIncomingTab(nextTab);
      tabTransition.stopAnimation();
      tabTransition.setValue(0);
      Animated.timing(tabTransition, {
        toValue: 1,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }
        setVisibleTab(nextTab);
        setIncomingTab(null);
        tabTransition.setValue(1);
      });
    },
    [incomingTab, tab, tabTransition],
  );

  const launchActionFromPanel = useCallback(
    (action: QuickAddAction) => {
      closeQuickAdd(() => {
        setLaunchAction({
          requestId: Date.now(),
          action,
        });
        switchTab("add");
      });
    },
    [closeQuickAdd, switchTab],
  );

  const toggleQuickAdd = useCallback(() => {
    if (quickAddOpen) {
      closeQuickAdd();
      return;
    }
    openQuickAdd();
  }, [closeQuickAdd, openQuickAdd, quickAddOpen]);

  const quickAddSheetTranslate = quickAddAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [360, 0],
  });
  const quickAddSheetScale = quickAddAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const quickAddBackdropOpacity = quickAddAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const quickAddPlusRotate = quickAddAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  const renderTabScene = useCallback(
    (activeTab: MainTab): ReactElement | null => {
      if (activeTab === "dashboard") {
        return <DashboardScreen onOpenBodyProgress={() => switchTab("body")} onQuickAddAction={launchActionFromPanel} />;
      }
      if (activeTab === "add") {
        return (
          <AddScreen
            launchAction={launchAction}
            onLaunchActionHandled={(requestId) => {
              setLaunchAction((current) => {
                if (!current || current.requestId !== requestId) {
                  return current;
                }
                return null;
              });
            }}
          />
        );
      }
      if (activeTab === "body") {
        return <BodyProgressScreen />;
      }
      if (activeTab === "history") {
        return <HistoryScreen />;
      }
      if (activeTab === "settings") {
        return <SettingsScreen />;
      }
      return null;
    },
    [launchAction, launchActionFromPanel, switchTab],
  );

  const outgoingOpacity = tabTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.crossfadeHost}>
        <Animated.View style={[styles.crossfadeLayer, incomingTab ? { opacity: outgoingOpacity } : null]} pointerEvents={incomingTab ? "none" : "auto"}>
          {renderTabScene(visibleTab)}
        </Animated.View>
        {incomingTab ? (
          <Animated.View style={[styles.crossfadeLayer, { opacity: tabTransition }]}>{renderTabScene(incomingTab)}</Animated.View>
        ) : null}
      </View>

      <View style={styles.tabBar}>
        {tabs.map(({ value, label, center }) => {
          const active = tab === value;
          const isCenter = Boolean(center);
          return (
            <Pressable
              key={value}
              onPress={() => {
                if (isCenter) {
                  toggleQuickAdd();
                  return;
                }
                closeQuickAdd(() => switchTab(value));
              }}
              style={({ pressed }) => [
                styles.tabItem,
                isCenter && styles.tabItemCenter,
                active && !isCenter && styles.tabItemActive,
                pressed && styles.tabItemPressed,
              ]}
            >
              {isCenter ? (
                <View style={[styles.tabPlusButton, quickAddOpen && styles.tabPlusButtonActive]}>
                  <Animated.Text style={[styles.tabPlusText, { transform: [{ rotate: quickAddPlusRotate }] }]}>+</Animated.Text>
                </View>
              ) : (
                <>
                  <BottomTabIcon tab={value as Exclude<MainTab, "add">} active={active} />
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
      {quickAddVisible ? (
        <View style={styles.quickAddLayer} pointerEvents="box-none">
          <Pressable style={styles.quickAddBackdrop} onPress={() => closeQuickAdd()}>
            <Animated.View style={[styles.quickAddScrim, { opacity: quickAddBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.quickAddSheetContainer,
              {
                opacity: quickAddAnim,
                transform: [{ translateY: quickAddSheetTranslate }, { scale: quickAddSheetScale }],
              },
            ]}
          >
            <Pressable style={styles.quickAddSheet} onPress={() => {}}>
              <Text style={styles.quickAddSheetTitle}>Añadir rápido</Text>
              <View style={styles.quickAddGrid}>
                <QuickAddCard
                  action="manual"
                  title="Registrar alimento"
                  subtitle="Buscar por nombre o marca"
                  accent="#4da3ff"
                  onPress={() => runQuickAction("manual")}
                />
                <QuickAddCard
                  action="barcode"
                  title="Escanear código"
                  subtitle="Escaneo de código de barras"
                  accent="#ff5d93"
                  onPress={() => runQuickAction("barcode")}
                />
                <QuickAddCard
                  action="meal_photo"
                  title="Foto de comida"
                  subtitle="Estimación nutricional por foto"
                  accent="#6ae8d3"
                  onPress={() => runQuickAction("meal_photo")}
                />
                <QuickAddCard
                  action="label_fix"
                  title="Corregir etiqueta"
                  subtitle="Actualizar valores con foto"
                  accent="#ffcf6b"
                  onPress={() => runQuickAction("label_fix")}
                />
              </View>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function RootNavigator() {
  const auth = useAuth();
  const rootTransition = useRef(new Animated.Value(1)).current;

  const targetRoute = useMemo(() => {
    if (auth.loading) {
      return "loading" as const;
    }
    if (!auth.user && !auth.pendingVerificationEmail) {
      return "auth" as const;
    }
    if ((auth.user && !auth.user.email_verified) || auth.pendingVerificationEmail) {
      return "verify" as const;
    }
    if (auth.user && auth.user.email_verified && !auth.user.onboarding_completed) {
      return "onboarding" as const;
    }
    return "main" as const;
  }, [auth.loading, auth.pendingVerificationEmail, auth.user]);

  const [visibleRoute, setVisibleRoute] = useState(targetRoute);
  const [incomingRoute, setIncomingRoute] = useState<typeof targetRoute | null>(null);

  useEffect(() => {
    if ((targetRoute === visibleRoute && !incomingRoute) || targetRoute === incomingRoute) {
      return;
    }
    setIncomingRoute(targetRoute);
    rootTransition.stopAnimation();
    rootTransition.setValue(0);
    Animated.timing(rootTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setVisibleRoute(targetRoute);
      setIncomingRoute(null);
      rootTransition.setValue(1);
    });
  }, [incomingRoute, rootTransition, targetRoute, visibleRoute]);

  const renderRootRoute = useCallback(
    (route: typeof targetRoute): ReactElement => {
      if (route === "loading") {
        return <LoadingGate />;
      }
      if (route === "auth") {
        return <AuthStack />;
      }
      if (route === "verify") {
        return <VerifyEmailOnlyScreen />;
      }
      if (route === "onboarding") {
        return <OnboardingWizard />;
      }
      return <MainAppTabs />;
    },
    [],
  );

  const outgoingOpacity = rootTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={styles.crossfadeHost}>
      <Animated.View style={[styles.crossfadeLayer, incomingRoute ? { opacity: outgoingOpacity } : null]} pointerEvents={incomingRoute ? "none" : "auto"}>
        {renderRootRoute(visibleRoute)}
      </Animated.View>
      {incomingRoute ? (
        <Animated.View style={[styles.crossfadeLayer, { opacity: rootTransition }]}>{renderRootRoute(incomingRoute)}</Animated.View>
      ) : null}
    </View>
  );
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
  crossfadeHost: {
    flex: 1,
    position: "relative",
    backgroundColor: theme.bg,
  },
  crossfadeLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.bg,
  },
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
    gap: 5,
  },
  headerTitle: {
    color: theme.text,
    ...type.h1,
  },
  headerSubtitle: {
    color: theme.muted,
    ...type.body,
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
    ...type.h1,
  },
  brandText: {
    color: theme.muted,
    ...type.body,
  },
  fieldWrap: {
    gap: 7,
  },
  fieldLabel: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.text,
    backgroundColor: "#151515",
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: theme.accent,
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: 17,
    minHeight: 50,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ffffff",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonText: {
    color: "#050505",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    minHeight: 46,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panelSoft,
  },
  secondaryButtonPressed: {
    backgroundColor: "#1e1e1e",
    transform: [{ scale: 0.985 }],
  },
  secondaryButtonText: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 14,
  },
  ghostButton: {
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ghostButtonText: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
  helperText: {
    color: theme.muted,
    ...type.body,
  },
  passwordStrengthWrap: {
    marginTop: -4,
    gap: 6,
  },
  passwordStrengthTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#2b2b2f",
    overflow: "hidden",
  },
  passwordStrengthFill: {
    height: "100%",
    borderRadius: 999,
  },
  passwordStrengthText: {
    fontSize: 12,
    fontWeight: "700",
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
  chipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#222222",
    backgroundColor: "#121212",
    padding: 17,
    gap: 13,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  heroCardShell: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#0f1012",
    borderColor: "#2b2d31",
  },
  sectionHeaderWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeaderLeft: {
    flex: 1,
    gap: 3,
  },
  sectionHeaderTitle: {
    color: theme.text,
    ...type.h3,
  },
  sectionHeaderSubtitle: {
    color: theme.muted,
    ...type.caption,
  },
  sectionHeaderAction: {
    borderWidth: 0,
    backgroundColor: "transparent",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  sectionHeaderActionPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sectionHeaderActionText: {
    color: "#d6d6d6",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
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
  inlineInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
  },
  inlineInfoLabel: {
    color: theme.muted,
    ...type.caption,
  },
  inlineInfoValue: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.1,
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
  avatarPressable: {
    borderRadius: 999,
  },
  avatarPressablePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  avatarText: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
  },
  accountMenuLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
    paddingTop: 68,
    alignItems: "flex-end",
  },
  accountMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  accountMenuScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.44)",
  },
  accountMenuContainer: {
    width: "86%",
    maxWidth: 340,
  },
  accountMenuCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: "#15181f",
    padding: 14,
    gap: 10,
  },
  accountMenuTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  emptyStateCard: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: "#111214",
    borderColor: "#2a2c30",
    minHeight: 128,
    gap: 7,
  },
  emptyStateTitle: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    color: theme.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
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
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
    paddingBottom: 104,
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
    ...type.h2,
  },
  dashboardDate: {
    color: theme.muted,
    ...type.caption,
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
    ...type.display,
  },
  heroRemainingSub: {
    color: theme.muted,
    ...type.body,
  },
  heroMiniGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  heroMiniCard: {
    flex: 1,
    minWidth: 86,
    borderWidth: 1,
    borderColor: "#2c2f35",
    borderRadius: 14,
    backgroundColor: "#14161a",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  heroMiniLabel: {
    color: theme.muted,
    ...type.caption,
  },
  heroMiniValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.1,
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
  dashboardActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dashboardActionCard: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 16,
    backgroundColor: "#171717",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 5,
    minHeight: 108,
  },
  dashboardActionCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  dashboardActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  dashboardActionWeightIcon: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  dashboardActionTitle: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 14,
  },
  dashboardActionSubtitle: {
    color: theme.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  macroToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentedWrap: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#121316",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2a2d31",
    padding: 4,
  },
  segmentedItem: {
    flex: 1,
    minHeight: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  segmentedItemPressed: {
    opacity: 0.88,
  },
  segmentedItemActive: {
    backgroundColor: "#252932",
  },
  segmentedText: {
    color: theme.muted,
    ...type.caption,
  },
  segmentedTextActive: {
    color: theme.text,
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
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  streakFlame: {
    width: 54,
    height: 54,
    borderRadius: 12,
  },
  streakTextWrap: {
    flex: 1,
    gap: 2,
  },
  streakDaysValue: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 28,
  },
  streakDaysSub: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  bodyPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  bodyPageHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  bodyPageTitle: {
    color: theme.text,
    ...type.h1,
  },
  bodyPageSubtitle: {
    color: theme.muted,
    ...type.body,
  },
  bodyHeaderActionBtn: {
    borderWidth: 1,
    borderColor: "#2b2b2b",
    borderRadius: 14,
    backgroundColor: "#161616",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  bodyHeaderActionBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  bodyHeaderActionText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
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
  bodySummaryHero: {
    backgroundColor: "#0e1014",
    borderColor: "#2f333b",
  },
  bodySummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
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
    fontSize: 17,
    fontWeight: "800",
  },
  metricTileSubtitle: {
    color: theme.muted,
    fontSize: 11,
  },
  weightChartWrap: {
    minHeight: 126,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 16,
    backgroundColor: "#161616",
    padding: 11,
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
    borderColor: "#2b2b2b",
    borderRadius: 14,
    backgroundColor: "#171717",
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
    borderColor: "#2b2b2b",
    borderRadius: 14,
    backgroundColor: "#151515",
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
    borderColor: "#2a2d31",
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#141518",
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
    backgroundColor: theme.kcal,
  },
  intakeMain: {
    flex: 1,
    gap: 2,
  },
  intakeName: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 14,
  },
  intakeMeta: {
    color: theme.muted,
    ...type.caption,
  },
  intakeKcal: {
    color: theme.kcal,
    fontWeight: "800",
    fontSize: 13,
  },
  intakeRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  intakeDeleteBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  intakeDeleteText: {
    color: theme.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#141518",
    borderWidth: 1,
    borderColor: "#25282e",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
  historyCalendarCard: {
    gap: 16,
    backgroundColor: "#111111",
  },
  historyCalendarTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 0,
  },
  historyCalendarTitleWrap: {
    flex: 1,
    gap: 2,
  },
  historyCalendarTitle: {
    color: theme.text,
    ...type.h2,
  },
  historyCalendarSubtitle: {
    color: "#95959d",
    ...type.caption,
  },
  historyCalendarReloadBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
  },
  historyCalendarReloadBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  historyCalendarReloadText: {
    color: "#dfdfe2",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  historyCalendarMonthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 2,
  },
  historyCalendarArrowTouch: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCalendarArrowTouchPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
    transform: [{ scale: 0.96 }],
  },
  historyCalendarLoadingRow: {
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCalendarStreakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  historyCalendarStreakBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  historyCalendarStreakBadgeIdle: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  historyCalendarStreakTextWrap: {
    flex: 1,
    gap: 0,
  },
  historyCalendarStreakTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  historyCalendarStreakSubtitle: {
    color: "#9a9aa2",
    fontSize: 10,
    fontWeight: "600",
  },
  historyCalendarStreakMetric: {
    minWidth: 56,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 0,
  },
  historyCalendarStreakDays: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  historyCalendarStreakDaysLabel: {
    color: "#a5a5ae",
    fontSize: 10,
    fontWeight: "700",
  },
  historyWeekDaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 7,
    marginTop: 0,
  },
  historyWeekDayLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#7e7e86",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  historyCalendarMonthLabel: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    textTransform: "capitalize",
  },
  historyCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 2,
  },
  historyCalendarCellEmpty: {
    width: "13.2%",
    aspectRatio: 1,
    borderRadius: 12,
    opacity: 0.25,
  },
  historyCalendarCell: {
    width: "13.2%",
    aspectRatio: 1,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
    backgroundColor: "#131313",
    paddingHorizontal: 6,
    paddingVertical: 5,
    justifyContent: "space-between",
  },
  historyCalendarCellPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  historyCalendarCellFilled: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#171717",
  },
  historyCalendarCellHasWeight: {
    backgroundColor: "#151a1f",
  },
  historyCalendarCellToday: {
    borderColor: "rgba(255,255,255,0.28)",
  },
  historyCalendarCellActive: {
    borderColor: "rgba(255,255,255,0.94)",
    backgroundColor: "#1d1d1d",
    shadowColor: "#ffffff",
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  historyCalendarDayText: {
    color: "#d9d9de",
    fontSize: 12,
    fontWeight: "700",
  },
  historyCalendarDayTextToday: {
    color: "#ffffff",
    fontWeight: "700",
  },
  historyCalendarDayTextActive: {
    color: theme.text,
    fontWeight: "800",
  },
  historyCalendarMarkerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 10,
    gap: 4,
  },
  historyCalendarFoodDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#ededf0",
  },
  historyCalendarWeightDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.kcal,
    backgroundColor: "transparent",
  },
  historyLegendRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 4,
    marginBottom: 2,
  },
  historyLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyLegendIntakeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#f4f4f4",
  },
  historyLegendWeightDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.kcal,
    borderWidth: 1,
    borderColor: theme.border,
  },
  historyLegendText: {
    color: "#8d8d95",
    fontSize: 11,
    fontWeight: "600",
  },
  historyCalendarEmptyText: {
    color: theme.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 10,
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
  historyDeleteBtn: {
    alignSelf: "flex-end",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  historyDeleteText: {
    color: theme.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  historyDetailList: {
    gap: 8,
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
  settingsInlineActions: {
    gap: 8,
    marginTop: 2,
  },
  settingsHeroCard: {
    gap: 10,
    backgroundColor: "#0f1115",
    borderColor: "#2a2f38",
  },
  settingsStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  settingsCollapsedSummary: {
    gap: 3,
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
  addActionCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
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
  mealPhotoPreviewWrap: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#0a0a0a",
    minHeight: 250,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  mealPhotoPreviewImage: {
    width: "100%",
    height: 280,
    backgroundColor: "#0a0a0a",
  },
  mealPhotoPreviewEmpty: {
    width: "100%",
    minHeight: 190,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  mealQuestionScreen: {
    flex: 1,
  },
  mealQuestionContent: {
    paddingBottom: 120,
    gap: 10,
  },
  mealQuestionCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    backgroundColor: theme.panel,
    padding: 14,
    gap: 10,
  },
  mealQuestionPrompt: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  bottomActionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderColor: theme.border,
    backgroundColor: "rgba(10,10,10,0.96)",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 8,
  },
  mealResultImage: {
    width: "100%",
    height: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#0b0b0b",
  },
  mealMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mealMetricCard: {
    minWidth: 120,
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  mealMetricLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  mealMetricValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
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
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.panelSoft,
  },
  searchResultImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#0b0b0b",
  },
  searchResultImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultImagePlaceholderText: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  searchResultTextWrap: {
    flex: 1,
    gap: 3,
  },
  searchResultBadgeWrap: {
    alignItems: "flex-end",
    gap: 6,
    maxWidth: 120,
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
  toastWrap: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 96,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 100,
  },
  toastSuccess: {
    backgroundColor: "rgba(45,212,191,0.14)",
    borderColor: theme.kcal,
  },
  toastError: {
    backgroundColor: "rgba(244,143,143,0.12)",
    borderColor: theme.danger,
  },
  toastText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  quickAddLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 94,
  },
  quickAddBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  quickAddScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  quickAddSheetContainer: {
    width: "100%",
  },
  quickAddSheet: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 22,
    backgroundColor: "#16181f",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
  },
  quickAddSheetTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  quickAddGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickAddCard: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#2e323c",
    borderRadius: 16,
    backgroundColor: "#232732",
    minHeight: 156,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  quickAddCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  quickAddIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  quickAddTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  quickAddSubtitle: {
    color: theme.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#101010",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#252525",
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 9,
    gap: 0,
  },
  tabItem: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabItemCenter: {
    justifyContent: "center",
  },
  tabItemActive: {
    backgroundColor: "#252525",
  },
  tabItemPressed: {
    opacity: 0.86,
  },
  tabPlusButton: {
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f6ed3",
    backgroundColor: "#4da3ff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
    shadowColor: "#0f58ad",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  tabPlusButtonActive: {
    backgroundColor: "#63afff",
    borderColor: "#2d7fe2",
  },
  tabPlusText: {
    color: "#04101f",
    fontWeight: "800",
    fontSize: 32,
    lineHeight: 32,
    marginTop: -1,
  },
  tabText: {
    color: theme.muted,
    fontWeight: "700",
    fontSize: 10,
  },
  tabTextActive: {
    color: theme.text,
  },
});
