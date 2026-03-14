import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { BarcodeScanningResult, CameraView, type BarcodeType, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, G, Line, Path, Rect, SvgXml } from "react-native-svg";

import { BodyAvatarSvg } from "./components/BodyAvatarSvg";
import { I18nProvider, tGlobal, useI18n } from "./src/i18n";
import { deleteItem as deleteStoredItem, getItem as getStoredItem, setItem as setStoredItem } from "./src/platform/storage";
import { appendImageUriToFormData } from "./src/platform/upload";
import { createSocialApi } from "./src/social/api";
import { Comments } from "./src/social/components/Comments";
import { Composer } from "./src/social/components/Composer";
import { EditableStringListField } from "./src/social/components/EditableStringListField";
import { SocialFeedSkeleton } from "./src/social/components/FeedSkeleton";
import { SocialPostCard } from "./src/social/components/PostCard";
import {
  socialFeedSortLabel,
  socialFeedTypeFilterLabel,
  socialTypeLabel,
  socialTypeMeta,
} from "./src/social/presentation";
import type {
  SocialComment,
  SocialFeedResponse,
  SocialFeedSort,
  SocialFeedState,
  SocialFeedTypeFilter,
  SocialFriendRequest,
  SocialLikeToggleResponse,
  SocialOverview,
  SocialPost,
  SocialPostType,
  SocialProfileResponse,
  SocialProfileState,
  SocialProgressPayload,
  SocialRecipePayload,
  SocialSearchItem,
  SocialSegmentTab,
  SocialUser,
  SocialVisibility,
} from "./src/social/types";
import { FeedView } from "./src/social/views/FeedView";
import { FriendsView } from "./src/social/views/FriendsView";
import { ExploreView } from "./src/social/views/ExploreView";
import { ProfileView } from "./src/social/views/ProfileView";
import { RequestsView } from "./src/social/views/RequestsView";
import { themeForPlatform } from "./src/theme/colors";
import { AppLayout } from "./src/web/layouts/AppLayout";
import { AuthLayout } from "./src/web/layouts/AuthLayout";
import { OnboardingLayout } from "./src/web/layouts/OnboardingLayout";
import { PublicLayout } from "./src/web/layouts/PublicLayout";
import type { WebTopbarAccount, WebTopbarAction, WebTopbarNavItem } from "./src/web/components/WebTopbar";
import { WebRouterProvider, useWebRouter } from "./src/web/router";
import {
  appRouteForTab,
  isAppRoute,
  normalizeWebPath,
  parseSocialRoute,
  socialProfileRoute,
  socialRouteForSegment,
  tabFromAppRoute,
} from "./src/web/routes";

type NutritionBasis = "per_100g" | "per_100ml" | "per_serving";
type LookupSource = "local" | "openfoodfacts_imported" | "openfoodfacts_incomplete" | "not_found";
type IntakeMethod = "grams" | "percent_pack" | "units";
type Sex = "male" | "female" | "other";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "athlete";
type GoalType = "lose" | "maintain" | "gain";
type MainTab = "dashboard" | "add" | "body" | "social" | "history" | "settings";
type AddMode = "hub" | "barcode" | "label_fix" | "meal_photo" | "manual" | "recipes";
type QuickAddAction = "barcode" | "meal_photo" | "manual" | "recipes";
type AddLaunchAction = {
  requestId: number;
  action: QuickAddAction;
};
type AddBackTarget = "hub" | "barcode_camera" | "manual" | "recipes";
type AuthStackScreen = "welcome" | "signup" | "login";
type OnboardingStep = 1 | 2 | 3;
type WebSignupStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type WizardPrimaryGoal = "lose_weight" | "maintain_weight" | "gain_weight" | "gain_muscle" | "improve_nutrition" | "increase_steps";
type MeasurementSystem = "metric" | "imperial";

type AuthUser = {
  id: number;
  email: string;
  username: string;
  avatar_url: string | null;
  sex: Sex;
  birth_date: string | null;
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
  analysis_id: string | null;
  analysis_expires_at: string | null;
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

type MealEstimateOverride = {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
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
  protein_g: number;
  protein_goal_g: number | null;
  weight_kg: number | null;
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
  username: string;
  email_verified: boolean;
  onboarding_completed: boolean;
  message: string;
  debug_verification_code: string | null;
};

type UsernameAvailability = {
  username: string;
  available: boolean;
  reason: string | null;
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

type RecipeMealType = "breakfast" | "brunch" | "lunch" | "snack" | "dinner";

type RecipeIngredientItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

type UserRecipePayload = {
  title: string;
  meal_type: RecipeMealType;
  servings: number;
  prep_time_min: number | null;
  ingredients: RecipeIngredientItem[];
  steps: string[];
  tags: string[];
  nutrition_kcal: number;
  nutrition_protein_g: number;
  nutrition_carbs_g: number;
  nutrition_fat_g: number;
  default_quantity_units?: number;
};

type UserRecipe = UserRecipePayload & {
  id: number;
  generated_with_ai: boolean;
  coach_feedback: string | null;
  assumptions: string[];
  suggested_extras: string[];
  created_at: string;
  updated_at: string;
  product: Product;
  preferred_serving: ProductPreference | null;
};

type RecipeGenerateFeedback = {
  summary: string;
  highlights: string[];
  gaps: string[];
  tips: string[];
  suggested_extras: string[];
};

type RecipeGenerateResponse = {
  model_used: "gpt-4o-mini";
  recipe: UserRecipePayload;
  feedback: RecipeGenerateFeedback;
  assumptions: string[];
};

type RecipeAiOptionPreview = {
  option_id: string;
  title: string;
  meal_type: RecipeMealType;
  servings: number;
  prep_time_min: number | null;
  tags: string[];
  nutrition_kcal: number;
  nutrition_protein_g: number;
  nutrition_carbs_g: number;
  nutrition_fat_g: number;
  summary: string;
  highlights: string[];
  complexity: "low" | "medium" | "high";
  recommended: boolean;
  recommended_reason: string | null;
};

type RecipeAiOptionsResponse = {
  generation_id: string;
  model_used: "gpt-4o-mini";
  options: RecipeAiOptionPreview[];
};

type RecipeAiDetailResponse = RecipeGenerateResponse & {
  generation_id: string;
  option_id: string;
  recommended: boolean;
  recommended_reason: string | null;
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
  username: string;
  email: string;
  password: string;
  sex: Sex;
  birth_date: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type GoogleAuthInput = {
  credential: string;
  username?: string;
  sex?: Sex;
  birth_date?: string;
};

type WebSignupDraft = {
  step: WebSignupStep;
  displayName: string;
  primaryGoal: WizardPrimaryGoal;
  activityLevel: ActivityLevel;
  sex: Sex;
  birthDate: string;
  country: string;
  measurementSystem: MeasurementSystem;
  currentWeightKg: string;
  currentWeightLb: string;
  targetWeightKg: string;
  targetWeightLb: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weeklyGoalKg: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
  pendingFinalize: boolean;
};

type AuthContextValue = {
  loading: boolean;
  token: string | null;
  user: AuthUser | null;
  profile: Profile | null;
  apiBaseUrl: string;
  pendingVerificationEmail: string | null;
  otpHint: string | null;
  webSignupDraft: WebSignupDraft | null;
  register: (input: RegisterInput) => Promise<RegisterResponse>;
  checkUsernameAvailability: (username: string) => Promise<UsernameAvailability>;
  login: (input: LoginInput) => Promise<void>;
  googleSignIn: (input: GoogleAuthInput) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  clearPendingVerification: () => void;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  saveProfile: (payload: ProfileInput) => Promise<Profile>;
  uploadProfileAvatar: (photoUri: string) => Promise<AuthUser>;
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
  searchFoods: (query: string, limit?: number, signal?: AbortSignal) => Promise<FoodSearchResponse>;
  fetchMyCommunityFoods: (limit?: number) => Promise<Product[]>;
  fetchMyRecipes: (input?: { limit?: number; query?: string }) => Promise<UserRecipe[]>;
  fetchRecipe: (recipeId: number) => Promise<UserRecipe>;
  createRecipe: (payload: UserRecipePayload) => Promise<UserRecipe>;
  updateRecipe: (recipeId: number, payload: UserRecipePayload) => Promise<UserRecipe>;
  generateRecipe: (payload: {
    meal_type: RecipeMealType;
    target_kcal?: number;
    target_protein_g?: number;
    target_fat_g?: number;
    target_carbs_g?: number;
    goal_mode?: GoalType;
    use_only_ingredients: boolean;
    allergies?: string[];
    preferences?: string[];
    available_ingredients: RecipeIngredientItem[];
    allow_basic_pantry: boolean;
    locale?: "es" | "en";
  }) => Promise<RecipeGenerateResponse>;
  generateRecipeOptions: (payload: {
    meal_type: RecipeMealType;
    target_kcal?: number;
    target_protein_g?: number;
    target_fat_g?: number;
    target_carbs_g?: number;
    goal_mode?: GoalType;
    use_only_ingredients: boolean;
    allergies?: string[];
    preferences?: string[];
    available_ingredients: RecipeIngredientItem[];
    allow_basic_pantry: boolean;
    locale?: "es" | "en";
  }) => Promise<RecipeAiOptionsResponse>;
  fetchRecipeAiDetail: (payload: { generation_id: string; option_id: string }) => Promise<RecipeAiDetailResponse>;
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
    locale?: "es" | "en";
    onUploadProgress?: (progress: { loaded: number; total: number; ratio: number }) => void;
  }) => Promise<MealEstimateQuestionsResponse>;
  mealPhotoEstimateCalculate: (input: {
    description?: string;
    answers?: Record<string, string>;
    portionSize?: "small" | "medium" | "large";
    hasAddedFats?: boolean;
    quantityNote?: string;
    photos?: string[];
    analysisId?: string;
    adjustPercent?: number;
    commit?: boolean;
    locale?: "es" | "en";
  }) => Promise<MealPhotoEstimateResponse>;
  mealPhotoEstimate: (input: {
    description?: string;
    answers?: Record<string, string>;
    portionSize?: "small" | "medium" | "large";
    hasAddedFats?: boolean;
    quantityNote?: string;
    photos?: string[];
    analysisId?: string;
    adjustPercent?: number;
    commit?: boolean;
    locale?: "es" | "en";
    overrides?: MealEstimateOverride;
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
  searchSocialUsers: (query: string, limit?: number) => Promise<SocialSearchItem[]>;
  fetchSocialOverview: () => Promise<SocialOverview>;
  sendFriendRequest: (targetUserId: number) => Promise<SocialFriendRequest>;
  acceptFriendRequest: (friendshipId: number) => Promise<SocialFriendRequest>;
  rejectFriendRequest: (friendshipId: number) => Promise<SocialFriendRequest>;
  fetchSocialFeed: (input?: {
    cursor?: string | null;
    limit?: number;
    scope?: "feed" | "explore";
    sort?: SocialFeedSort;
    postType?: SocialFeedTypeFilter;
  }) => Promise<SocialFeedResponse>;
  fetchSocialProfile: (input?: { userId?: number; cursor?: string | null; limit?: number }) => Promise<SocialProfileResponse>;
  createSocialPost: (payload: {
    type: SocialPostType;
    caption?: string;
    visibility: SocialVisibility;
    photos?: string[];
    recipe?: SocialRecipePayload | null;
    progress?: SocialProgressPayload | null;
  }) => Promise<SocialPost>;
  updateSocialPostVisibility: (postId: string, visibility: SocialVisibility) => Promise<SocialPost>;
  deleteSocialPost: (postId: string) => Promise<void>;
  likeSocialPost: (postId: string) => Promise<SocialLikeToggleResponse>;
  unlikeSocialPost: (postId: string) => Promise<SocialLikeToggleResponse>;
  fetchSocialComments: (postId: string) => Promise<SocialComment[]>;
  createSocialComment: (postId: string, text: string) => Promise<SocialComment>;
  setWebSignupDraft: (draft: WebSignupDraft | null) => Promise<void>;
  setApiBaseUrl: (url: string) => void;
  checkHealth: (url?: string) => Promise<boolean>;
};

type Segment = {
  label: string;
  value: number;
  color: string;
};

const TOKEN_STORAGE_KEY = "nutri_tracker_access_token";
const WEB_SIGNUP_DRAFT_STORAGE_KEY = "nutri_tracker_web_signup_draft";
const MAX_MEAL_PHOTOS = 3;
const DEV_SETTINGS_MODE = (process.env.EXPO_PUBLIC_DEV_SETTINGS ?? "false").toLowerCase() === "true";
const STREAK_FLAME_SVG_XML =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92.27 122.88"><g><path fill="#EC6F59" fill-rule="evenodd" clip-rule="evenodd" d="M18.61,54.89C15.7,28.8,30.94,10.45,59.52,0C42.02,22.71,74.44,47.31,76.23,70.89c4.19-7.15,6.57-16.69,7.04-29.45c21.43,33.62,3.66,88.57-43.5,80.67c-4.33-0.72-8.5-2.09-12.3-4.13C10.27,108.8,0,88.79,0,69.68C0,57.5,5.21,46.63,11.95,37.99C12.85,46.45,14.77,52.76,18.61,54.89L18.61,54.89z"/><path fill="#FAD15C" fill-rule="evenodd" clip-rule="evenodd" d="M33.87,92.58c-4.86-12.55-4.19-32.82,9.42-39.93c0.1,23.3,23.05,26.27,18.8,51.14c3.92-4.44,5.9-11.54,6.25-17.15c6.22,14.24,1.34,25.63-7.53,31.43c-26.97,17.64-50.19-18.12-34.75-37.72C26.53,84.73,31.89,91.49,33.87,92.58L33.87,92.58z"/></g></svg>';
const theme = themeForPlatform(Platform.OS);
const GOOGLE_WEB_CLIENT_ID = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "" : "";

function shouldRedirectAuthenticatedRootToApp(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return false;
  }
  return (window.history?.length ?? 1) <= 1;
}

type GoogleCredentialCallback = (response: { credential?: string }) => void;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: GoogleCredentialCallback }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_black" | "filled_blue";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "pill" | "rectangular" | "circle" | "square";
              width?: number;
              logo_alignment?: "left" | "center";
            },
          ) => void;
        };
      };
    };
  }
}

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

function isLocalWebHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

function validateResolvedApiBaseUrl(baseUrl: string): string | null {
  if (!baseUrl) {
    return "API base URL no configurada. Define EXPO_PUBLIC_API_BASE_URL para la web desplegada.";
  }

  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  const currentOrigin = window.location.origin.replace(/\/+$/, "");
  const currentHost = window.location.hostname.trim().toLowerCase();
  const normalized = baseUrl.replace(/\/+$/, "");

  if (window.location.protocol === "https:" && normalized.startsWith("http://")) {
    return "La API configurada usa HTTP y la web está en HTTPS. Usa una URL pública HTTPS para el backend.";
  }

  if (currentHost.endsWith(".pages.dev") && normalized === currentOrigin) {
    return "La API base URL apunta a la web estática de Cloudflare Pages. Configura la URL pública real del backend.";
  }

  return null;
}

function defaultWebSignupDraft(): WebSignupDraft {
  return {
    step: 1,
    displayName: "",
    primaryGoal: "maintain_weight",
    activityLevel: "moderate",
    sex: "other",
    birthDate: "2000-01-01",
    country: "España",
    measurementSystem: "metric",
    currentWeightKg: "",
    currentWeightLb: "",
    targetWeightKg: "",
    targetWeightLb: "",
    heightCm: "",
    heightFt: "",
    heightIn: "",
    weeklyGoalKg: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptedTerms: false,
    pendingFinalize: false,
  };
}

function sanitizeUsernameCandidate(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.+/g, ".")
    .replace(/^[_\.]+|[_\.]+$/g, "")
    .slice(0, 32);
}

function goalTypeFromPrimaryGoal(goal: WizardPrimaryGoal): GoalType {
  if (goal === "lose_weight") {
    return "lose";
  }
  if (goal === "gain_weight" || goal === "gain_muscle") {
    return "gain";
  }
  return "maintain";
}

function kgToLb(value: number): number {
  return value * 2.2046226218;
}

function lbToKg(value: number): number {
  return value / 2.2046226218;
}

function cmToFeetInches(value: number): { feet: number; inches: number } {
  const totalInches = value / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round((totalInches - feet * 12) * 10) / 10;
  return { feet, inches };
}

function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

function parseWizardHeightCm(draft: WebSignupDraft): number | null {
  if (draft.measurementSystem === "metric") {
    return toPositiveNumberOrNull(draft.heightCm);
  }
  const feet = toOptionalNumber(draft.heightFt);
  const inches = toOptionalNumber(draft.heightIn);
  if (feet == null || feet < 0 || inches == null || inches < 0) {
    return null;
  }
  const cm = feetInchesToCm(feet, inches);
  return Number.isFinite(cm) && cm > 0 ? Math.round(cm * 10) / 10 : null;
}

function parseWizardCurrentWeightKg(draft: WebSignupDraft): number | null {
  if (draft.measurementSystem === "metric") {
    return toPositiveNumberOrNull(draft.currentWeightKg);
  }
  const pounds = toPositiveNumberOrNull(draft.currentWeightLb);
  return pounds ? Math.round(lbToKg(pounds) * 10) / 10 : null;
}

function parseWizardTargetWeightKg(draft: WebSignupDraft): number | null {
  if (draft.measurementSystem === "metric") {
    return toPositiveNumberOrNull(draft.targetWeightKg);
  }
  const pounds = toPositiveNumberOrNull(draft.targetWeightLb);
  return pounds ? Math.round(lbToKg(pounds) * 10) / 10 : null;
}

function syncDraftMeasurementSystem(draft: WebSignupDraft, system: MeasurementSystem): WebSignupDraft {
  if (draft.measurementSystem === system) {
    return draft;
  }
  const next = { ...draft, measurementSystem: system };
  const currentWeightKg = parseWizardCurrentWeightKg(draft);
  const targetWeightKg = parseWizardTargetWeightKg(draft);
  const heightCm = parseWizardHeightCm(draft);
  if (system === "imperial") {
    if (currentWeightKg) {
      next.currentWeightLb = String(Math.round(kgToLb(currentWeightKg) * 10) / 10);
    }
    if (targetWeightKg) {
      next.targetWeightLb = String(Math.round(kgToLb(targetWeightKg) * 10) / 10);
    }
    if (heightCm) {
      const converted = cmToFeetInches(heightCm);
      next.heightFt = String(converted.feet);
      next.heightIn = String(converted.inches);
    }
  } else {
    if (currentWeightKg) {
      next.currentWeightKg = String(Math.round(currentWeightKg * 10) / 10);
    }
    if (targetWeightKg) {
      next.targetWeightKg = String(Math.round(targetWeightKg * 10) / 10);
    }
    if (heightCm) {
      next.heightCm = String(Math.round(heightCm));
    }
  }
  return next;
}

function buildWeeklyGoalOptions(primaryGoal: WizardPrimaryGoal): Array<{ label: string; value: string; description: string; recommended?: boolean }> {
  if (primaryGoal === "lose_weight") {
    return [
      { label: "0,25 kg/semana", value: "0.25", description: "Déficit suave y más fácil de sostener.", recommended: true },
      { label: "0,5 kg/semana", value: "0.5", description: "Ritmo equilibrado para perder grasa.", recommended: false },
      { label: "0,75 kg/semana", value: "0.75", description: "Más agresivo; exige adherencia.", recommended: false },
    ];
  }
  if (primaryGoal === "gain_weight" || primaryGoal === "gain_muscle") {
    return [
      { label: "0,25 kg/semana", value: "0.25", description: "Subida controlada y más limpia.", recommended: true },
      { label: "0,5 kg/semana", value: "0.5", description: "Ritmo rápido si te cuesta ganar peso.", recommended: false },
    ];
  }
  return [
    { label: "Sin cambio semanal", value: "", description: "Mantén el foco en hábitos y objetivos diarios.", recommended: true },
    { label: "Ajuste mínimo", value: "0.25", description: "Útil si quieres un pequeño empujón sin priorizar el peso.", recommended: false },
  ];
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
  if (envUrl) {
    return envUrl;
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host && !isLocalWebHost(host)) {
      return "";
    }
    return "http://localhost:8000";
  }

  const hostIp = getExpoHostIp();
  if (hostIp) {
    return `http://${hostIp}:8000`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }

  return "http://localhost:8000";
}

async function prepareAvatarUploadUri(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (!asset.uri) {
    throw new Error("Avatar image missing uri");
  }
  let avatarUri = asset.uri;
  try {
    const size = Math.max(asset.width ?? 0, asset.height ?? 0);
    if (size > 720 && asset.width && asset.height) {
      const scale = 720 / size;
      const result = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          {
            resize: {
              width: Math.max(1, Math.round(asset.width * scale)),
              height: Math.max(1, Math.round(asset.height * scale)),
            },
          },
        ],
        {
          compress: 0.82,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      avatarUri = result.uri || asset.uri;
    }
  } catch {
    avatarUri = asset.uri;
  }
  return avatarUri;
}

type WebBreakpoint = "mobile" | "tablet" | "desktop";
const WEB_TOPBAR_HEIGHT = 72;
const WEB_NAVBAR_HEIGHT = 0;
const WEB_CHROME_TOTAL_HEIGHT = WEB_TOPBAR_HEIGHT + WEB_NAVBAR_HEIGHT;
const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e"];

function webBreakpoint(width: number): WebBreakpoint {
  if (Platform.OS !== "web") {
    return "mobile";
  }
  if (width >= 1024) {
    return "desktop";
  }
  if (width >= 768) {
    return "tablet";
  }
  return "mobile";
}

function isWideDesktopWebLayout(width: number): boolean {
  return Platform.OS === "web" && width >= 1280;
}

function isDesktopWebLayout(width: number): boolean {
  return webBreakpoint(width) === "desktop";
}

function webMainContentContainerStyle(width: number): ViewStyle | undefined {
  if (Platform.OS !== "web") {
    return undefined;
  }

  if (width >= 1280) {
    return {
      width: "100%",
      alignSelf: "center",
      maxWidth: 1400,
      paddingHorizontal: 36,
      paddingBottom: 128,
    };
  }

  if (width >= 1024) {
    return {
      width: "100%",
      alignSelf: "center",
      maxWidth: 1320,
      paddingHorizontal: 30,
      paddingBottom: 118,
    };
  }

  if (width >= 768) {
    return {
      width: "100%",
      alignSelf: "center",
      maxWidth: 1180,
      paddingHorizontal: 24,
      paddingBottom: 108,
    };
  }

  return undefined;
}

function webScanContainerStyle(width: number): ViewStyle | undefined {
  if (Platform.OS !== "web") {
    return undefined;
  }

  if (width >= 1280) {
    return {
      width: "100%",
      alignSelf: "center",
      maxWidth: 1400,
      paddingHorizontal: 36,
    };
  }
  if (width >= 1024) {
    return {
      width: "100%",
      alignSelf: "center",
      maxWidth: 1320,
      paddingHorizontal: 30,
    };
  }
  if (width >= 768) {
    return {
      width: "100%",
      alignSelf: "center",
      maxWidth: 1180,
      paddingHorizontal: 24,
    };
  }
  return undefined;
}

function webScanFrameStyle(width: number): ViewStyle | undefined {
  if (Platform.OS !== "web") {
    return undefined;
  }
  if (width >= 1280) {
    return {
      width: "48%",
      maxWidth: 560,
      minWidth: 420,
      height: 180,
      borderRadius: 20,
    };
  }
  if (width >= 1024) {
    return {
      width: "54%",
      maxWidth: 520,
      minWidth: 360,
      height: 172,
      borderRadius: 18,
    };
  }
  if (width >= 768) {
    return {
      width: "66%",
      maxWidth: 500,
      minWidth: 320,
      height: 164,
      borderRadius: 16,
    };
  }
  return undefined;
}

function webContentSideInset(width: number): number {
  if (Platform.OS !== "web") {
    return 16;
  }

  if (width >= 1280) {
    return Math.max(0, (width - 1400) / 2) + 36;
  }
  if (width >= 1024) {
    return Math.max(0, (width - 1320) / 2) + 30;
  }
  if (width >= 768) {
    return Math.max(0, (width - 1180) / 2) + 24;
  }
  return 18;
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
  if (message.includes("Invalid EAN/UPC")) {
    return "El código de barras debe tener entre 8 y 14 dígitos.";
  }
  if (message.includes("Internal server error")) {
    return "Error temporal del servidor. Inténtalo de nuevo en unos segundos.";
  }
  if (message.includes("String should have at least")) {
    return "Hay campos con menos caracteres de los requeridos.";
  }
  if (message.trim() === "Not Found" || message.includes("404")) {
    return "Endpoint no encontrado. Revisa la API base URL en Ajustes.";
  }
  if (message.includes("405") || message.includes("Method Not Allowed")) {
    return "La web está llamando a una URL que no acepta este login. Revisa EXPO_PUBLIC_API_BASE_URL y que apunte al backend público.";
  }
  if (message.includes("Cloudflare Pages")) {
    return message;
  }
  if (message.includes("API base URL no configurada")) {
    return message;
  }
  if (message.includes("usa HTTP y la web está en HTTPS")) {
    return message;
  }

  return message;
}

function isAbortRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return error.name === "AbortError" || message.includes("abort");
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

function recipeMealTypeLabel(mealType: RecipeMealType): string {
  const labels: Record<RecipeMealType, string> = {
    breakfast: "Desayuno",
    brunch: "Almuerzo",
    lunch: "Comida",
    snack: "Merienda",
    dinner: "Cena",
  };
  return labels[mealType] ?? "Comida";
}

function createLocalDraftKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPositiveNumberOrNull(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  return toOptionalNumber(trimmed);
}

function parseBirthDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const [yearRaw, monthRaw, dayRaw] = trimmed.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const result = new Date(Date.UTC(year, month - 1, day));
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() + 1 !== month ||
    result.getUTCDate() !== day
  ) {
    return null;
  }
  return result;
}

type BirthDateParts = {
  day: string;
  month: string;
  year: string;
};

function birthDatePartsFromValue(value: string): BirthDateParts {
  const parsed = parseBirthDateInput(value);
  if (!parsed) {
    return { day: "", month: "", year: "" };
  }
  return {
    day: String(parsed.getUTCDate()).padStart(2, "0"),
    month: String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    year: String(parsed.getUTCFullYear()),
  };
}

function birthDateValueFromParts(parts: BirthDateParts): string {
  const day = parts.day.padStart(2, "0");
  const month = parts.month.padStart(2, "0");
  const year = parts.year;
  if (year.length !== 4 || !day.trim() || !month.trim()) {
    return "";
  }
  return `${year}-${month}-${day}`;
}

type MacroAccentTone = "kcal" | "protein" | "carbs" | "fat";

function macroAccentMeta(tone: MacroAccentTone): {
  color: string;
  softBackground: string;
  borderColor: string;
} {
  if (tone === "protein") {
    return {
      color: theme.protein,
      softBackground: "rgba(96,165,250,0.10)",
      borderColor: "rgba(96,165,250,0.30)",
    };
  }
  if (tone === "carbs") {
    return {
      color: theme.carbs,
      softBackground: "rgba(245,158,11,0.10)",
      borderColor: "rgba(245,158,11,0.30)",
    };
  }
  if (tone === "fat") {
    return {
      color: theme.fats,
      softBackground: "rgba(236,72,153,0.10)",
      borderColor: "rgba(236,72,153,0.30)",
    };
  }
  return {
    color: theme.kcal,
    softBackground: "rgba(45,212,191,0.10)",
    borderColor: "rgba(45,212,191,0.30)",
  };
}

function passwordStrengthMeta(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) {
    return { score: 0, label: "Sin evaluar", color: theme.muted };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length >= 12) score += 1;

  if (score <= 2) {
    return { score, label: "Poco segura", color: theme.red };
  }
  if (score <= 4) {
    return { score, label: "Mejorable", color: theme.yellow };
  }
  return { score, label: "Segura", color: theme.ok };
}

function ageFromBirthDateString(birthDate: string | null | undefined, now = new Date()): number | null {
  if (!birthDate) {
    return null;
  }
  const parsed = parseBirthDateInput(birthDate);
  if (!parsed) {
    return null;
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function formatDateForApi(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAnswerToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isUnknownAnswer(value: string): boolean {
  const normalized = normalizeAnswerToken(value);
  return normalized === "no se" || normalized === "i don't know" || normalized === "idk";
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

function nutritionBasisLabel(product: Product): string {
  if (product.nutrition_basis === "per_100ml") {
    return tx("Valores por 100 ml");
  }
  if (product.nutrition_basis === "per_serving") {
    if (product.serving_size_g && product.serving_size_g > 0) {
      return tx("Valores por porción ({{servingSize}} g)", { servingSize: product.serving_size_g });
    }
    return tx("Valores por porción");
  }
  return tx("Valores por 100 g");
}

function normalizeDisplayProductName(name: string | null | undefined): string {
  const base = (name ?? "").trim();
  if (!base) {
    return "Producto";
  }
  const cleaned = base
    .replace(/^estimado:\s*/i, "")
    .replace(/^estimaci[oó]n:\s*/i, "")
    .replace(/^estimate:\s*/i, "")
    .trim();
  return cleaned || "Producto";
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
  const [webSignupDraft, setWebSignupDraftState] = useState<WebSignupDraft | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(inferApiBaseUrl());

  const parseApiBody = useCallback((text: string): unknown => {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }, []);

  const extractApiErrorDetail = useCallback((body: unknown, statusCode: number): string => {
    let detail: string | undefined;
    if (typeof body === "object" && body !== null) {
      const detailValue = (body as { detail?: unknown }).detail ?? (body as { message?: unknown }).message;
      if (typeof detailValue === "string") {
        detail = detailValue;
      } else if (Array.isArray(detailValue)) {
        const first = detailValue[0];
        if (typeof first === "string") {
          detail = first;
        } else if (first && typeof first === "object") {
          const msg = (first as { msg?: string }).msg;
          const loc = (first as { loc?: Array<string | number> }).loc;
          if (msg && Array.isArray(loc) && loc.length > 0) {
            detail = `${loc.join(".")}: ${msg}`;
          } else if (msg) {
            detail = msg;
          }
        }
      } else if (detailValue != null) {
        detail = String(detailValue);
      }
    } else if (typeof body === "string" && body.trim()) {
      detail = body;
    }
    return detail ?? `HTTP ${statusCode}`;
  }, []);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit, authToken?: string | null): Promise<T> => {
      const headers = new Headers(init?.headers ?? {});
      const effectiveToken = authToken ?? token;
      const baseUrl = normalizeBaseUrl(apiBaseUrl);
      const apiBaseUrlError = validateResolvedApiBaseUrl(baseUrl);
      if (apiBaseUrlError) {
        throw new Error(apiBaseUrlError);
      }
      if (effectiveToken) {
        headers.set("Authorization", `Bearer ${effectiveToken}`);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
      });

      const text = await response.text();
      const body = parseApiBody(text);

      if (!response.ok) {
        throw new Error(extractApiErrorDetail(body, response.status));
      }

      return body as T;
    },
    [apiBaseUrl, extractApiErrorDetail, parseApiBody, token],
  );

  const requestMultipartWithProgress = useCallback(
    async <T,>(
      path: string,
      formData: FormData,
      options?: {
        authToken?: string | null;
        timeoutMs?: number;
        onUploadProgress?: (progress: { loaded: number; total: number; ratio: number }) => void;
      },
    ): Promise<T> => {
      const baseUrl = normalizeBaseUrl(apiBaseUrl);
      const apiBaseUrlError = validateResolvedApiBaseUrl(baseUrl);
      if (apiBaseUrlError) {
        throw new Error(apiBaseUrlError);
      }
      const targetUrl = `${baseUrl}${path}`;
      const effectiveToken = options?.authToken ?? token;
      const timeoutMs = options?.timeoutMs ?? 45000;

      return await new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", targetUrl);
        if (effectiveToken) {
          xhr.setRequestHeader("Authorization", `Bearer ${effectiveToken}`);
        }
        xhr.timeout = timeoutMs;

        if (xhr.upload && options?.onUploadProgress) {
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) {
              return;
            }
            const total = event.total > 0 ? event.total : 1;
            const ratio = Math.max(0, Math.min(1, event.loaded / total));
            options.onUploadProgress?.({ loaded: event.loaded, total, ratio });
          };
        }

        xhr.onload = () => {
          const body = parseApiBody(xhr.responseText ?? "");
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body as T);
            return;
          }
          reject(new Error(extractApiErrorDetail(body, xhr.status)));
        };
        xhr.onerror = () => reject(new Error("Network request failed"));
        xhr.ontimeout = () => reject(new Error("Request timeout"));

        xhr.send(formData);
      });
    },
    [apiBaseUrl, extractApiErrorDetail, parseApiBody, token],
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
      const storedDraft = await getStoredItem(WEB_SIGNUP_DRAFT_STORAGE_KEY);
      if (storedDraft) {
        try {
          setWebSignupDraftState(JSON.parse(storedDraft) as WebSignupDraft);
        } catch {
          await deleteStoredItem(WEB_SIGNUP_DRAFT_STORAGE_KEY);
          setWebSignupDraftState(null);
        }
      } else {
        setWebSignupDraftState(null);
      }
      const storedToken = await getStoredItem(TOKEN_STORAGE_KEY);
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
      await deleteStoredItem(TOKEN_STORAGE_KEY);
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
    await setStoredItem(TOKEN_STORAGE_KEY, response.access_token);
  }, []);

  const setWebSignupDraft = useCallback(async (draft: WebSignupDraft | null) => {
    setWebSignupDraftState(draft);
    if (draft) {
      await setStoredItem(WEB_SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      return;
    }
    await deleteStoredItem(WEB_SIGNUP_DRAFT_STORAGE_KEY);
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
      await deleteStoredItem(TOKEN_STORAGE_KEY);
      return response;
    },
    [request],
  );

  const checkUsernameAvailability = useCallback(
    async (username: string): Promise<UsernameAvailability> => {
      const normalized = username.trim().toLowerCase();
      return request<UsernameAvailability>(`/auth/check-username?username=${encodeURIComponent(normalized)}`, {
        method: "GET",
      });
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

  const googleSignIn = useCallback(
    async (input: GoogleAuthInput): Promise<void> => {
      const response = await request<AuthResponse>("/auth/google", {
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
    await deleteStoredItem(TOKEN_STORAGE_KEY);
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

  const uploadProfileAvatar = useCallback(
    async (photoUri: string): Promise<AuthUser> => {
      const form = new FormData();
      const fallbackName = photoUri.split("/").pop() || "avatar.jpg";
      await appendImageUriToFormData(form, "photo", photoUri, fallbackName);
      const response = await request<AuthUser>("/me/avatar", {
        method: "POST",
        body: form,
      });
      setUser(response);
      return response;
    },
    [request],
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
    async (query: string, limit = 20, signal?: AbortSignal): Promise<FoodSearchResponse> => {
      const encoded = encodeURIComponent(query.trim());
      return request<FoodSearchResponse>(`/foods/search?q=${encoded}&limit=${limit}`, { signal });
    },
    [request],
  );

  const fetchMyCommunityFoods = useCallback(
    async (limit = 100): Promise<Product[]> => request<Product[]>(`/foods/mine?limit=${limit}`),
    [request],
  );

  const fetchMyRecipes = useCallback(
    async (input?: { limit?: number; query?: string }): Promise<UserRecipe[]> => {
      const params = new URLSearchParams();
      if (typeof input?.limit === "number") {
        params.set("limit", String(input.limit));
      }
      if (input?.query?.trim()) {
        params.set("q", input.query.trim());
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return request<UserRecipe[]>(`/recipes/mine${suffix}`);
    },
    [request],
  );

  const fetchRecipe = useCallback(
    async (recipeId: number): Promise<UserRecipe> => request<UserRecipe>(`/recipes/${recipeId}`),
    [request],
  );

  const createRecipe = useCallback(
    async (payload: UserRecipePayload): Promise<UserRecipe> => {
      return request<UserRecipe>("/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    [request],
  );

  const updateRecipe = useCallback(
    async (recipeId: number, payload: UserRecipePayload): Promise<UserRecipe> => {
      return request<UserRecipe>(`/recipes/${recipeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    [request],
  );

  const generateRecipe = useCallback(
    async (payload: {
      meal_type: RecipeMealType;
      target_kcal?: number;
      target_protein_g?: number;
      target_fat_g?: number;
      target_carbs_g?: number;
      goal_mode?: GoalType;
      use_only_ingredients: boolean;
      allergies?: string[];
      preferences?: string[];
      available_ingredients: RecipeIngredientItem[];
      allow_basic_pantry: boolean;
      locale?: "es" | "en";
    }): Promise<RecipeGenerateResponse> => {
      return request<RecipeGenerateResponse>("/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    [request],
  );

  const generateRecipeOptions = useCallback(
    async (payload: {
      meal_type: RecipeMealType;
      target_kcal?: number;
      target_protein_g?: number;
      target_fat_g?: number;
      target_carbs_g?: number;
      goal_mode?: GoalType;
      use_only_ingredients: boolean;
      allergies?: string[];
      preferences?: string[];
      available_ingredients: RecipeIngredientItem[];
      allow_basic_pantry: boolean;
      locale?: "es" | "en";
    }): Promise<RecipeAiOptionsResponse> => {
      return request<RecipeAiOptionsResponse>("/recipes/ai/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    [request],
  );

  const fetchRecipeAiDetail = useCallback(
    async (payload: { generation_id: string; option_id: string }): Promise<RecipeAiDetailResponse> => {
      return request<RecipeAiDetailResponse>("/recipes/ai/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
      locale?: "es" | "en";
      onUploadProgress?: (progress: { loaded: number; total: number; ratio: number }) => void;
    }): Promise<MealEstimateQuestionsResponse> => {
      const form = new FormData();
      form.append("description", input.description?.trim() ?? "");
      if (input.locale) {
        form.append("locale", input.locale);
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
      return requestMultipartWithProgress<MealEstimateQuestionsResponse>("/meal-photo-estimate/questions", form, {
        onUploadProgress: input.onUploadProgress,
      });
    },
    [requestMultipartWithProgress],
  );

  const mealPhotoEstimateCalculate = useCallback(
    async (input: {
      description?: string;
      answers?: Record<string, string>;
      portionSize?: "small" | "medium" | "large";
      hasAddedFats?: boolean;
      quantityNote?: string;
      photos?: string[];
      analysisId?: string;
      adjustPercent?: number;
      commit?: boolean;
      locale?: "es" | "en";
    }): Promise<MealPhotoEstimateResponse> => {
      const form = new FormData();
      form.append("description", input.description?.trim() ?? "");
      if (input.locale) {
        form.append("locale", input.locale);
      }
      if (input.analysisId?.trim()) {
        form.append("analysis_id", input.analysisId.trim());
      }
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
      (input.photos ?? []).forEach((uri, index) => {
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
      photos?: string[];
      analysisId?: string;
      adjustPercent?: number;
      commit?: boolean;
      locale?: "es" | "en";
      overrides?: MealEstimateOverride;
    }): Promise<MealPhotoEstimateResponse> => {
      const form = new FormData();
      form.append("description", input.description?.trim() ?? "");
      if (input.locale) {
        form.append("locale", input.locale);
      }
      if (input.analysisId?.trim()) {
        form.append("analysis_id", input.analysisId.trim());
      }
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
      if (input.overrides) {
        form.append("override_kcal", String(input.overrides.kcal));
        form.append("override_protein_g", String(input.overrides.protein_g));
        form.append("override_fat_g", String(input.overrides.fat_g));
        form.append("override_carbs_g", String(input.overrides.carbs_g));
      }
      if (input.commit) {
        form.append("commit", "true");
      }
      (input.photos ?? []).forEach((uri, index) => {
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

  const socialApi = useMemo(() => createSocialApi(request), [request]);
  const {
    searchSocialUsers,
    fetchSocialOverview,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    fetchSocialFeed,
    fetchSocialProfile,
    createSocialPost,
    updateSocialPostVisibility,
    deleteSocialPost,
    likeSocialPost,
    unlikeSocialPost,
    fetchSocialComments,
    createSocialComment,
  } = socialApi;

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      token,
      user,
      profile,
      apiBaseUrl,
      pendingVerificationEmail,
      otpHint,
      webSignupDraft,
      register,
      checkUsernameAvailability,
      login,
      googleSignIn,
      verifyEmail,
      resendCode,
      clearPendingVerification,
      logout,
      refreshMe,
      saveProfile,
      uploadProfileAvatar,
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
      fetchMyCommunityFoods,
      fetchMyRecipes,
      fetchRecipe,
      createRecipe,
      updateRecipe,
      generateRecipe,
      generateRecipeOptions,
      fetchRecipeAiDetail,
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
      searchSocialUsers,
      fetchSocialOverview,
      sendFriendRequest,
      acceptFriendRequest,
      rejectFriendRequest,
      fetchSocialFeed,
      fetchSocialProfile,
      createSocialPost,
      updateSocialPostVisibility,
      deleteSocialPost,
      likeSocialPost,
      unlikeSocialPost,
      fetchSocialComments,
      createSocialComment,
      setWebSignupDraft,
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
      fetchMyCommunityFoods,
      fetchMyRecipes,
      fetchRecipe,
      createRecipe,
      updateRecipe,
      generateRecipe,
      generateRecipeOptions,
      fetchRecipeAiDetail,
      fetchMeasurementLogs,
      fetchGoal,
      fetchWeightLogs,
      loading,
      login,
      googleSignIn,
      logout,
      lookupByBarcode,
      otpHint,
      webSignupDraft,
      pendingVerificationEmail,
      profile,
      refreshMe,
      register,
      checkUsernameAvailability,
      resendCode,
      saveGoal,
      saveProfile,
      uploadProfileAvatar,
      removeFavoriteProduct,
      repeatIntakesFromDay,
      searchSocialUsers,
      fetchSocialOverview,
      sendFriendRequest,
      acceptFriendRequest,
      rejectFriendRequest,
      fetchSocialFeed,
      fetchSocialProfile,
      createSocialPost,
      updateSocialPostVisibility,
      deleteSocialPost,
      likeSocialPost,
      unlikeSocialPost,
      fetchSocialComments,
      createSocialComment,
      setWebSignupDraft,
      token,
      user,
      verifyEmail,
    ],
  );

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
}

function translateNode(node: import("react").ReactNode, t: (key: string) => string): import("react").ReactNode {
  if (typeof node === "string") {
    return t(node);
  }
  if (Array.isArray(node)) {
    return node.map((entry, index) => <Fragment key={`i18n-node-${index}`}>{translateNode(entry, t)}</Fragment>);
  }
  return node;
}

function Text(props: TextProps) {
  const { t } = useI18n();
  return <RNText {...props}>{translateNode(props.children, t)}</RNText>;
}

function TextInput(props: TextInputProps) {
  const { t } = useI18n();
  const placeholder = typeof props.placeholder === "string" ? t(props.placeholder) : props.placeholder;
  return <RNTextInput {...props} placeholder={placeholder} />;
}

function tx(key: string, vars?: Record<string, string | number | null | undefined>): string {
  return tGlobal(key, vars);
}

type InAppAlertButton = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type InAppAlertState = {
  title: string;
  message?: string;
  buttons: InAppAlertButton[];
};

let inAppAlertPresenter: ((payload: InAppAlertState) => void) | null = null;

function showAlert(...args: Parameters<typeof Alert.alert>) {
  const [title, message, buttons, options] = args;

  const translatedButtons: InAppAlertButton[] =
    buttons?.map((button) => ({
      ...button,
      text: typeof button.text === "string" ? tx(button.text) : button.text,
    })) ?? [{ text: tx("Aceptar"), style: "default" }];

  const translatedTitle = typeof title === "string" ? tx(title) : String(title ?? "");
  const translatedMessage = typeof message === "string" ? tx(message) : message ? String(message) : undefined;

  if (inAppAlertPresenter) {
    inAppAlertPresenter({
      title: translatedTitle,
      message: translatedMessage,
      buttons: translatedButtons,
    });
    return;
  }

  Alert.alert(
    translatedTitle,
    translatedMessage,
    translatedButtons,
    options,
  );
}

function InAppAlertHost() {
  const [activeAlert, setActiveAlert] = useState<InAppAlertState | null>(null);

  useEffect(() => {
    inAppAlertPresenter = (payload) => setActiveAlert(payload);
    return () => {
      inAppAlertPresenter = null;
    };
  }, []);

  if (!activeAlert) {
    return null;
  }

  const buttons = activeAlert.buttons.length ? activeAlert.buttons : [{ text: tx("Aceptar"), style: "default" as const }];
  const cancelButton = buttons.find((button) => button.style === "cancel");
  const fallbackCloseButton = buttons[buttons.length - 1];

  const dismissWith = (button: InAppAlertButton | undefined) => {
    setActiveAlert(null);
    setTimeout(() => {
      button?.onPress?.();
    }, 0);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => dismissWith(cancelButton ?? fallbackCloseButton)}>
      <View style={styles.inAppAlertLayer}>
        <Pressable style={styles.inAppAlertBackdrop} onPress={() => dismissWith(cancelButton ?? fallbackCloseButton)} />
        <View style={styles.inAppAlertCard}>
          <Text style={styles.inAppAlertTitle}>{activeAlert.title}</Text>
          {activeAlert.message ? <Text style={styles.inAppAlertMessage}>{activeAlert.message}</Text> : null}
          <View style={styles.inAppAlertButtons}>
            {buttons.map((button, index) => (
              <Pressable
                key={`${button.text ?? "btn"}-${index}`}
                onPress={() => dismissWith(button)}
                style={[
                  styles.inAppAlertButton,
                  button.style === "destructive"
                    ? styles.inAppAlertButtonDanger
                    : button.style === "cancel"
                      ? styles.inAppAlertButtonSecondary
                      : styles.inAppAlertButtonPrimary,
                ]}
              >
                <Text
                  style={[
                    styles.inAppAlertButtonText,
                    button.style === "destructive"
                      ? styles.inAppAlertButtonTextDanger
                      : button.style === "cancel"
                        ? styles.inAppAlertButtonTextSecondary
                        : styles.inAppAlertButtonTextPrimary,
                  ]}
                >
                  {button.text ?? tx("Aceptar")}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
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

function AppHeader({
  title,
  subtitle,
  onBack,
  rightActionLabel,
  onRightAction,
  rightActionDisabled,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  rightActionLabel?: string;
  onRightAction?: () => void;
  rightActionDisabled?: boolean;
}) {
  const { width } = useWindowDimensions();
  const breakpoint = webBreakpoint(width);
  const isWebDesktop = breakpoint === "desktop";
  const isWebTablet = breakpoint === "tablet";

  return (
    <View style={styles.headerWrap}>
      <View style={styles.headerTopRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.headerBackButton}>
            <Text style={styles.headerBackIcon}>←</Text>
          </Pressable>
        ) : (
          <View style={styles.headerTopSpacer} />
        )}
        {rightActionLabel && onRightAction ? (
          <Pressable
            onPress={onRightAction}
            disabled={rightActionDisabled}
            style={[styles.headerRightAction, rightActionDisabled && styles.disabledButton]}
          >
            <Text style={styles.headerRightActionText}>{rightActionLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerTopSpacer} />
        )}
      </View>
      <Text style={[styles.headerTitle, isWebTablet && styles.headerTitleTablet, isWebDesktop && styles.headerTitleDesktop]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.headerSubtitle, isWebTablet && styles.headerSubtitleTablet, isWebDesktop && styles.headerSubtitleDesktop]}>
          {subtitle}
        </Text>
      ) : null}
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
  editable?: boolean;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
  inputMode?: TextInputProps["inputMode"];
  helperText?: string;
  invalid?: boolean;
  accentColor?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  inputStyle?: TextStyle;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = props.invalid
    ? theme.danger
    : focused
      ? props.accentColor ?? theme.inputFocusBorder
      : theme.inputBorder;
  return (
    <View style={[styles.fieldWrap, props.containerStyle]}>
      <View style={styles.fieldLabelRow}>
        {props.accentColor ? <View style={[styles.fieldLabelDot, { backgroundColor: props.accentColor }]} /> : null}
        <Text style={[styles.fieldLabel, props.labelStyle]}>{props.label}</Text>
      </View>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? "default"}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? "none"}
        placeholder={props.placeholder}
        placeholderTextColor={theme.placeholder}
        editable={props.editable ?? true}
        autoFocus={props.autoFocus}
        returnKeyType={props.returnKeyType}
        onSubmitEditing={props.onSubmitEditing}
        inputMode={props.inputMode}
        style={[styles.input, props.inputStyle, { borderColor }, focused && styles.inputFocused, props.invalid && styles.inputInvalid]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {props.helperText ? <Text style={[styles.fieldHelperText, props.invalid && styles.fieldHelperTextInvalid]}>{props.helperText}</Text> : null}
    </View>
  );
}

function ReadOnlyField(props: { label: string; value: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <View style={styles.readOnlyField}>
        <Text style={styles.readOnlyFieldValue}>{props.value}</Text>
      </View>
    </View>
  );
}

function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  loadingTitle?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}) {
  const [hovered, setHovered] = useState(false);
  const disabled = props.disabled || props.loading;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.primaryButton,
        props.style,
        hovered && !disabled && styles.primaryButtonHover,
        pressed && !disabled && styles.primaryButtonPressed,
        disabled && styles.disabledButton,
      ]}
    >
      {props.loading ? (
        <View style={styles.buttonLoadingContent}>
          <ActivityIndicator color={theme.bg} />
          <Text style={[styles.primaryButtonText, styles.buttonLoadingText, props.textStyle]}>
            {props.loadingTitle ?? props.title}
          </Text>
        </View>
      ) : (
        <Text style={[styles.primaryButtonText, props.textStyle]}>{props.title}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton(props: { title: string; onPress: () => void; disabled?: boolean; style?: ViewStyle; textStyle?: TextStyle }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.secondaryButton,
        props.style,
        hovered && !props.disabled && styles.secondaryButtonHover,
        pressed && !props.disabled && styles.secondaryButtonPressed,
        props.disabled && styles.disabledButton,
      ]}
    >
      <Text style={[styles.secondaryButtonText, props.textStyle]}>{props.title}</Text>
    </Pressable>
  );
}

function GoogleAuthButton(props: {
  mode: "signup_with" | "continue_with";
  disabled?: boolean;
  helperText?: string;
  onCredential: (credential: string) => void;
  variant?: "card" | "inline";
  showConfigHint?: boolean;
  missingConfigText?: string;
}) {
  const hostRef = useRef<View | null>(null);
  const [hostWidth, setHostWidth] = useState(320);
  const [ready, setReady] = useState<boolean>(() => Platform.OS === "web" && typeof window !== "undefined" && Boolean(window.google?.accounts?.id));
  const [loadingScript, setLoadingScript] = useState(false);
  const { disabled, helperText, mode, onCredential, variant = "card", showConfigHint = false, missingConfigText } = props;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined" || !GOOGLE_WEB_CLIENT_ID || window.google?.accounts?.id) {
      return;
    }
    const existing = document.querySelector('script[data-google-identity="true"]') as HTMLScriptElement | null;
    const handleReady = () => {
      setReady(true);
      setLoadingScript(false);
    };

    if (existing) {
      if (window.google?.accounts?.id) {
        handleReady();
        return;
      }
      setLoadingScript(true);
      existing.addEventListener("load", handleReady, { once: true });
      existing.addEventListener("error", () => setLoadingScript(false), { once: true });
      return () => {
        existing.removeEventListener("load", handleReady);
      };
    }

    setLoadingScript(true);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = handleReady;
    script.onerror = () => setLoadingScript(false);
    document.head.appendChild(script);
    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, []);

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof window === "undefined" ||
      !ready ||
      !GOOGLE_WEB_CLIENT_ID ||
      !hostRef.current ||
      !window.google?.accounts?.id
    ) {
      return;
    }
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) {
      return;
    }
    host.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      callback: (response) => {
        const credential = response.credential?.trim();
        if (credential) {
          onCredential(credential);
        }
      },
    });
    window.google.accounts.id.renderButton(host, {
      theme: "outline",
      size: "large",
      text: mode,
      shape: "pill",
      logo_alignment: "left",
      width: Math.max(240, Math.min(360, Math.round(hostWidth || 320))),
    });
  }, [hostWidth, mode, onCredential, ready]);

  if (Platform.OS !== "web") {
    return null;
  }

  if (!GOOGLE_WEB_CLIENT_ID) {
    if (!showConfigHint) {
      return null;
    }
    return (
      <View style={variant === "inline" ? styles.googleAuthInlineMissing : styles.googleAuthCard}>
        <Text style={variant === "inline" ? styles.googleAuthInlineMissingTitle : styles.googleAuthTitle}>Google</Text>
        <Text style={variant === "inline" ? styles.googleAuthInlineMissingText : styles.googleAuthSubtitle}>
          {missingConfigText ?? "Falta configurar EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID para activar este acceso."}
        </Text>
      </View>
    );
  }

  if (variant === "inline") {
    return (
      <View style={[styles.googleAuthInlineWrap, disabled && styles.googleAuthCardDisabled]}>
        {helperText ? <Text style={styles.googleAuthInlineHelper}>{helperText}</Text> : null}
        <View
          pointerEvents={disabled ? "none" : "auto"}
          ref={hostRef as never}
          onLayout={(event) => setHostWidth(event.nativeEvent.layout.width)}
          style={styles.googleAuthButtonHostInline}
        />
        {loadingScript && !ready ? <Text style={styles.fieldHelperText}>Cargando acceso con Google...</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.googleAuthCard, disabled && styles.googleAuthCardDisabled]}>
      <Text style={styles.googleAuthTitle}>Google</Text>
      <Text style={styles.googleAuthSubtitle}>{helperText ?? "Usa tu cuenta de Google sin escribir contraseña."}</Text>
      <View
        pointerEvents={disabled ? "none" : "auto"}
        ref={hostRef as never}
        onLayout={(event) => setHostWidth(event.nativeEvent.layout.width)}
        style={styles.googleAuthButtonHost}
      />
      {loadingScript && !ready ? <Text style={styles.fieldHelperText}>Cargando acceso con Google...</Text> : null}
    </View>
  );
}

function AppCard(props: { children: import("react").ReactNode; style?: object }) {
  const { width } = useWindowDimensions();
  const breakpoint = webBreakpoint(width);
  const cardResponsiveStyle =
    breakpoint === "desktop"
      ? styles.appCardDesktop
      : breakpoint === "tablet"
        ? styles.appCardTablet
        : undefined;
  return <View style={[styles.appCard, cardResponsiveStyle, props.style]}>{props.children}</View>;
}

function SectionHeader(props: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { width } = useWindowDimensions();
  const breakpoint = webBreakpoint(width);
  const isWebDesktop = breakpoint === "desktop";
  const isWebTablet = breakpoint === "tablet";

  return (
    <View style={styles.sectionHeaderWrap}>
      <View style={styles.sectionHeaderLeft}>
        <Text
          style={[
            styles.sectionHeaderTitle,
            isWebTablet && styles.sectionHeaderTitleTablet,
            isWebDesktop && styles.sectionHeaderTitleDesktop,
          ]}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text
            style={[
              styles.sectionHeaderSubtitle,
              isWebTablet && styles.sectionHeaderSubtitleTablet,
              isWebDesktop && styles.sectionHeaderSubtitleDesktop,
            ]}
          >
            {props.subtitle}
          </Text>
        ) : null}
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

function AvatarCircle({ letter, imageUrl, size = 36 }: { letter: string; imageUrl?: string | null; size?: number }) {
  return (
    <View
      style={[
        styles.avatarCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{
            width: size - 2,
            height: size - 2,
            borderRadius: (size - 2) / 2,
          }}
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: Math.max(13, Math.round(size * 0.36)) }]}>
          {letter.slice(0, 1).toUpperCase()}
        </Text>
      )}
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

function ToastFeedback(props: { kind: "success" | "error"; message: string }) {
  return (
    <View style={[styles.toastWrap, props.kind === "success" ? styles.toastSuccess : styles.toastError]}>
      <Text style={styles.toastText}>{props.message}</Text>
    </View>
  );
}

function MetricCard(props: { label: string; value: string; subtitle?: string; color?: string }) {
  const { width } = useWindowDimensions();
  const breakpoint = webBreakpoint(width);
  const isWebDesktop = breakpoint === "desktop";
  const isWebTablet = breakpoint === "tablet";

  return (
    <View style={[styles.metricTile, isWebTablet && styles.metricTileTablet, isWebDesktop && styles.metricTileDesktop]}>
      <Text style={[styles.metricTileLabel, isWebTablet && styles.metricTileLabelTablet, isWebDesktop && styles.metricTileLabelDesktop]}>
        {props.label}
      </Text>
      <Text
        style={[
          styles.metricTileValue,
          isWebTablet && styles.metricTileValueTablet,
          isWebDesktop && styles.metricTileValueDesktop,
          props.color ? { color: props.color } : null,
        ]}
      >
        {props.value}
      </Text>
      {props.subtitle ? (
        <Text style={[styles.metricTileSubtitle, isWebTablet && styles.metricTileSubtitleTablet, isWebDesktop && styles.metricTileSubtitleDesktop]}>
          {props.subtitle}
        </Text>
      ) : null}
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

function WelcomeScreen(props: {
  onCreate: () => void;
  onLogin: () => void;
  onHome?: () => void;
  createLabel?: string;
  loginLabel?: string;
  topbarNavItems?: WebTopbarNavItem[];
  topbarActions?: WebTopbarAction[];
  topbarAccount?: WebTopbarAccount;
}) {
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const isWeb = Platform.OS === "web";
  const desktop = isDesktopWebLayout(width);
  const scrollRef = useRef<ScrollView | null>(null);
  const landingOffsetsRef = useRef<{ features: number; howItWorks: number }>({
    features: 0,
    howItWorks: 0,
  });
  const heroIntro = useRef(new Animated.Value(0)).current;
  const heroFloat = useRef(new Animated.Value(0)).current;

  const scrollToLandingOffset = useCallback((key: "features" | "howItWorks") => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, landingOffsetsRef.current[key] - 92),
      animated: true,
    });
  }, []);

  const defaultTopbarNavItems = useMemo<WebTopbarNavItem[]>(
    () => [
      {
        key: "home",
        label: "Inicio",
        active: false,
        onPress: () => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        },
      },
      {
        key: "features",
        label: "Funciones",
        active: false,
        onPress: () => scrollToLandingOffset("features"),
      },
      {
        key: "how-it-works",
        label: "Cómo funciona",
        active: false,
        onPress: () => scrollToLandingOffset("howItWorks"),
      },
    ],
    [scrollToLandingOffset],
  );

  const defaultTopbarActions = useMemo<WebTopbarAction[]>(
    () => [
      { label: "Iniciar sesión", onPress: props.onLogin },
      { label: "Crear cuenta", onPress: props.onCreate, primary: true },
    ],
    [props.onCreate, props.onLogin],
  );

  const features = [
    {
      title: t("Escaneo inteligente de productos y etiquetas"),
      description: t("Detecta productos, revisa etiquetas y completa datos nutricionales con menos fricción."),
      accent: theme.kcal,
    },
    {
      title: t("IA para fotos de comidas"),
      description: t("La IA añade preguntas cortas cuando la foto sola no basta para afinar porciones y macros."),
      accent: theme.blue,
    },
    {
      title: t("Macros y seguimiento corporal"),
      description: t("Une calorías, macros, peso y medidas en el mismo flujo para ver progreso real."),
      accent: theme.carbs,
    },
    {
      title: t("Recetas adaptadas a tu objetivo"),
      description: t("Genera opciones según tus ingredientes, tu objetivo y lo que te queda hoy."),
      accent: theme.fats,
    },
  ];

  const steps = [
    {
      title: t("Escanea o registra"),
      description: t("Busca productos, usa código de barras o registra manualmente sin perder tiempo."),
    },
    {
      title: t("Obtén datos más precisos con IA"),
      description: t("Analiza fotos de comidas y etiquetas para refinar macros, porciones y calidad del dato."),
    },
    {
      title: t("Sigue tu progreso y ajusta objetivos"),
      description: t("Consulta panel, cuerpo e historial para corregir el rumbo antes de desviarte."),
    },
  ];

  const heroSignals = [
    {
      label: t("Escaneo inteligente"),
      value: t("Producto, etiqueta o foto"),
      accent: theme.kcal,
    },
    {
      label: t("Foto + contexto"),
      value: t("La IA pregunta cuando la imagen no basta"),
      accent: theme.blue,
    },
    {
      label: t("Ingredientes -> receta"),
      value: t("Opciones según lo que te falta hoy"),
      accent: theme.fats,
    },
  ];

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    heroIntro.setValue(0);
    heroFloat.setValue(0);
    const intro = Animated.timing(heroIntro, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroFloat, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(heroFloat, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    intro.start(() => {
      loop.start();
    });
    return () => {
      intro.stop();
      loop.stop();
    };
  }, [heroFloat, heroIntro, isWeb]);

  const heroCopyOpacity = heroIntro;
  const heroCopyTranslateY = heroIntro.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  const heroMockupOpacity = heroIntro.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const heroMockupTranslateX = heroIntro.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const heroMockupTranslateY = heroFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -8, 0],
  });
  const heroGlowOpacity = heroFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.18, 0.3, 0.2],
  });
  const heroSecondaryTranslateY = heroFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -10, 0],
  });
  const heroTertiaryTranslateY = heroFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 8, 0],
  });
  const heroPrimaryScale = heroFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.008, 1],
  });
  const heroAmbientLeftTranslate = heroFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -10, 0],
  });
  const heroAmbientRightTranslate = heroFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 10, 0],
  });

  if (!isWeb) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandCard}>
            <Text style={styles.brandEyebrow}>NUTRIA</Text>
            <Text style={styles.brandTitle}>{t("Nutrición clara, seguimiento real y IA útil.")}</Text>
            <Text style={styles.brandText}>
              {t("Escanea productos, registra comidas y usa IA para entender mejor lo que comes y cómo progresas.")}
            </Text>
          </View>
          <PrimaryButton title={t(props.createLabel ?? "Crear cuenta")} onPress={props.onCreate} />
          <SecondaryButton title={t(props.loginLabel ?? "Iniciar sesión")} onPress={props.onLogin} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <PublicLayout
      onHome={
        props.onHome ??
        (() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        })
      }
      navItems={props.topbarNavItems ?? defaultTopbarNavItems}
      actions={props.topbarAccount ? undefined : props.topbarActions ?? defaultTopbarActions}
      account={props.topbarAccount}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.webLandingScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.webLandingHeroSection, desktop && styles.webLandingHeroSectionDesktop]}>
          <Animated.View
            pointerEvents="none"
            style={[styles.webLandingHeroAmbientLeft, { transform: [{ translateY: heroAmbientLeftTranslate }] }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.webLandingHeroAmbientRight, { transform: [{ translateY: heroAmbientRightTranslate }] }]}
          />
          <Animated.View
            style={[
              styles.webLandingHeroCopy,
              {
                opacity: heroCopyOpacity,
                transform: [{ translateY: heroCopyTranslateY }],
              },
            ]}
          >
            <Text style={styles.webLandingEyebrow}>{t("Nutrición y progreso sin ruido")}</Text>
            <Text style={styles.webLandingHeroTitle}>{t("Nutrición clara, seguimiento real y IA útil.")}</Text>
            <Text style={styles.webLandingHeroSubtitle}>
              {t("Escanea productos, afina fotos con preguntas de apoyo cuando hace falta contexto y genera opciones según lo que tienes y lo que te falta hoy.")}
            </Text>
            <View style={styles.webLandingHeroActions}>
              <PrimaryButton title={t(props.createLabel ?? "Empezar")} onPress={props.onCreate} style={styles.webLandingPrimaryCta} />
              <SecondaryButton title={t(props.loginLabel ?? "Iniciar sesión")} onPress={props.onLogin} style={styles.webLandingSecondaryCta} />
            </View>
            <View style={[styles.webLandingHeroSignalRow, desktop && styles.webLandingHeroSignalRowDesktop]}>
              {heroSignals.map((signal) => (
                <View key={signal.label} style={styles.webLandingHeroSignalCard}>
                  <View style={[styles.webLandingHeroSignalLine, { backgroundColor: signal.accent }]} />
                  <Text style={styles.webLandingHeroSignalLabel}>{signal.label}</Text>
                  <Text style={styles.webLandingHeroSignalValue}>{signal.value}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.webLandingHeroPreview,
              {
                opacity: heroMockupOpacity,
                transform: [{ translateX: heroMockupTranslateX }, { translateY: heroMockupTranslateY }],
              },
            ]}
          >
            <View style={styles.webLandingMockupStage}>
              <Animated.View style={[styles.webLandingMockupGlow, { opacity: heroGlowOpacity }]} />
              <Animated.View style={[styles.webLandingMockupPrimary, { transform: [{ scale: heroPrimaryScale }] }]}>
                <View style={styles.webLandingMockupHeader}>
                  <View style={styles.webLandingMockupHeaderCopy}>
                    <Text style={styles.webLandingMockupEyebrow}>NUTRIA</Text>
                    <Text style={styles.webLandingMockupTitle}>{t("Vista diaria")}</Text>
                  </View>
                  <View style={styles.webLandingMockupStatusPill}>
                    <Text style={styles.webLandingMockupStatusText}>{t("En línea con tu objetivo")}</Text>
                  </View>
                </View>
                <View style={styles.webLandingMockupHeroMetric}>
                  <Text style={styles.webLandingMockupHeroMetricValue}>1784</Text>
                  <Text style={styles.webLandingMockupHeroMetricLabel}>{t("kcal consumidas hoy")}</Text>
                </View>
                <View style={styles.webLandingMockupMacroGrid}>
                  {[
                    { label: "P", value: "132g", color: theme.blue },
                    { label: "C", value: "188g", color: theme.carbs },
                    { label: "G", value: "54g", color: theme.fats },
                  ].map((item) => (
                    <View key={item.label} style={styles.webLandingMockupMacroCard}>
                      <View style={[styles.webLandingMockupMacroDot, { backgroundColor: item.color }]} />
                      <Text style={styles.webLandingMockupMacroLabel}>{item.label}</Text>
                      <Text style={styles.webLandingMockupMacroValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.webLandingMockupList}>
                  {[t("Escaneo inteligente de productos y etiquetas"), t("IA para fotos de comidas")].map((item, index) => (
                    <View key={item} style={styles.webLandingMockupListRow}>
                      <View
                        style={[
                          styles.webLandingMockupListAccent,
                          { backgroundColor: [theme.kcal, theme.blue, theme.carbs][index] },
                        ]}
                      />
                      <Text style={styles.webLandingMockupListText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
              <Animated.View style={[styles.webLandingMockupSecondary, { transform: [{ translateY: heroSecondaryTranslateY }] }]}>
                <Text style={styles.webLandingMockupMiniEyebrow}>{t("Foto + contexto")}</Text>
                <Text style={styles.webLandingMockupMiniTitle}>{t("La IA pregunta cuando la imagen no basta")}</Text>
                <Text style={styles.webLandingMockupMiniText}>
                  {t("Añade apoyo contextual para afinar porciones y macros antes de guardar.")}
                </Text>
              </Animated.View>
              <Animated.View style={[styles.webLandingMockupTertiary, { transform: [{ translateY: heroTertiaryTranslateY }] }]}>
                <Text style={styles.webLandingMockupMiniEyebrow}>{t("Ingredientes -> receta")}</Text>
                <Text style={styles.webLandingMockupMiniTitle}>{t("Opciones según lo que te falta hoy")}</Text>
                <View style={styles.webLandingMockupRecommendation}>
                  <Text style={styles.webLandingMockupRecommendationStar}>★</Text>
                  <Text style={styles.webLandingMockupRecommendationText}>{t("Más proteína con lo que ya tienes")}</Text>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        <View
          style={styles.webLandingSection}
          onLayout={(event) => {
            landingOffsetsRef.current.features = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.webLandingSectionHeader}>
            <Text style={styles.webLandingSectionTitle}>{t("Todo lo importante en un mismo flujo")}</Text>
            <Text style={styles.webLandingSectionSubtitle}>
              {t("Desde el escaneo hasta el seguimiento corporal, con una capa de IA pensada para mejorar precisión y contexto.")}
            </Text>
          </View>
          <View style={[styles.webLandingValueLayout, desktop && styles.webLandingValueLayoutDesktop]}>
            <View style={styles.webLandingValueLead}>
              <View style={styles.webLandingValueLeadAccent} />
              <Text style={styles.webLandingValueLeadTitle}>{t("IA que añade contexto útil")}</Text>
              <Text style={styles.webLandingValueLeadText}>
                {t("No se queda en detectar una foto o un producto: añade contexto cuando hace falta y te ayuda a convertir ingredientes en opciones más útiles para tu día.")}
              </Text>
              <View style={styles.webLandingValueBullets}>
                {[
                  {
                    title: t("Preguntas cuando hacen falta"),
                    description: t("La IA añade contexto a la foto para afinar porciones y macros."),
                    accent: theme.blue,
                  },
                  {
                    title: t("Recetas con lo que tienes"),
                    description: t("Genera opciones según ingredientes disponibles y necesidades del día."),
                    accent: theme.fats,
                  },
                  {
                    title: t("Menos fricción al registrar"),
                    description: t("Escaneo inteligente de productos y etiquetas"),
                    accent: theme.kcal,
                  },
                ].map((item) => (
                  <View key={item.title} style={styles.webLandingValueBullet}>
                    <View style={[styles.webLandingValueBulletDot, { backgroundColor: item.accent }]} />
                    <View style={styles.webLandingValueBulletCopy}>
                      <Text style={styles.webLandingValueBulletTitle}>{item.title}</Text>
                      <Text style={styles.webLandingValueBulletText}>{item.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.webLandingFeatureRail}>
              {features.slice(2).map((feature) => (
                <View key={feature.title} style={styles.webLandingFeatureCard}>
                  <View style={[styles.webLandingFeatureAccent, { backgroundColor: feature.accent }]} />
                  <Text style={styles.webLandingFeatureTitle}>{feature.title}</Text>
                  <Text style={styles.webLandingFeatureText}>{feature.description}</Text>
                </View>
              ))}
              <View style={styles.webLandingFeatureSummary}>
                <Text style={styles.webLandingFeatureSummaryTitle}>{t("Una pantalla para registrar. Otra para entender.")}</Text>
                <Text style={styles.webLandingFeatureSummaryText}>
                  {t("NutrIA junta escaneo, IA con apoyo contextual y recetas guiadas por ingredientes en un sistema pensado para decidir mejor cada día.")}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View
          style={styles.webLandingSection}
          onLayout={(event) => {
            landingOffsetsRef.current.howItWorks = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.webLandingSectionHeader}>
            <Text style={styles.webLandingSectionTitle}>{t("Cómo funciona")}</Text>
            <Text style={styles.webLandingSectionSubtitle}>
              {t("Una secuencia simple para registrar mejor, entender más y ajustar antes de perder el control del día.")}
            </Text>
          </View>
          <View style={[styles.webLandingTimeline, desktop && styles.webLandingTimelineDesktop]}>
            {steps.map((step, index) => (
              <View key={step.title} style={[styles.webLandingTimelineStep, desktop && styles.webLandingTimelineStepDesktop]}>
                <View style={styles.webLandingTimelineHead}>
                  <View style={styles.webLandingTimelineNode}>
                    <Text style={styles.webLandingTimelineNodeText}>{`0${index + 1}`}</Text>
                  </View>
                  {desktop && index < steps.length - 1 ? <View style={styles.webLandingTimelineConnector} /> : null}
                </View>
                <View style={styles.webLandingTimelineBody}>
                  <Text style={styles.webLandingTimelineTitle}>{step.title}</Text>
                  <Text style={styles.webLandingTimelineText}>{step.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.webLandingFinalSection}>
          <View style={styles.webLandingFinalGlow} />
          <View style={[styles.webLandingFinalInner, desktop && styles.webLandingFinalInnerDesktop]}>
            <View style={styles.webLandingFinalCopy}>
              <Text style={styles.webLandingFinalTitle}>{t("Empieza a registrar mejor desde hoy")}</Text>
              <Text style={styles.webLandingFinalSubtitle}>
                {t("Crea tu cuenta para tener objetivos diarios, seguimiento corporal y herramientas de IA dentro del mismo sistema.")}
              </Text>
            </View>
            <View style={[styles.webLandingFinalActions, desktop && styles.webLandingFinalActionsDesktop]}>
              <PrimaryButton title={t(props.createLabel ?? "Crear cuenta")} onPress={props.onCreate} style={styles.webLandingFinalPrimaryCta} />
              <SecondaryButton title={t(props.loginLabel ?? "Iniciar sesión")} onPress={props.onLogin} style={styles.webLandingFinalSecondaryCta} />
            </View>
          </View>
        </View>
      </ScrollView>
    </PublicLayout>
  );
}

function WebWizardProgress(props: { step: number; total: number }) {
  return (
    <View style={styles.webWizardProgressWrap}>
      <View style={styles.webWizardProgressTrack}>
        <View style={[styles.webWizardProgressFill, { width: `${(props.step / props.total) * 100}%` }]} />
      </View>
    </View>
  );
}

function WebWizardOptionCard(props: {
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
  recommended?: boolean;
}) {
  return (
    <Pressable style={[styles.webWizardOptionCard, props.active && styles.webWizardOptionCardActive]} onPress={props.onPress}>
      <View style={styles.webWizardOptionCardHeader}>
        <Text style={[styles.webWizardOptionCardTitle, props.active && styles.webWizardOptionCardTitleActive]}>{props.title}</Text>
        {props.recommended ? <Text style={styles.webWizardOptionCardRecommended}>Recomendado</Text> : null}
      </View>
      <Text style={[styles.webWizardOptionCardSubtitle, props.active && styles.webWizardOptionCardSubtitleActive]}>{props.subtitle}</Text>
    </Pressable>
  );
}

function WebWizardChoiceChip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.webWizardChoiceChip, props.active && styles.webWizardChoiceChipActive]} onPress={props.onPress}>
      <Text style={[styles.webWizardChoiceChipText, props.active && styles.webWizardChoiceChipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

function WebWizardCheckbox(props: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.webWizardCheckboxRow} onPress={props.onPress}>
      <View style={[styles.webWizardCheckboxBox, props.checked && styles.webWizardCheckboxBoxChecked]}>
        {props.checked ? <Text style={styles.webWizardCheckboxTick}>✓</Text> : null}
      </View>
      <Text style={styles.webWizardCheckboxLabel}>{props.label}</Text>
    </Pressable>
  );
}

function WebSignupWizard({ onBack }: { onBack: () => void }) {
  const auth = useAuth();
  const draftSeed = auth.webSignupDraft ?? defaultWebSignupDraft();
  const [draft, setDraft] = useState<WebSignupDraft>(draftSeed.pendingFinalize ? { ...draftSeed, pendingFinalize: false } : draftSeed);
  const [birthDateDraftParts, setBirthDateDraftParts] = useState<BirthDateParts>(() => birthDatePartsFromValue(draftSeed.birthDate || "2000-01-01"));
  const [loading, setLoading] = useState(false);
  const [displayStep, setDisplayStep] = useState<WebSignupStep>(draftSeed.step);
  const [incomingStep, setIncomingStep] = useState<WebSignupStep | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{
    state: "idle" | "checking" | "available" | "unavailable" | "invalid";
    message: string;
  }>({ state: "idle", message: "" });
  const usernameCheckSeqRef = useRef(0);
  const currentPaneTranslate = useRef(new Animated.Value(0)).current;
  const currentPaneOpacity = useRef(new Animated.Value(1)).current;
  const incomingPaneTranslate = useRef(new Animated.Value(0)).current;
  const incomingPaneOpacity = useRef(new Animated.Value(0)).current;

  const derivedUsername = useMemo(() => sanitizeUsernameCandidate(draft.displayName), [draft.displayName]);
  const birthDateAge = useMemo(() => ageFromBirthDateString(draft.birthDate), [draft.birthDate]);
  const currentWeightKg = useMemo(() => parseWizardCurrentWeightKg(draft), [draft]);
  const targetWeightKg = useMemo(() => parseWizardTargetWeightKg(draft), [draft]);
  const heightCm = useMemo(() => parseWizardHeightCm(draft), [draft]);
  const bmiPreview = useMemo(() => bmiValue(currentWeightKg, heightCm), [currentWeightKg, heightCm]);
  const weeklyGoalOptions = useMemo(() => buildWeeklyGoalOptions(draft.primaryGoal), [draft.primaryGoal]);

  useEffect(() => {
    void auth.setWebSignupDraft(draft);
  }, [auth, draft]);

  useEffect(() => {
    if (!transitioning && draft.step !== displayStep) {
      setDisplayStep(draft.step);
    }
  }, [displayStep, draft.step, transitioning]);

  useEffect(() => {
    if (weeklyGoalOptions.some((option) => option.value === draft.weeklyGoalKg)) {
      return;
    }
    const fallback = weeklyGoalOptions.find((option) => option.recommended)?.value ?? weeklyGoalOptions[0]?.value ?? "";
    setDraft((current) => ({ ...current, weeklyGoalKg: fallback }));
  }, [draft.weeklyGoalKg, weeklyGoalOptions]);

  useEffect(() => {
    const normalizedUsername = derivedUsername;
    if (!draft.displayName.trim()) {
      setUsernameStatus({ state: "idle", message: "" });
      return;
    }
    if (!normalizedUsername || !/^[a-z0-9._]{3,32}$/.test(normalizedUsername)) {
      setUsernameStatus({
        state: "invalid",
        message: "Usa al menos 3 caracteres válidos. Evita símbolos raros; convertimos espacios en guiones bajos.",
      });
      return;
    }

    setUsernameStatus({
      state: "checking",
      message: normalizedUsername !== draft.displayName.trim().toLowerCase() ? `Se guardará como @${normalizedUsername}. Comprobando disponibilidad...` : "Comprobando disponibilidad...",
    });

    const checkSeq = usernameCheckSeqRef.current + 1;
    usernameCheckSeqRef.current = checkSeq;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const availability = await auth.checkUsernameAvailability(normalizedUsername);
          if (usernameCheckSeqRef.current !== checkSeq) {
            return;
          }
          if (availability.available) {
            setUsernameStatus({
              state: "available",
              message: normalizedUsername !== draft.displayName.trim().toLowerCase() ? `Perfecto. Se usará @${normalizedUsername}.` : "Nombre disponible.",
            });
            return;
          }
          setUsernameStatus({
            state: "unavailable",
            message: availability.reason ?? "Ese nombre ya está en uso.",
          });
        } catch {
          if (usernameCheckSeqRef.current !== checkSeq) {
            return;
          }
          setUsernameStatus({
            state: "idle",
            message: normalizedUsername !== draft.displayName.trim().toLowerCase() ? `Se usará @${normalizedUsername}.` : "",
          });
        }
      })();
    }, 320);

    return () => clearTimeout(timer);
  }, [auth, derivedUsername, draft.displayName]);

  const updateDraft = useCallback((patch: Partial<WebSignupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const updateBirthDatePart = useCallback((part: keyof BirthDateParts, rawValue: string) => {
    const sanitized = rawValue.replace(/\D/g, "").slice(0, part === "year" ? 4 : 2);
    setBirthDateDraftParts((current) => {
      const nextParts = { ...current, [part]: sanitized };
      const nextValue = birthDateValueFromParts(nextParts);
      if (nextValue) {
        updateDraft({ birthDate: nextValue });
      }
      return nextParts;
    });
  }, [updateDraft]);

  const switchMeasurementSystem = useCallback((system: MeasurementSystem) => {
    setDraft((current) => syncDraftMeasurementSystem(current, system));
  }, []);

  const validateStep = useCallback((step: WebSignupStep): boolean => {
    if (step === 1) {
      if (!draft.displayName.trim()) {
        showAlert("Nombre", "Escribe cómo quieres aparecer en NutrIA.");
        return false;
      }
      if (!derivedUsername || usernameStatus.state === "invalid") {
        showAlert("Nombre", usernameStatus.message || "Revisa el nombre que quieres usar.");
        return false;
      }
      if (usernameStatus.state === "checking") {
        showAlert("Nombre", "Estamos comprobando si el nombre está libre.");
        return false;
      }
      if (usernameStatus.state === "unavailable") {
        showAlert("Nombre", usernameStatus.message || "Ese nombre ya está en uso.");
        return false;
      }
      return true;
    }
    if (step === 4) {
      if (draft.sex !== "male" && draft.sex !== "female") {
        showAlert("Sexo", "Selecciona sexo para continuar.");
        return false;
      }
      const parsedBirthDate = parseBirthDateInput(draft.birthDate);
      if (!parsedBirthDate) {
        showAlert("Fecha de nacimiento", "Introduce una fecha válida.");
        return false;
      }
      const age = ageFromBirthDateString(draft.birthDate);
      if (age === null || age < 13) {
        showAlert("Fecha de nacimiento", "Debes tener al menos 13 años.");
        return false;
      }
      return true;
    }
    if (step === 5) {
      if (!currentWeightKg || !heightCm) {
        showAlert("Medidas", "Completa altura y peso actual.");
        return false;
      }
      return true;
    }
    if (step === 7) {
      if (!draft.acceptedTerms) {
        showAlert("Términos", "Debes aceptar los términos para continuar.");
        return false;
      }
      return true;
    }
    return true;
  }, [currentWeightKg, derivedUsername, draft.acceptedTerms, draft.birthDate, draft.displayName, heightCm, usernameStatus.message, usernameStatus.state]);

  const transitionToStep = useCallback(
    (nextStep: WebSignupStep, direction: 1 | -1) => {
      if (transitioning || nextStep === displayStep) {
        return;
      }
      setIncomingStep(nextStep);
      setTransitioning(true);
      const startOffset = direction === 1 ? 56 : -56;
      currentPaneTranslate.setValue(0);
      currentPaneOpacity.setValue(1);
      incomingPaneTranslate.setValue(startOffset);
      incomingPaneOpacity.setValue(0.48);
      Animated.parallel([
        Animated.timing(currentPaneTranslate, {
          toValue: direction === 1 ? -56 : 56,
          duration: 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(currentPaneOpacity, {
          toValue: 0.16,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(incomingPaneTranslate, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(incomingPaneOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setDisplayStep(nextStep);
        setIncomingStep(null);
        currentPaneTranslate.setValue(0);
        currentPaneOpacity.setValue(1);
        incomingPaneTranslate.setValue(0);
        incomingPaneOpacity.setValue(0);
        setTransitioning(false);
        setDraft((current) => ({ ...current, step: nextStep }));
      });
    },
    [currentPaneOpacity, currentPaneTranslate, displayStep, incomingPaneOpacity, incomingPaneTranslate, transitioning],
  );

  const goNext = () => {
    if (!validateStep(displayStep)) {
      return;
    }
    if (displayStep < 7) {
      transitionToStep((displayStep + 1) as WebSignupStep, 1);
    }
  };

  const goBack = () => {
    if (displayStep === 1) {
      onBack();
      return;
    }
    transitionToStep((displayStep - 1) as WebSignupStep, -1);
  };

  const submit = async () => {
    if (!validateStep(7)) {
      return;
    }
    if (!draft.email.trim() || !draft.password.trim()) {
      showAlert("Cuenta", "Completa email y contraseña para crear la cuenta.");
      return;
    }
    if (draft.password.length < 8) {
      showAlert("Contraseña", "Debe tener al menos 8 caracteres.");
      return;
    }
    if (draft.password !== draft.confirmPassword) {
      showAlert("Contraseña", "Las contraseñas no coinciden.");
      return;
    }
    if (!validateStep(1) || !validateStep(4) || !validateStep(5)) {
      return;
    }

    setLoading(true);
    try {
      const response = await auth.register({
        username: derivedUsername,
        email: draft.email.trim().toLowerCase(),
        password: draft.password,
        sex: draft.sex,
        birth_date: draft.birthDate,
      });
      await auth.setWebSignupDraft({ ...draft, pendingFinalize: true, email: draft.email.trim().toLowerCase() });
      showAlert("Cuenta creada", response.message);
    } catch (error) {
      showAlert("Registro", parseApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const submitWithGoogle = async (credential: string) => {
    if (!validateStep(1) || !validateStep(4) || !validateStep(5) || !validateStep(7)) {
      return;
    }
    setLoading(true);
    try {
      await auth.setWebSignupDraft({ ...draft, pendingFinalize: true });
      await auth.googleSignIn({
        credential,
        username: derivedUsername,
        sex: draft.sex,
        birth_date: draft.birthDate,
      });
    } catch (error) {
      await auth.setWebSignupDraft({ ...draft, pendingFinalize: false });
      showAlert("Google", parseApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const stepCopy = useCallback((step: WebSignupStep) => {
    if (step === 1) {
      return {
        title: "¿Cuál es tu nombre?",
        subtitle: "Lo usaremos como alias público dentro de NutrIA. Puede ser tu nombre o un alias corto.",
      };
    }
    if (step === 2) {
      return {
        title: "¿Qué quieres conseguir?",
        subtitle: "Esto nos ayuda a plantear objetivos diarios y ritmo semanal con sentido.",
      };
    }
    if (step === 3) {
      return {
        title: "¿Cómo es tu actividad base?",
        subtitle: "Piensa en tu día normal, no en tu mejor semana del año.",
      };
    }
    if (step === 4) {
      return {
        title: "Perfil básico",
        subtitle: "Sexo y fecha de nacimiento para personalizar el punto de partida.",
      };
    }
    if (step === 5) {
      return {
        title: "Altura y peso",
        subtitle: "Tu plan se calculará con estos datos. Puedes usar sistema métrico o imperial.",
      };
    }
    if (step === 6) {
      return {
        title: "Objetivo semanal",
        subtitle: "Elige un ritmo que puedas sostener. Mejor realista que heroico dos días.",
      };
    }
    return {
      title: "Crea tu cuenta",
      subtitle: "Último paso. Puedes seguir con email y contraseña o usar Google si ya lo tienes configurado.",
    };
  }, []);

  const renderStepBody = (step: WebSignupStep) => {
    if (step === 1) {
      return (
        <View style={styles.webWizardSectionStack}>
          <InputField
            label="Nombre o alias"
            value={draft.displayName}
            onChangeText={(value) => updateDraft({ displayName: value })}
            placeholder="Ej: DanielFit"
            autoCapitalize="words"
            autoFocus
            containerStyle={styles.webWizardFieldCompact}
            labelStyle={styles.webWizardFieldLabel}
            inputStyle={styles.webWizardFieldInput}
            helperText={usernameStatus.message || "Será el nombre público que verá el resto en tu perfil."}
            invalid={usernameStatus.state === "invalid" || usernameStatus.state === "unavailable"}
          />
          <View style={styles.webWizardInlineNote}>
            <Text style={styles.webWizardInlineNoteText}>Tu perfil se guardará como @{derivedUsername || "nombre_usuario"}.</Text>
          </View>
        </View>
      );
    }

    if (step === 2) {
      const options: Array<{ value: WizardPrimaryGoal; title: string; subtitle: string }> = [
        { value: "lose_weight", title: "Perder peso", subtitle: "Reducir grasa con objetivos realistas y control de macros." },
        { value: "maintain_weight", title: "Mantener el peso", subtitle: "Consolidar hábitos y sostener energía diaria." },
        { value: "gain_weight", title: "Ganar peso", subtitle: "Subir kcal de forma estructurada y medible." },
        { value: "gain_muscle", title: "Ganar músculo", subtitle: "Priorizar proteína y superávit moderado." },
        { value: "improve_nutrition", title: "Mejorar alimentación", subtitle: "Comer mejor sin obsesionarte con la báscula." },
        { value: "increase_steps", title: "Aumentar pasos", subtitle: "Moverte más mientras mantienes el control nutricional." },
      ];
      return (
        <View style={styles.webWizardOptionGrid}>
          {options.map((option) => (
            <WebWizardOptionCard
              key={option.value}
              title={option.title}
              subtitle={option.subtitle}
              active={draft.primaryGoal === option.value}
              onPress={() => updateDraft({ primaryGoal: option.value })}
            />
          ))}
        </View>
      );
    }

    if (step === 3) {
      const options: Array<{ value: ActivityLevel; title: string; subtitle: string }> = [
        { value: "sedentary", title: "Muy poco activo", subtitle: "Trabajo sentado y poco movimiento diario." },
        { value: "light", title: "Ligero", subtitle: "Algo de paseo o actividad suave varias veces a la semana." },
        { value: "moderate", title: "Moderado", subtitle: "Te mueves con frecuencia y entrenas de forma regular." },
        { value: "active", title: "Activo", subtitle: "Entrenas fuerte o tu día ya exige bastante movimiento." },
        { value: "athlete", title: "Muy activo", subtitle: "Volumen alto de entrenamiento o trabajo físico constante." },
      ];
      return (
        <View style={styles.webWizardOptionColumn}>
          {options.map((option) => (
            <WebWizardOptionCard
              key={option.value}
              title={option.title}
              subtitle={option.subtitle}
              active={draft.activityLevel === option.value}
              onPress={() => updateDraft({ activityLevel: option.value })}
            />
          ))}
        </View>
      );
    }

    if (step === 4) {
      return (
        <View style={styles.webWizardSectionStack}>
          <View style={styles.webWizardFieldSection}>
            <Text style={styles.webWizardSectionLabel}>Sexo</Text>
            <View style={styles.webWizardChipRow}>
              <WebWizardChoiceChip label="Masculino" active={draft.sex === "male"} onPress={() => updateDraft({ sex: "male" })} />
              <WebWizardChoiceChip label="Femenino" active={draft.sex === "female"} onPress={() => updateDraft({ sex: "female" })} />
            </View>
          </View>

          <View style={styles.webWizardFieldSection}>
            <View style={styles.webWizardFieldSectionHeader}>
              <Text style={styles.webWizardSectionLabel}>Fecha de nacimiento</Text>
              {birthDateAge !== null ? (
                <View style={styles.webWizardAgePill}>
                  <Text style={styles.webWizardAgePillText}>{birthDateAge} años</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.webWizardBirthRow}>
              <View style={[styles.webWizardBirthCell, styles.webWizardBirthCellSmall]}>
                <Text style={styles.webWizardBirthLabel}>Día</Text>
                <TextInput
                  value={birthDateDraftParts.day}
                  onChangeText={(value) => updateBirthDatePart("day", value)}
                  placeholder="DD"
                  keyboardType="numeric"
                  inputMode="numeric"
                  style={styles.webWizardBirthInput}
                />
              </View>
              <View style={[styles.webWizardBirthCell, styles.webWizardBirthCellSmall]}>
                <Text style={styles.webWizardBirthLabel}>Mes</Text>
                <TextInput
                  value={birthDateDraftParts.month}
                  onChangeText={(value) => updateBirthDatePart("month", value)}
                  placeholder="MM"
                  keyboardType="numeric"
                  inputMode="numeric"
                  style={styles.webWizardBirthInput}
                />
              </View>
              <View style={[styles.webWizardBirthCell, styles.webWizardBirthCellLarge]}>
                <Text style={styles.webWizardBirthLabel}>Año</Text>
                <TextInput
                  value={birthDateDraftParts.year}
                  onChangeText={(value) => updateBirthDatePart("year", value)}
                  placeholder="YYYY"
                  keyboardType="numeric"
                  inputMode="numeric"
                  style={styles.webWizardBirthInput}
                />
              </View>
            </View>
          </View>
        </View>
      );
    }

    if (step === 5) {
      return (
        <View style={styles.webWizardSectionStack}>
          <View style={styles.webWizardFieldSection}>
            <View style={styles.webWizardFieldSectionHeader}>
              <Text style={styles.webWizardSectionLabel}>Sistema de unidades</Text>
              <Text style={styles.webWizardSectionHelper}>Puedes cambiar entre métrico e imperial cuando quieras.</Text>
            </View>
            <View style={styles.webWizardChipRow}>
              <WebWizardChoiceChip label="Métrico" active={draft.measurementSystem === "metric"} onPress={() => switchMeasurementSystem("metric")} />
              <WebWizardChoiceChip label="Imperial" active={draft.measurementSystem === "imperial"} onPress={() => switchMeasurementSystem("imperial")} />
            </View>
          </View>

          {draft.measurementSystem === "metric" ? (
            <View style={styles.webWizardMetricGrid}>
              <InputField
                label="Altura (cm)"
                value={draft.heightCm}
                onChangeText={(value) => updateDraft({ heightCm: value })}
                keyboardType="numeric"
                placeholder="Ej: 178"
                containerStyle={styles.webWizardFieldCompact}
                labelStyle={styles.webWizardFieldLabel}
                inputStyle={styles.webWizardFieldInput}
              />
              <InputField
                label="Peso actual (kg)"
                value={draft.currentWeightKg}
                onChangeText={(value) => updateDraft({ currentWeightKg: value })}
                keyboardType="numeric"
                placeholder="Ej: 82"
                containerStyle={styles.webWizardFieldCompact}
                labelStyle={styles.webWizardFieldLabel}
                inputStyle={styles.webWizardFieldInput}
              />
              <InputField
                label="Peso deseado (kg)"
                value={draft.targetWeightKg}
                onChangeText={(value) => updateDraft({ targetWeightKg: value })}
                keyboardType="numeric"
                placeholder="Ej: 76"
                containerStyle={styles.webWizardFieldCompact}
                labelStyle={styles.webWizardFieldLabel}
                inputStyle={styles.webWizardFieldInput}
              />
            </View>
          ) : (
            <View style={styles.webWizardMetricGrid}>
              <View style={styles.webWizardImperialHeightRow}>
                <InputField
                  label="Altura (ft)"
                  value={draft.heightFt}
                  onChangeText={(value) => updateDraft({ heightFt: value })}
                  keyboardType="numeric"
                  placeholder="5"
                  containerStyle={styles.webWizardFieldCompact}
                  labelStyle={styles.webWizardFieldLabel}
                  inputStyle={styles.webWizardFieldInput}
                />
                <InputField
                  label="Altura (in)"
                  value={draft.heightIn}
                  onChangeText={(value) => updateDraft({ heightIn: value })}
                  keyboardType="numeric"
                  placeholder="10"
                  containerStyle={styles.webWizardFieldCompact}
                  labelStyle={styles.webWizardFieldLabel}
                  inputStyle={styles.webWizardFieldInput}
                />
              </View>
              <InputField
                label="Peso actual (lb)"
                value={draft.currentWeightLb}
                onChangeText={(value) => updateDraft({ currentWeightLb: value })}
                keyboardType="numeric"
                placeholder="Ej: 181"
                containerStyle={styles.webWizardFieldCompact}
                labelStyle={styles.webWizardFieldLabel}
                inputStyle={styles.webWizardFieldInput}
              />
              <InputField
                label="Peso deseado (lb)"
                value={draft.targetWeightLb}
                onChangeText={(value) => updateDraft({ targetWeightLb: value })}
                keyboardType="numeric"
                placeholder="Ej: 168"
                containerStyle={styles.webWizardFieldCompact}
                labelStyle={styles.webWizardFieldLabel}
                inputStyle={styles.webWizardFieldInput}
              />
            </View>
          )}

          <View style={styles.webWizardSummaryStrip}>
            <View style={styles.webWizardSummaryMetric}>
              <Text style={styles.webWizardSummaryMetricLabel}>IMC estimado</Text>
              <Text style={styles.webWizardSummaryMetricValue}>{bmiPreview != null ? bmiPreview.toFixed(1) : "--"}</Text>
            </View>
            <View style={styles.webWizardSummaryMetric}>
              <Text style={styles.webWizardSummaryMetricLabel}>Meta</Text>
              <Text style={styles.webWizardSummaryMetricValue}>
                {currentWeightKg != null && targetWeightKg != null ? `${(targetWeightKg - currentWeightKg).toFixed(1)} kg` : "--"}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    if (step === 6) {
      return (
        <View style={styles.webWizardOptionColumn}>
          {weeklyGoalOptions.map((option) => (
            <WebWizardOptionCard
              key={`${draft.primaryGoal}-${option.value || "none"}`}
              title={option.label}
              subtitle={option.description}
              active={draft.weeklyGoalKg === option.value}
              recommended={Boolean(option.recommended)}
              onPress={() => updateDraft({ weeklyGoalKg: option.value })}
            />
          ))}
        </View>
      );
    }

    return (
      <View style={styles.webWizardSectionStack}>
        <InputField
          label="Email"
          value={draft.email}
          onChangeText={(value) => updateDraft({ email: value })}
          keyboardType="email-address"
          placeholder="tu@email.com"
          containerStyle={styles.webWizardFieldCompact}
          labelStyle={styles.webWizardFieldLabel}
          inputStyle={styles.webWizardFieldInput}
        />
        <InputField
          label="Contraseña"
          value={draft.password}
          onChangeText={(value) => updateDraft({ password: value })}
          secureTextEntry
          placeholder="Mínimo 8 caracteres"
          containerStyle={styles.webWizardFieldCompact}
          labelStyle={styles.webWizardFieldLabel}
          inputStyle={styles.webWizardFieldInput}
        />
        {draft.password ? (
          <View style={styles.passwordStrengthWrap}>
            <View style={styles.passwordStrengthHeader}>
              <Text style={styles.helperText}>Seguridad de contraseña</Text>
              <Text style={[styles.passwordStrengthLabel, { color: passwordStrengthMeta(draft.password).color }]}>
                {passwordStrengthMeta(draft.password).label}
              </Text>
            </View>
            <View style={styles.passwordStrengthTrack}>
              <View
                style={[
                  styles.passwordStrengthFill,
                  {
                    width: `${Math.min(100, (passwordStrengthMeta(draft.password).score / 6) * 100)}%`,
                    backgroundColor: passwordStrengthMeta(draft.password).color,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}
        <InputField
          label="Confirmar contraseña"
          value={draft.confirmPassword}
          onChangeText={(value) => updateDraft({ confirmPassword: value })}
          secureTextEntry
          placeholder="Repite la contraseña"
          containerStyle={styles.webWizardFieldCompact}
          labelStyle={styles.webWizardFieldLabel}
          inputStyle={styles.webWizardFieldInput}
        />
        <WebWizardCheckbox
          checked={draft.acceptedTerms}
          label="Acepto los términos y que NutrIA use estos datos para calcular mi plan."
          onPress={() => updateDraft({ acceptedTerms: !draft.acceptedTerms })}
        />

        <View style={styles.webWizardDividerRow}>
          <View style={styles.webWizardDividerLine} />
          <Text style={styles.webWizardDividerText}>o</Text>
          <View style={styles.webWizardDividerLine} />
        </View>

        <GoogleAuthButton
          mode="continue_with"
          variant="inline"
          disabled={loading}
          showConfigHint
          helperText="Si prefieres no crear contraseña, termina el alta con tu cuenta de Google."
          missingConfigText="Falta configurar EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en el frontend web para activar Google Sign-In."
          onCredential={(credential) => {
            void submitWithGoogle(credential);
          }}
        />
      </View>
    );
  };

  const renderStepPane = (step: WebSignupStep) => {
    const copy = stepCopy(step);
    return (
      <View style={styles.webOnboardingStepPaneContent}>
        <Text style={styles.webOnboardingStepTitle}>{copy.title}</Text>
        <Text style={styles.webOnboardingStepSubtitle}>{copy.subtitle}</Text>
        <View style={styles.webOnboardingStepBody}>{renderStepBody(step)}</View>
      </View>
    );
  };

  const visualStep = incomingStep ?? displayStep;

  return (
    <OnboardingLayout onHome={onBack} actions={[{ label: "Iniciar sesión", onPress: onBack }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.webOnboardingScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.webOnboardingBrandBlock}>
            <Text style={styles.webOnboardingBrandEyebrow}>NUTRIA</Text>
            <Text style={styles.webOnboardingBrandTitle}>Configura tu plan en unos pasos claros</Text>
            <Text style={styles.webOnboardingBrandSubtitle}>Nutrición, macros y seguimiento corporal sin convertir esto en un formulario infinito.</Text>
          </View>

          <View style={styles.webOnboardingCard}>
            <WebWizardProgress step={visualStep} total={7} />

            <View style={styles.webOnboardingStepShell}>
              <Animated.View
                style={[
                  styles.webOnboardingStepPane,
                  {
                    transform: [{ translateX: currentPaneTranslate }],
                    opacity: currentPaneOpacity,
                  },
                ]}
              >
                {renderStepPane(displayStep)}
              </Animated.View>
              {incomingStep ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.webOnboardingStepPane,
                    styles.webOnboardingStepPaneOverlay,
                    {
                      transform: [{ translateX: incomingPaneTranslate }],
                      opacity: incomingPaneOpacity,
                    },
                  ]}
                >
                  {renderStepPane(incomingStep)}
                </Animated.View>
              ) : null}
            </View>

            <View style={styles.webOnboardingFooter}>
              <SecondaryButton
                title={displayStep === 1 ? "Volver" : "Atrás"}
                onPress={goBack}
                disabled={loading || transitioning}
                style={styles.webOnboardingSecondaryBtn}
                textStyle={styles.webOnboardingSecondaryBtnText}
              />
              {displayStep < 7 ? (
                <PrimaryButton title="Siguiente" onPress={goNext} disabled={loading || transitioning} style={styles.webOnboardingPrimaryBtn} />
              ) : (
                <PrimaryButton
                  title="Continuar"
                  loadingTitle="Creando cuenta..."
                  onPress={() => void submit()}
                  loading={loading}
                  disabled={transitioning}
                  style={styles.webOnboardingPrimaryBtn}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingLayout>
  );
}

function WebOnboardingFinalizeScreen() {
  const auth = useAuth();
  const draft = auth.webSignupDraft;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const goToWelcome = useCallback(() => {
    if (auth.user) {
      void auth.logout();
      return;
    }
    auth.clearPendingVerification();
  }, [auth]);

  const finalize = useCallback(async () => {
    if (!draft) {
      return;
    }
    const heightCm = parseWizardHeightCm(draft);
    const weightKg = parseWizardCurrentWeightKg(draft);
    if (!heightCm || !weightKg) {
      throw new Error("Faltan altura o peso para completar el plan inicial.");
    }
    const today = formatDateLocal(new Date());
    await auth.saveProfile({
      weight_kg: weightKg,
      height_cm: heightCm,
      age: ageFromBirthDateString(auth.user?.birth_date),
      sex: auth.user?.sex ?? draft.sex,
      activity_level: draft.activityLevel,
      goal_type: goalTypeFromPrimaryGoal(draft.primaryGoal),
      weekly_weight_goal_kg: draft.weeklyGoalKg ? Number(draft.weeklyGoalKg) : null,
      waist_cm: null,
      neck_cm: null,
      hip_cm: null,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
    });
    const analysis = await auth.fetchAnalysis(today);
    await auth.saveGoal(today, analysis.recommended_goal);
    await auth.setWebSignupDraft(null);
    await auth.refreshMe();
  }, [auth, draft]);

  useEffect(() => {
    if (startedRef.current || !draft?.pendingFinalize) {
      return;
    }
    startedRef.current = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await finalize();
      } catch (err) {
        setError(parseApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [draft?.pendingFinalize, finalize]);

  if (!draft?.pendingFinalize) {
    return null;
  }

  return (
    <OnboardingLayout onHome={goToWelcome}>
      <View style={styles.webOnboardingCenterWrap}>
        <View style={[styles.webOnboardingCard, styles.webOnboardingFinalizeCard]}>
          <WebWizardProgress step={7} total={7} />
          <Text style={styles.webOnboardingStepTitle}>Estamos preparando tu plan</Text>
          <Text style={styles.webOnboardingStepSubtitle}>Guardamos tu perfil y calculamos tus objetivos diarios para dejarte dentro directamente.</Text>
          {loading ? <ActivityIndicator color={theme.accent} size="large" /> : null}
          {error ? <Text style={styles.webOnboardingErrorText}>{error}</Text> : null}
          <View style={styles.webOnboardingFooter}>
            {error ? (
              <>
                <SecondaryButton
                  title="Abrir onboarding clásico"
                  onPress={() => {
                    void auth.setWebSignupDraft(draft ? { ...draft, pendingFinalize: false } : null);
                  }}
                  style={styles.webOnboardingSecondaryBtn}
                  textStyle={styles.webOnboardingSecondaryBtnText}
                />
                <PrimaryButton title="Reintentar" onPress={() => void finalize()} style={styles.webOnboardingPrimaryBtn} />
              </>
            ) : null}
          </View>
        </View>
      </View>
    </OnboardingLayout>
  );
}

function SignupScreen({ onBack }: { onBack: () => void }) {
  const auth = useAuth();
  const isWeb = Platform.OS === "web";
  if (isWeb) {
    return <WebSignupWizard onBack={onBack} />;
  }
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [birthDate, setBirthDate] = useState<Date>(new Date(2000, 0, 1));
  const [birthDateInput, setBirthDateInput] = useState("2000-01-01");
  const [birthDateParts, setBirthDateParts] = useState<BirthDateParts>(() => birthDatePartsFromValue("2000-01-01"));
  const [sex, setSex] = useState<Sex>("other");
  const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{
    state: "idle" | "checking" | "available" | "unavailable" | "invalid";
    message: string;
  }>({
    state: "idle",
    message: "",
  });
  const usernameCheckSeqRef = useRef(0);
  const usernameAlertedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const birthDateValue = formatDateForApi(birthDate);
  const strength = useMemo(() => passwordStrengthMeta(password), [password]);
  const birthDateAge = useMemo(() => ageFromBirthDateString(birthDateInput), [birthDateInput]);

  useEffect(() => {
    setBirthDateInput(birthDateValue);
    setBirthDateParts(birthDatePartsFromValue(birthDateValue));
  }, [birthDateValue]);

  useEffect(() => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      setUsernameStatus({ state: "idle", message: "" });
      usernameAlertedRef.current = null;
      return;
    }

    if (!/^[a-z0-9._]{3,32}$/.test(normalizedUsername)) {
      setUsernameStatus({
        state: "invalid",
        message: "Usa 3-32 caracteres: letras minúsculas, números, punto o guion bajo.",
      });
      return;
    }

    setUsernameStatus({ state: "checking", message: "Comprobando disponibilidad..." });
    const checkSeq = usernameCheckSeqRef.current + 1;
    usernameCheckSeqRef.current = checkSeq;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const availability = await auth.checkUsernameAvailability(normalizedUsername);
          if (usernameCheckSeqRef.current !== checkSeq) {
            return;
          }

          if (availability.available) {
            setUsernameStatus({
              state: "available",
              message: "Nombre disponible.",
            });
            usernameAlertedRef.current = null;
            return;
          }

          const message = availability.reason ?? "Ese nombre de usuario no está disponible.";
          setUsernameStatus({
            state: "unavailable",
            message,
          });
          if (usernameAlertedRef.current !== normalizedUsername) {
            showAlert("Usuario", message);
            usernameAlertedRef.current = normalizedUsername;
          }
        } catch {
          if (usernameCheckSeqRef.current !== checkSeq) {
            return;
          }
          setUsernameStatus({
            state: "idle",
            message: "",
          });
        }
      })();
    }, 350);

    return () => clearTimeout(timer);
  }, [auth, username]);

  const onBirthDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowBirthDatePicker(false);
    }
    if (event.type === "dismissed") {
      return;
    }
    if (selectedDate) {
      setBirthDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()));
    }
  };

  const updateBirthDatePart = useCallback((part: keyof BirthDateParts, rawValue: string) => {
    const sanitized = rawValue.replace(/\D/g, "").slice(0, part === "year" ? 4 : 2);
    setBirthDateParts((current) => {
      const next = { ...current, [part]: sanitized };
      const nextValue = birthDateValueFromParts(next);
      setBirthDateInput(nextValue || [next.year, next.month, next.day].filter(Boolean).join("-"));
      const parsed = parseBirthDateInput(nextValue);
      if (parsed) {
        setBirthDate(new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
      }
      return next;
    });
  }, []);

  const buildEffectiveBirthDate = useCallback(() => {
    if (!isWeb) {
      return birthDateValue;
    }
    const candidate = birthDateValueFromParts(birthDateParts);
    return candidate || birthDateInput.trim();
  }, [birthDateInput, birthDateParts, birthDateValue, isWeb]);

  const normalizeGoogleUsername = useCallback(() => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      return "";
    }
    if (!/^[a-z0-9._]{3,32}$/.test(normalizedUsername)) {
      throw new Error("Usa 3-32 caracteres: letras minúsculas, números, punto o guion bajo.");
    }
    if (usernameStatus.state === "checking") {
      throw new Error("Comprobando disponibilidad del nombre de usuario.");
    }
    if (usernameStatus.state === "invalid" || usernameStatus.state === "unavailable") {
      throw new Error(usernameStatus.message || "Ese nombre de usuario no está disponible.");
    }
    return normalizedUsername;
  }, [username, usernameStatus.message, usernameStatus.state]);

  const submit = async () => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername || !email.trim() || !password.trim()) {
      showAlert("Faltan datos", "Completa usuario, email, contraseña, sexo y fecha de nacimiento.");
      return;
    }
    if (!/^[a-z0-9._]{3,32}$/.test(normalizedUsername)) {
      showAlert("Usuario", "Usa 3-32 caracteres: letras minúsculas, números, punto o guion bajo.");
      return;
    }
    if (password.length < 8) {
      showAlert("Contraseña", "Debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      showAlert("Contraseña", "Las contraseñas no coinciden.");
      return;
    }
    if (usernameStatus.state === "checking") {
      showAlert("Usuario", "Comprobando disponibilidad del nombre de usuario.");
      return;
    }
    if (usernameStatus.state === "invalid" || usernameStatus.state === "unavailable") {
      showAlert("Usuario", usernameStatus.message || "Ese nombre de usuario no está disponible.");
      return;
    }
    const effectiveBirthDate = buildEffectiveBirthDate() || birthDateValue;
    const parsedBirthDate = parseBirthDateInput(effectiveBirthDate);
    if (!parsedBirthDate) {
      showAlert("Fecha de nacimiento", "Usa formato YYYY-MM-DD.");
      return;
    }

    const age = ageFromBirthDateString(effectiveBirthDate);
    if (age === null || age < 13) {
      showAlert("Fecha de nacimiento", "Debes tener al menos 13 años.");
      return;
    }

    setLoading(true);
    try {
      const response = await auth.register({
        username: normalizedUsername,
        email: email.trim().toLowerCase(),
        password,
        sex,
        birth_date: effectiveBirthDate,
      });
      showAlert("Cuenta creada", response.message);
    } catch (error) {
      const message = parseApiError(error);
      if (message.includes("Endpoint no encontrado")) {
        showAlert("Registro", `${message}\nURL API activa: ${auth.apiBaseUrl}`);
      } else {
        showAlert("Registro", message);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitWithGoogle = async (credential: string) => {
    const effectiveBirthDate = buildEffectiveBirthDate() || birthDateValue;
    const parsedBirthDate = parseBirthDateInput(effectiveBirthDate);
    if (!parsedBirthDate) {
      showAlert("Fecha de nacimiento", "Completa una fecha válida antes de usar Google.");
      return;
    }
    const age = ageFromBirthDateString(effectiveBirthDate);
    if (age === null || age < 13) {
      showAlert("Fecha de nacimiento", "Debes tener al menos 13 años.");
      return;
    }

    let preferredUsername = "";
    try {
      preferredUsername = normalizeGoogleUsername();
    } catch (error) {
      showAlert("Usuario", error instanceof Error ? error.message : "Revisa el nombre de usuario.");
      return;
    }

    setLoading(true);
    try {
      await auth.googleSignIn({
        credential,
        username: preferredUsername || undefined,
        sex,
        birth_date: effectiveBirthDate,
      });
    } catch (error) {
      showAlert("Google", parseApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled =
    loading ||
    usernameStatus.state === "checking" ||
    usernameStatus.state === "invalid" ||
    usernameStatus.state === "unavailable";

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <AppHeader title="Crear cuenta" subtitle="Define cuenta, sexo y fecha de nacimiento; luego verificas con OTP." />

          <InputField
            label="Nombre de usuario"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          {usernameStatus.message ? (
            <Text
              style={[
                styles.usernameStatusText,
                usernameStatus.state === "available"
                  ? styles.usernameStatusTextOk
                  : usernameStatus.state === "unavailable" || usernameStatus.state === "invalid"
                    ? styles.usernameStatusTextError
                    : undefined,
              ]}
            >
              {usernameStatus.message}
            </Text>
          ) : null}
          <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <InputField label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
          {password ? (
            <View style={styles.passwordStrengthWrap}>
              <View style={styles.passwordStrengthHeader}>
                <Text style={styles.helperText}>Seguridad de contraseña</Text>
                <Text style={[styles.passwordStrengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
              <View style={styles.passwordStrengthTrack}>
                <View style={[styles.passwordStrengthFill, { width: `${Math.min(100, (strength.score / 6) * 100)}%`, backgroundColor: strength.color }]} />
              </View>
            </View>
          ) : null}
          <InputField label="Confirmar contraseña" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
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
          {isWeb ? (
            <View style={styles.birthDateCard}>
              <View style={styles.birthDateCardHeader}>
                <View>
                  <Text style={styles.birthDateCardTitle}>Fecha de nacimiento</Text>
                  <Text style={styles.birthDateCardSubtitle}>La usamos para calcular edad, perfil y objetivos realistas.</Text>
                </View>
                {birthDateAge !== null ? (
                  <View style={styles.birthDateAgePill}>
                    <Text style={styles.birthDateAgeValue}>{birthDateAge}</Text>
                    <Text style={styles.birthDateAgeLabel}>años</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.birthDateSegmentRow}>
                <View style={[styles.birthDateSegmentCard, styles.birthDateSegmentCardSmall]}>
                  <Text style={styles.birthDateSegmentLabel}>Día</Text>
                  <RNTextInput
                    value={birthDateParts.day}
                    onChangeText={(value) => updateBirthDatePart("day", value)}
                    placeholder="DD"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    inputMode="numeric"
                    style={styles.birthDateSegmentInput}
                  />
                </View>
                <View style={[styles.birthDateSegmentCard, styles.birthDateSegmentCardSmall]}>
                  <Text style={styles.birthDateSegmentLabel}>Mes</Text>
                  <RNTextInput
                    value={birthDateParts.month}
                    onChangeText={(value) => updateBirthDatePart("month", value)}
                    placeholder="MM"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    inputMode="numeric"
                    style={styles.birthDateSegmentInput}
                  />
                </View>
                <View style={[styles.birthDateSegmentCard, styles.birthDateSegmentCardLarge]}>
                  <Text style={styles.birthDateSegmentLabel}>Año</Text>
                  <RNTextInput
                    value={birthDateParts.year}
                    onChangeText={(value) => updateBirthDatePart("year", value)}
                    placeholder="YYYY"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    inputMode="numeric"
                    style={styles.birthDateSegmentInput}
                  />
                </View>
              </View>
              <Text style={styles.fieldHelperText}>Formato real: {buildEffectiveBirthDate() || "YYYY-MM-DD"}</Text>
            </View>
          ) : (
            <>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Fecha de nacimiento</Text>
                <Pressable style={styles.dateFieldButton} onPress={() => setShowBirthDatePicker(true)}>
                  <Text style={styles.dateFieldButtonText}>{birthDateValue}</Text>
                </Pressable>
              </View>
              {showBirthDatePicker ? (
                <View style={styles.birthDatePickerWrap}>
                  <DateTimePicker
                    value={birthDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    maximumDate={new Date()}
                    onChange={onBirthDateChange}
                  />
                  {Platform.OS === "ios" ? <SecondaryButton title="Listo" onPress={() => setShowBirthDatePicker(false)} /> : null}
                </View>
              ) : null}
            </>
          )}

          <PrimaryButton title="Crear cuenta" onPress={submit} loading={loading} disabled={isSubmitDisabled} />
          <GoogleAuthButton
            mode="signup_with"
            disabled={loading}
            helperText="Crea la cuenta con Google y conserva los datos de perfil que acabas de indicar."
            onCredential={(credential) => {
              void submitWithGoogle(credential);
            }}
          />
          <SecondaryButton title="Volver" onPress={onBack} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WebLoginScreen({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  const auth = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async () => {
    if (!identifier.trim() || !password.trim()) {
      setErrorMessage("Completa tu correo o usuario y la contraseña.");
      return;
    }

    setErrorMessage("");
    setLoading(true);
    try {
      await auth.login({ email: identifier.trim().toLowerCase(), password });
    } catch (error) {
      const message = parseApiError(error);
      setErrorMessage(
        message.includes("Endpoint no encontrado") ||
          message.includes("API base URL") ||
          message.includes("Cloudflare Pages") ||
          message.includes("405")
          ? `${message}\nURL API activa: ${auth.apiBaseUrl || "sin configurar"}`
          : message,
      );
    } finally {
      setLoading(false);
    }
  };

  const submitWithGoogle = async (credential: string) => {
    setErrorMessage("");
    setLoading(true);
    try {
      await auth.googleSignIn({ credential });
    } catch (error) {
      const message = parseApiError(error);
      setErrorMessage(message.includes("API base URL") || message.includes("Cloudflare Pages") ? `${message}\nURL API activa: ${auth.apiBaseUrl || "sin configurar"}` : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout onHome={onBack} actions={[{ label: "Crear cuenta", onPress: onCreate, primary: true }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.webOnboardingScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.webOnboardingBrandBlock}>
            <Text style={styles.webOnboardingBrandEyebrow}>NUTRIA</Text>
            <Text style={styles.webOnboardingBrandTitle}>Bienvenido de nuevo</Text>
            <Text style={styles.webOnboardingBrandSubtitle}>Accede para seguir con tu nutrición, progreso y objetivos.</Text>
          </View>

          <View style={[styles.webOnboardingCard, styles.webAuthCardCompact]}>
            <View style={styles.webAuthHeader}>
              <Text style={styles.webAuthCardTitle}>Inicia sesión en NutrIA</Text>
              <Text style={styles.webAuthCardSubtitle}>Usa tu correo o tu nombre de usuario si ya tienes cuenta verificada.</Text>
            </View>

            <InputField
              label="Correo electrónico o nombre de usuario"
              value={identifier}
              onChangeText={(value) => {
                setIdentifier(value);
                if (errorMessage) {
                  setErrorMessage("");
                }
              }}
              placeholder="Ej: danielfit o tu@email.com"
              autoCapitalize="none"
              autoFocus
              containerStyle={styles.webWizardFieldCompact}
              labelStyle={styles.webWizardFieldLabel}
              inputStyle={styles.webWizardFieldInput}
              invalid={Boolean(errorMessage) && !identifier.trim()}
            />
            <InputField
              label="Contraseña"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (errorMessage) {
                  setErrorMessage("");
                }
              }}
              secureTextEntry
              placeholder="Tu contraseña"
              containerStyle={styles.webWizardFieldCompact}
              labelStyle={styles.webWizardFieldLabel}
              inputStyle={styles.webWizardFieldInput}
              invalid={Boolean(errorMessage) && !password.trim()}
              onSubmitEditing={() => {
                void submit();
              }}
            />

            {errorMessage ? (
              <View style={styles.webAuthErrorCard}>
                <Text style={styles.webAuthErrorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <PrimaryButton
              title="Iniciar sesión"
              loadingTitle="Entrando..."
              onPress={() => void submit()}
              loading={loading}
              style={styles.webOnboardingPrimaryBtn}
            />

            <View style={styles.webWizardDividerRow}>
              <View style={styles.webWizardDividerLine} />
              <Text style={styles.webWizardDividerText}>o</Text>
              <View style={styles.webWizardDividerLine} />
            </View>

            <GoogleAuthButton
              mode="continue_with"
              variant="inline"
              disabled={loading}
              showConfigHint
              helperText="Entra con la misma cuenta de Google con la que creaste el perfil."
              missingConfigText="Falta configurar EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en el frontend web para activar Google Sign-In."
              onCredential={(credential) => {
                void submitWithGoogle(credential);
              }}
            />

            <View style={styles.webAuthLinkRow}>
              <Text style={styles.webAuthLinkLabel}>¿No tienes cuenta?</Text>
              <Pressable
                onPress={onCreate}
                style={({ pressed }) => [styles.webAuthLinkAction, pressed && styles.webAuthLinkActionPressed]}
              >
                <Text style={styles.webAuthLinkActionText}>Crear cuenta</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthLayout>
  );
}

function LoginScreen({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  const auth = useAuth();
  const isWeb = Platform.OS === "web";
  if (isWeb) {
    return <WebLoginScreen onBack={onBack} onCreate={onCreate} />;
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert("Faltan datos", "Completa email y contraseña.");
      return;
    }

    setLoading(true);
    try {
      await auth.login({ email: email.trim().toLowerCase(), password });
    } catch (error) {
      const message = parseApiError(error);
      if (message.includes("Endpoint no encontrado")) {
        showAlert("Login", `${message}\nURL API activa: ${auth.apiBaseUrl}`);
      } else {
        showAlert("Login", message);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitWithGoogle = async (credential: string) => {
    setLoading(true);
    try {
      await auth.googleSignIn({ credential });
    } catch (error) {
      showAlert("Google", parseApiError(error));
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
          <GoogleAuthButton
            mode="continue_with"
            disabled={loading}
            helperText="Entra con la misma cuenta de Google con la que creaste el perfil."
            onCredential={(credential) => {
              void submitWithGoogle(credential);
            }}
          />
          <SecondaryButton title="Volver" onPress={onBack} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthStack() {
  const isWeb = Platform.OS === "web";
  const router = useWebRouter();
  const [screen, setScreen] = useState<AuthStackScreen>("welcome");

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const normalized = normalizeWebPath(router.path);
    if (normalized === "/login") {
      setScreen("login");
      return;
    }
    if (normalized === "/register") {
      setScreen("signup");
      return;
    }
    if (normalized === "/") {
      setScreen("welcome");
      return;
    }
    router.replace("/");
    setScreen("welcome");
  }, [isWeb, router]);

  const goToScreen = useCallback(
    (nextScreen: AuthStackScreen, options?: { replace?: boolean }) => {
      if (!isWeb) {
        setScreen(nextScreen);
        return;
      }
      const nextPath = nextScreen === "login" ? "/login" : nextScreen === "signup" ? "/register" : "/";
      if (options?.replace) {
        router.replace(nextPath);
        return;
      }
      router.navigate(nextPath);
    },
    [isWeb, router],
  );

  if (screen === "signup") {
    return <SignupScreen onBack={() => goToScreen("welcome")} />;
  }
  if (screen === "login") {
    return <LoginScreen onBack={() => goToScreen("welcome")} onCreate={() => goToScreen("signup")} />;
  }
  return <WelcomeScreen onCreate={() => goToScreen("signup")} onLogin={() => goToScreen("login")} />;
}

function VerifyEmailOnlyScreen() {
  const auth = useAuth();
  const isWeb = Platform.OS === "web";
  const email = auth.user?.email ?? auth.pendingVerificationEmail;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const goToWelcome = useCallback(() => {
    if (auth.user) {
      void auth.logout();
      return;
    }
    auth.clearPendingVerification();
  }, [auth]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setInterval(() => setCooldown((current) => Math.max(current - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!email) {
    if (isWeb) {
      return (
        <AuthLayout onHome={goToWelcome}>
          <View style={styles.centered}>
            <Text style={styles.helperText}>Falta email para verificar.</Text>
            <SecondaryButton title="Volver" onPress={auth.clearPendingVerification} />
          </View>
        </AuthLayout>
      );
    }
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
      showAlert("Código", "Introduce un código válido.");
      return;
    }

    setLoading(true);
    try {
      await auth.verifyEmail(email, code.trim());
    } catch (error) {
      showAlert("Verificación", parseApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await auth.resendCode(email);
      setCooldown(60);
      showAlert("Código enviado", "Revisa tu email o el log del backend en modo dev.");
    } catch (error) {
      showAlert("Reenviar", parseApiError(error));
    } finally {
      setResending(false);
    }
  };

  const content = (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
      <ScrollView contentContainerStyle={[styles.authScroll, isWeb && styles.authScrollWebOffset]} keyboardShouldPersistTaps="handled">
        <AppHeader title="Verificar email" subtitle={tx("Código OTP de 6 dígitos para {{email}}", { email })} />

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
          title={cooldown > 0 ? tx("Reenviar en {{cooldown}}s", { cooldown }) : "Reenviar código"}
          onPress={resend}
          disabled={cooldown > 0 || resending}
        />

        {auth.user ? <SecondaryButton title="Cerrar sesión" onPress={() => void auth.logout()} /> : null}
        {!auth.user ? <SecondaryButton title="Volver" onPress={auth.clearPendingVerification} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (isWeb) {
    return <AuthLayout onHome={goToWelcome}>{content}</AuthLayout>;
  }

  return <SafeAreaView style={styles.screen}>{content}</SafeAreaView>;
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
  const webSignupDraft = auth.webSignupDraft;
  if (Platform.OS === "web" && webSignupDraft?.pendingFinalize) {
    return <WebOnboardingFinalizeScreen />;
  }
  const [step, setStep] = useState<OnboardingStep>(1);
  const [saving, setSaving] = useState(false);

  const [weight, setWeight] = useState(
    auth.profile?.weight_kg ? String(auth.profile.weight_kg) : webSignupDraft ? String(parseWizardCurrentWeightKg(webSignupDraft) ?? "") : "",
  );
  const [height, setHeight] = useState(
    auth.profile?.height_cm ? String(auth.profile.height_cm) : webSignupDraft ? String(parseWizardHeightCm(webSignupDraft) ?? "") : "",
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(auth.profile?.activity_level ?? webSignupDraft?.activityLevel ?? "moderate");
  const [goalType, setGoalType] = useState<GoalType>(auth.profile?.goal_type ?? (webSignupDraft ? goalTypeFromPrimaryGoal(webSignupDraft.primaryGoal) : "maintain"));

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
  const lockedSex: Sex = auth.user?.sex ?? auth.profile?.sex ?? "other";
  const lockedBirthDate = auth.user?.birth_date ?? null;
  const lockedAge = ageFromBirthDateString(lockedBirthDate);

  const numericWeight = toPositiveNumberOrNull(weight);
  const numericHeight = toPositiveNumberOrNull(height);
  const currentBmi = bmiValue(numericWeight, numericHeight);

  const draftBodyFat = estimateBodyFatPreview({
    sex: lockedSex,
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

      return {
        weight_kg: payloadWeight,
        height_cm: payloadHeight,
        age: lockedAge,
        sex: lockedSex,
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
    [activityLevel, arm, chest, goalType, height, hip, lockedAge, lockedSex, neck, thigh, waist, weight],
  );

  const goToStepThree = async (skipMeasures: boolean) => {
    const profilePayload = buildProfilePayload(skipMeasures);
    if (!profilePayload) {
      showAlert("Perfil", "Revisa los datos básicos.");
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
      showAlert("Onboarding", parseApiError(error));
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
      showAlert("Objetivo", "Kcal inválidas.");
      return;
    }

    setSaving(true);
    try {
      const response = await auth.saveGoal(today, payload);
      setGoalFeedback(response.feedback);
      await auth.refreshMe();
    } catch (error) {
      showAlert("Objetivo", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <AppHeader title="Onboarding" subtitle={tx("Paso {{step}} de 3", { step })} />

          {step === 1 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Paso 1: datos básicos</Text>
              <InputField label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="numeric" />
              <InputField label="Altura (cm)" value={height} onChangeText={setHeight} keyboardType="numeric" />
              <ReadOnlyField label="Fecha de nacimiento" value={lockedBirthDate ?? "No disponible"} />
              <ReadOnlyField label="Edad" value={lockedAge !== null ? String(lockedAge) : "No disponible"} />
              <ReadOnlyField label="Sexo" value={lockedSex} />

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
  variant?: "default" | "hero";
}) {
  const isHero = props.variant === "hero";
  const size = isHero ? 150 : 116;
  const stroke = isHero ? 12 : 10;
  const radius = (size - stroke) / 2;
  const circle = 2 * Math.PI * radius;
  const safeGoal = props.goal > 0 ? props.goal : 1;
  const progress = clamp(props.consumed / safeGoal, 0, 1);

  return (
    <View style={[styles.ringCard, isHero && styles.ringCardHero]}>
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
      <View style={[styles.ringCenter, isHero && styles.ringCenterHero]}>
        <Text style={[styles.ringLabel, isHero && styles.ringLabelHero]}>{props.label}</Text>
        <Text style={[styles.ringValue, isHero && styles.ringValueHero]}>{Math.round(props.consumed)}</Text>
        <Text style={[styles.ringUnit, isHero && styles.ringUnitHero]}>{props.unit}</Text>
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

function AddQuantityMacroSummary(props: { kcal: number; protein: number; carbs: number; fats: number }) {
  const size = 126;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments: Segment[] = [
    { label: "Carbohidratos", value: Math.max(props.carbs, 0), color: theme.carbs },
    { label: "Grasas", value: Math.max(props.fats, 0), color: theme.fats },
    { label: "Proteínas", value: Math.max(props.protein, 0), color: theme.protein },
  ];
  const total = Math.max(segments.reduce((acc, item) => acc + item.value, 0), 0.0001);
  let offset = 0;

  return (
    <View style={styles.addMacroSummaryWrap}>
      <View style={styles.addMacroRingWrap}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme.border}
              strokeWidth={stroke}
              fill="transparent"
            />
            {segments.map((segment) => {
              const ratio = segment.value / total;
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
        <View style={styles.addMacroRingCenter}>
          <Text style={styles.addMacroRingValue}>{Math.round(props.kcal)}</Text>
          <Text style={styles.addMacroRingUnit}>kcal</Text>
        </View>
      </View>

      <View style={styles.addMacroMetricsWrap}>
        {segments.map((segment) => {
          const pct = Math.round((segment.value / total) * 100);
          return (
            <View key={segment.label} style={styles.addMacroMetricItem}>
              <Text style={[styles.addMacroMetricPercent, { color: segment.color }]}>{pct}%</Text>
              <Text style={styles.addMacroMetricValue}>{(Math.round(segment.value * 10) / 10).toString().replace(".", ",")} g</Text>
              <Text style={styles.addMacroMetricLabel}>{segment.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function mealPrecisionMeta(
  confidenceLevel: MealPhotoEstimateResponse["confidence_level"],
  language: "es" | "en" = "es",
): {
  percent: number;
  label: string;
  tone: "accent" | "warning" | "danger";
  color: string;
} {
  if (confidenceLevel === "high") {
    return { percent: 86, label: language === "en" ? "High" : "Alta", tone: "accent", color: theme.ok };
  }
  if (confidenceLevel === "medium") {
    return { percent: 66, label: language === "en" ? "Medium" : "Media", tone: "warning", color: theme.warning };
  }
  return { percent: 44, label: language === "en" ? "Low" : "Baja", tone: "danger", color: theme.danger };
}

function DashboardScreen({
  isActive,
  onOpenBodyProgress,
}: {
  isActive: boolean;
  onOpenBodyProgress: () => void;
}) {
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const breakpoint = webBreakpoint(width);
  const isWeb = Platform.OS === "web";
  const useDesktopLayout = isDesktopWebLayout(width);
  const useWideDesktopLayout = isWideDesktopWebLayout(width);
  const webMainScrollStyle = useMemo(() => webMainContentContainerStyle(width), [width]);
  const selectedDate = formatDateLocal(new Date());
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
      showAlert("Dashboard", parseApiError(error));
    } finally {
      setLoadingSummary(false);
    }
  }, [auth.fetchDaySummary, selectedDate]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    void loadSummary();
  }, [isActive, loadSummary]);

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
  const username = auth.user?.username?.trim() || auth.user?.email?.split("@")[0] || "Usuario";
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);

  const goal = summary?.goal;
  const consumed = summary?.consumed;
  const showDashboardSkeleton = loadingSummary && !summary;
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
      notes.push(tx("Te faltan {{proteinRemaining}} g de proteína para tu objetivo.", { proteinRemaining: Math.round(proteinRemaining) }));
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
    showAlert("Eliminar consumo", "Este registro se borrará del día actual.", [
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
              showAlert("Eliminar consumo", parseApiError(error));
            }
          })();
        },
      },
    ]);
  };

  const heroSummaryCard = (
    <AppCard style={[styles.heroCard, exceededKcal && styles.heroCardExceeded, useDesktopLayout && styles.dashboardHeroDesktop]}>
      <SectionHeader title="Resumen del día" subtitle="Kcal restantes" />
      <Text
        style={[
          styles.heroRemainingValue,
          breakpoint === "tablet" && styles.heroRemainingValueTablet,
          breakpoint === "desktop" && styles.heroRemainingValueDesktop,
        ]}
      >
        {kcalGoal > 0 ? kcalRemaining : "-"}
      </Text>
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
          label={
            (summary?.intakes.length ?? 0) === 1
              ? tx("{{count}} registro", { count: summary?.intakes.length ?? 0 })
              : tx("{{count}} registros", { count: summary?.intakes.length ?? 0 })
          }
          tone={summary?.intakes.length ? "default" : "warning"}
        />
      </View>
    </AppCard>
  );

  const bodyTrackingCard = (
    <AppCard>
      <SectionHeader title="Seguimiento corporal" subtitle="Estado actual" actionLabel="Registrar peso" onAction={onOpenBodyProgress} />
      <View style={styles.metricTileRow}>
        <MetricCard label="Peso" value={auth.profile ? `${auth.profile.weight_kg} kg` : "-"} />
        <MetricCard label="IMC" value={auth.profile?.bmi ? auth.profile.bmi.toFixed(1) : "-"} />
        <MetricCard label="% grasa" value={auth.profile?.body_fat_percent ? `${auth.profile.body_fat_percent.toFixed(1)}%` : "N/D"} />
      </View>
      <Text style={styles.helperText}>Próximo paso: tendencia semanal de peso y cambio vs semana anterior.</Text>
    </AppCard>
  );

  const macroDayCard = (
    <AppCard>
      <SectionHeader title="Macros del día" subtitle="Vista rápida" />
      <View style={styles.macroToggleRow}>
        <Pressable style={[styles.macroToggleChip, macroViewMode === "rings" && styles.macroToggleChipActive]} onPress={() => setMacroViewMode("rings")}>
          <Text style={[styles.macroToggleText, macroViewMode === "rings" && styles.macroToggleTextActive]}>Aros</Text>
        </Pressable>
        <Pressable style={[styles.macroToggleChip, macroViewMode === "bars" && styles.macroToggleChipActive]} onPress={() => setMacroViewMode("bars")}>
          <Text style={[styles.macroToggleText, macroViewMode === "bars" && styles.macroToggleTextActive]}>Barras</Text>
        </Pressable>
      </View>

      {macroViewMode === "rings" ? (
        <View style={useDesktopLayout ? styles.dashboardRingsShowcaseGrid : styles.rowWrap}>
          <RingProgress
            variant={useDesktopLayout ? "hero" : "default"}
            label="kcal"
            consumed={summary?.consumed.kcal ?? 0}
            goal={summary?.goal?.kcal_goal ?? Math.max(summary?.consumed.kcal ?? 0, 1)}
            color={theme.kcal}
            unit="kcal"
          />
          <RingProgress
            variant={useDesktopLayout ? "hero" : "default"}
            label="prote"
            consumed={summary?.consumed.protein_g ?? 0}
            goal={summary?.goal?.protein_goal ?? Math.max(summary?.consumed.protein_g ?? 0, 1)}
            color={theme.protein}
            unit="g"
          />
          <RingProgress
            variant={useDesktopLayout ? "hero" : "default"}
            label="carbs"
            consumed={summary?.consumed.carbs_g ?? 0}
            goal={summary?.goal?.carbs_goal ?? Math.max(summary?.consumed.carbs_g ?? 0, 1)}
            color={theme.carbs}
            unit="g"
          />
          <RingProgress
            variant={useDesktopLayout ? "hero" : "default"}
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
  );

  const intakesCard = (
    <AppCard style={useDesktopLayout ? styles.dashboardDesktopFullRow : undefined}>
      <SectionHeader title="Consumos de hoy" subtitle="Línea temporal" actionLabel="Recargar" onAction={() => void loadSummary()} />
      {loadingSummary ? <ActivityIndicator color={theme.accent} /> : null}

      {!loadingSummary && summary && summary.intakes.length === 0 ? (
        <EmptyState title="Aún sin registros" subtitle="Escanea tu primer producto para empezar a construir tu día." />
      ) : null}

      {!loadingSummary && summary
        ? summary.intakes.map((item) => {
            const rawName = item.product_name ?? "Producto";
            const displayName = normalizeDisplayProductName(rawName);
            const isAiEstimated =
              item.estimated === true ||
              item.source_method === "meal_photo" ||
              item.source_method === "photo_estimate" ||
              /^estimado:\s*/i.test(rawName) ||
              /^estimaci[oó]n:\s*/i.test(rawName);

            return (
              <View key={item.id} style={styles.intakeRow}>
                <View style={styles.intakeTimeDotWrap}>
                  <View style={styles.intakeTimeDot} />
                  <Text style={styles.intakeMeta}>{new Date(item.created_at).toLocaleTimeString()}</Text>
                </View>
                <View style={styles.intakeMain}>
                  <View style={styles.intakeNameRow}>
                    <Text style={styles.intakeName} numberOfLines={1} ellipsizeMode="tail">
                      {displayName}
                    </Text>
                    {isAiEstimated ? (
                      <View style={styles.intakeAIBadge}>
                        <Text style={styles.intakeAIBadgeText}>IA</Text>
                      </View>
                    ) : null}
                  </View>
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
            );
          })
        : null}
    </AppCard>
  );

  const macroDonutBlock = <MacroDonut segments={segments} title="Distribución de macros consumidos" />;

  const quickInsightsCard = (
    <AppCard style={useDesktopLayout ? styles.dashboardDesktopInsightsCard : undefined}>
      <SectionHeader title="Consejos rápidos" subtitle="Recomendaciones prácticas" />
      {quickInsights.map((insight) => (
        <View key={insight} style={styles.insightRow}>
          <View style={styles.insightDot} />
          <Text style={styles.helperText}>{insight}</Text>
        </View>
      ))}
    </AppCard>
  );

  return (
    <>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.mainScroll, webMainScrollStyle]}>
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
          {!isWeb ? (
            <Pressable
              onPress={toggleAccountMenu}
              style={({ pressed }) => [styles.avatarPressable, pressed && styles.avatarPressablePressed]}
            >
              <AvatarCircle letter={displayName.slice(0, 1)} imageUrl={auth.user?.avatar_url} />
            </Pressable>
          ) : null}
        </View>

        {showDashboardSkeleton ? (
          <>
            <AppCard>
              <View style={styles.skeletonLineLg} />
              <View style={styles.skeletonLineMd} />
              <View style={styles.skeletonBlockTall} />
            </AppCard>
            <AppCard>
              <View style={styles.skeletonLineMd} />
              <View style={styles.skeletonRow}>
                <View style={styles.skeletonRing} />
                <View style={styles.skeletonRing} />
                <View style={styles.skeletonRing} />
              </View>
            </AppCard>
            <AppCard>
              <View style={styles.skeletonLineMd} />
              <View style={styles.skeletonLineSm} />
              <View style={styles.skeletonLineSm} />
              <View style={styles.skeletonLineSm} />
            </AppCard>
          </>
        ) : null}

        {!showDashboardSkeleton ? (
          <>
            {useDesktopLayout ? (
              <>
                <View style={[styles.dashboardDesktopMainGrid, useWideDesktopLayout && styles.dashboardDesktopMainGridWide]}>
                  <View style={styles.dashboardDesktopLeftColumn}>
                    {heroSummaryCard}
                    {macroDayCard}
                  </View>
                  <View style={styles.dashboardDesktopRightColumn}>
                    {bodyTrackingCard}
                    {macroDonutBlock}
                  </View>
                </View>
                {intakesCard}
                {quickInsightsCard}
              </>
            ) : (
              <>
                {heroSummaryCard}
                {macroDayCard}
                {bodyTrackingCard}
                {macroDonutBlock}
                {intakesCard}
                {quickInsightsCard}
              </>
            )}
          </>
        ) : null}
        </ScrollView>
      </SafeAreaView>
      {!isWeb && accountMenuVisible ? (
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
              <StatRow label="Usuario" value={auth.user?.username ?? "-"} />
              <StatRow label="Email" value={auth.user?.email ?? "-"} />
              <StatRow label="Email verificado" value={auth.user?.email_verified ? "Sí" : "No"} />
              <StatRow label="Onboarding" value={auth.user?.onboarding_completed ? "Completado" : "Pendiente"} />
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
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const breakpoint = webBreakpoint(width);
  const useDesktopLayout = isDesktopWebLayout(width);
  const useWideDesktopLayout = isWideDesktopWebLayout(width);
  const webMainScrollStyle = useMemo(() => webMainContentContainerStyle(width), [width]);
  const webBodyMenuSideInset = useMemo(() => webContentSideInset(width), [width]);
  const [loading, setLoading] = useState(true);
  const [savingWeight, setSavingWeight] = useState(false);
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [bodyActionMenuOpen, setBodyActionMenuOpen] = useState(false);
  const [bodyActionMenuVisible, setBodyActionMenuVisible] = useState(false);
  const bodyActionMenuAnim = useRef(new Animated.Value(0)).current;
  const [bodyFormModalType, setBodyFormModalType] = useState<"weight" | "measure" | null>(null);
  const [bodyFormModalVisible, setBodyFormModalVisible] = useState(false);
  const bodyFormModalAnim = useRef(new Animated.Value(0)).current;

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
      showAlert("Progreso corporal", parseApiError(error));
    } finally {
      setLoading(false);
    }
  }, [auth.fetchBodySummary, auth.fetchMeasurementLogs, auth.fetchWeightLogs]);

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

  const confirmSuspiciousBodyChange = useCallback(
    (title: string, message: string) =>
      new Promise<boolean>((resolve) => {
        showAlert(title, message, [
          {
            text: "Revisar",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Sí, guardar",
            style: "default",
            onPress: () => resolve(true),
          },
        ]);
      }),
    [],
  );

  const saveWeight = async () => {
    const value = toPositiveNumberOrNull(weightInput);
    if (!value) {
      showAlert("Peso", "Introduce un peso válido.");
      return;
    }
    const previousWeight = summary?.latest_weight_kg ?? auth.profile?.weight_kg ?? null;
    if (previousWeight != null) {
      const delta = Math.abs(value - previousWeight);
      if (delta >= 8) {
        const confirmed = await confirmSuspiciousBodyChange(
          "Peso",
          `Vas a pasar de ${previousWeight.toFixed(1)} kg a ${value.toFixed(1)} kg. Son ${delta.toFixed(
            1,
          )} kg de golpe. Si no has descubierto la teletransportación corporal, igual conviene revisar el número.`,
        );
        if (!confirmed) {
          return;
        }
      }
    }
    setSavingWeight(true);
    try {
      const created = await auth.createWeightLog({ weight_kg: value, note: weightNote.trim() || undefined });
      setWeightLogs((current) => [created, ...current.filter((row) => row.id !== created.id)]);
      const nextSummary = await auth.fetchBodySummary();
      setSummary(nextSummary);
      setWeightInput("");
      setWeightNote("");
      closeBodyFormModal();
    } catch (error) {
      showAlert("Peso", parseApiError(error));
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
      showAlert("Medidas", "Añade al menos una medida.");
      return;
    }
    const lastMeasurement = measurementLogs[0];
    const suspiciousChanges: string[] = [];
    if (payload.waist_cm != null && lastMeasurement?.waist_cm != null) {
      const delta = Math.abs(payload.waist_cm - lastMeasurement.waist_cm);
      if (delta >= 12) {
        suspiciousChanges.push(`cintura de ${lastMeasurement.waist_cm.toFixed(1)} a ${payload.waist_cm.toFixed(1)} cm`);
      }
    }
    if (payload.neck_cm != null && lastMeasurement?.neck_cm != null) {
      const delta = Math.abs(payload.neck_cm - lastMeasurement.neck_cm);
      if (delta >= 8) {
        suspiciousChanges.push(`cuello de ${lastMeasurement.neck_cm.toFixed(1)} a ${payload.neck_cm.toFixed(1)} cm`);
      }
    }
    if (payload.hip_cm != null && lastMeasurement?.hip_cm != null) {
      const delta = Math.abs(payload.hip_cm - lastMeasurement.hip_cm);
      if (delta >= 12) {
        suspiciousChanges.push(`cadera de ${lastMeasurement.hip_cm.toFixed(1)} a ${payload.hip_cm.toFixed(1)} cm`);
      }
    }
    if (suspiciousChanges.length > 0) {
      const confirmed = await confirmSuspiciousBodyChange(
        "Medidas",
        `Hay un cambio bastante salvaje en ${suspiciousChanges.join(", ")}. Si no te ha abducido un metro de costura travieso, revisa los valores antes de guardarlos.`,
      );
      if (!confirmed) {
        return;
      }
    }
    setSavingMeasure(true);
    try {
      const created = await auth.createMeasurementLog(payload);
      setMeasurementLogs((current) => [created, ...current.filter((row) => row.id !== created.id)]);
      const nextSummary = await auth.fetchBodySummary();
      setSummary(nextSummary);
      setWaistInput("");
      setNeckInput("");
      setHipInput("");
      closeBodyFormModal();
    } catch (error) {
      showAlert("Medidas", parseApiError(error));
    } finally {
      setSavingMeasure(false);
    }
  };

  const openBodyActionMenu = useCallback(() => {
    if (bodyActionMenuOpen) {
      return;
    }
    setBodyActionMenuVisible(true);
    setBodyActionMenuOpen(true);
    bodyActionMenuAnim.stopAnimation();
    Animated.spring(bodyActionMenuAnim, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.95,
      useNativeDriver: true,
    }).start();
  }, [bodyActionMenuAnim, bodyActionMenuOpen]);

  const closeBodyActionMenu = useCallback(
    (onClosed?: () => void) => {
      if (!bodyActionMenuVisible) {
        onClosed?.();
        return;
      }
      setBodyActionMenuOpen(false);
      bodyActionMenuAnim.stopAnimation();
      Animated.timing(bodyActionMenuAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setBodyActionMenuVisible(false);
        }
        onClosed?.();
      });
    },
    [bodyActionMenuAnim, bodyActionMenuVisible],
  );

  const toggleBodyActionMenu = useCallback(() => {
    if (bodyActionMenuOpen) {
      closeBodyActionMenu();
      return;
    }
    openBodyActionMenu();
  }, [bodyActionMenuOpen, closeBodyActionMenu, openBodyActionMenu]);

  const openBodyFormModal = useCallback(
    (type: "weight" | "measure") => {
      setBodyFormModalType(type);
      setBodyFormModalVisible(true);
      bodyFormModalAnim.stopAnimation();
      Animated.spring(bodyFormModalAnim, {
        toValue: 1,
        damping: 20,
        stiffness: 230,
        mass: 0.95,
        useNativeDriver: true,
      }).start();
    },
    [bodyFormModalAnim],
  );

  const closeBodyFormModal = useCallback(
    (onClosed?: () => void) => {
      if (!bodyFormModalVisible) {
        onClosed?.();
        return;
      }
      bodyFormModalAnim.stopAnimation();
      Animated.timing(bodyFormModalAnim, {
        toValue: 0,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setBodyFormModalVisible(false);
          setBodyFormModalType(null);
        }
        onClosed?.();
      });
    },
    [bodyFormModalAnim, bodyFormModalVisible],
  );

  const showWeightFormFromMenu = useCallback(() => {
    closeBodyActionMenu(() => openBodyFormModal("weight"));
  }, [closeBodyActionMenu, openBodyFormModal]);

  const showMeasureFormFromMenu = useCallback(() => {
    closeBodyActionMenu(() => openBodyFormModal("measure"));
  }, [closeBodyActionMenu, openBodyFormModal]);

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
  const showBodySkeleton = loading && !summary && weightLogs.length === 0 && measurementLogs.length === 0;
  const bodyActionMenuTranslateY = bodyActionMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 0],
  });
  const bodyActionMenuScale = bodyActionMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const bodyActionMenuBackdropOpacity = bodyActionMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const bodyFormModalTranslateY = bodyFormModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const bodyFormModalScale = bodyFormModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const bodyFormModalBackdropOpacity = bodyFormModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (showBodySkeleton) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.mainScroll, webMainScrollStyle]}>
          <View style={styles.bodyPageHeader}>
            <View style={styles.bodyPageHeaderCopy}>
              <Text style={styles.bodyPageTitle}>Cuerpo</Text>
              <Text style={styles.bodyPageSubtitle}>Composición corporal, tendencia y métricas clave.</Text>
            </View>
            <View style={styles.bodyHeaderActionBtn}>
              <Text style={styles.bodyHeaderActionText}>...</Text>
            </View>
          </View>
          <AppCard>
            <View style={styles.skeletonLineLg} />
            <View style={styles.skeletonRow}>
              <View style={styles.skeletonTile} />
              <View style={styles.skeletonTile} />
            </View>
          </AppCard>
          <AppCard>
            <View style={styles.skeletonLineMd} />
            <View style={styles.skeletonBlockTall} />
          </AppCard>
          <AppCard>
            <View style={styles.skeletonLineMd} />
            <View style={styles.skeletonLineSm} />
            <View style={styles.skeletonLineSm} />
            <View style={styles.skeletonLineSm} />
          </AppCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.mainScroll, webMainScrollStyle]}>
        <View style={styles.bodyPageHeader}>
          <View style={styles.bodyPageHeaderCopy}>
            <Text style={styles.bodyPageTitle}>Cuerpo</Text>
            <Text style={styles.bodyPageSubtitle}>Composición corporal, tendencia y métricas clave.</Text>
          </View>
          <Pressable onPress={toggleBodyActionMenu} style={styles.bodyHeaderActionBtn}>
            <Text style={styles.bodyHeaderActionText}>Registrar</Text>
          </Pressable>
        </View>

        <View style={useDesktopLayout ? [styles.desktopSectionGrid, useWideDesktopLayout && styles.desktopSectionGridWide] : undefined}>
        <AppCard style={useDesktopLayout ? styles.desktopSectionGridFull : undefined}>
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
          {summary?.weekly_weight_goal_kg != null ? (
            <Text style={styles.helperText}>Objetivo semanal configurado: {summary.weekly_weight_goal_kg.toFixed(2)} kg.</Text>
          ) : null}
        </AppCard>

        <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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
              ["Bajo peso", "#8ba3c7"],
              ["Normal", "#7bb8ad"],
              ["Sobrepeso", "#ccb086"],
              ["Obesidad", "#c89a9a"],
            ].map(([label, color]) => (
              <View key={label} style={styles.bodyLegendItem}>
                <View style={[styles.bodyLegendSwatch, { backgroundColor: color }]} />
                <Text style={styles.bodyLegendLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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

        <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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

        <AppCard style={useDesktopLayout ? styles.desktopSectionGridFull : undefined}>
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

        </View>
        </ScrollView>
      </SafeAreaView>
      {bodyFormModalVisible ? (
        <View style={styles.bodyFormModalLayer} pointerEvents="box-none">
          <Pressable style={styles.bodyFormModalBackdrop} onPress={() => closeBodyFormModal()}>
            <Animated.View style={[styles.bodyFormModalScrim, { opacity: bodyFormModalBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.bodyFormModalContainer,
              {
                opacity: bodyFormModalAnim,
                transform: [{ translateY: bodyFormModalTranslateY }, { scale: bodyFormModalScale }],
              },
            ]}
          >
            <Pressable style={styles.bodyFormModalCard} onPress={() => {}}>
              {bodyFormModalType === "weight" ? (
                <>
                  <SectionHeader title="Registrar peso" subtitle="Añade hoy en un toque" />
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
                    <SecondaryButton title="Cerrar" onPress={() => closeBodyFormModal()} />
                  </View>
                </>
              ) : null}
              {bodyFormModalType === "measure" ? (
                <>
                  <SectionHeader title="Registrar medidas" subtitle="Opcional para mejorar estimación de % grasa" />
                  <InputField label="Cintura (cm)" value={waistInput} onChangeText={setWaistInput} keyboardType="numeric" />
                  <InputField label="Cuello (cm)" value={neckInput} onChangeText={setNeckInput} keyboardType="numeric" />
                  <InputField label="Cadera (cm)" value={hipInput} onChangeText={setHipInput} keyboardType="numeric" />
                  <PrimaryButton title="Guardar medidas" onPress={() => void saveMeasurement()} loading={savingMeasure} />
                  <SecondaryButton title="Cerrar" onPress={() => closeBodyFormModal()} />
                  <Text style={styles.helperText}>Registros de medidas acumulados: {measurementLogs.length}</Text>
                </>
              ) : null}
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
      {bodyActionMenuVisible ? (
        <View
          style={[
            styles.accountMenuLayer,
            Platform.OS === "web" && {
              paddingTop: WEB_CHROME_TOTAL_HEIGHT + 18,
              paddingHorizontal: webBodyMenuSideInset,
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable style={styles.accountMenuBackdrop} onPress={() => closeBodyActionMenu()}>
            <Animated.View style={[styles.accountMenuScrim, { opacity: bodyActionMenuBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.accountMenuContainer,
              Platform.OS === "web" && styles.bodyActionMenuContainerWeb,
              {
                opacity: bodyActionMenuAnim,
                transform: [{ translateY: bodyActionMenuTranslateY }, { scale: bodyActionMenuScale }],
              },
            ]}
          >
            <Pressable style={styles.accountMenuCard} onPress={() => {}}>
              <Text style={styles.accountMenuTitle}>Registrar</Text>
              <SecondaryButton title="Registrar peso" onPress={showWeightFormFromMenu} />
              <SecondaryButton title="Registrar medidas" onPress={showMeasureFormFromMenu} />
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}

function HistoryScreen({ isActive }: { isActive: boolean }) {
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const { language } = useI18n();
  const useDesktopLayout = isDesktopWebLayout(width);
  const useWideDesktopLayout = isWideDesktopWebLayout(width);
  const webMainScrollStyle = useMemo(() => webMainContentContainerStyle(width), [width]);
  const locale = language === "en" ? "en-US" : "es-ES";
  const todayIso = useMemo(() => formatDateLocal(new Date()), []);
  const [monthKey, setMonthKey] = useState(formatMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso);
  const [days, setDays] = useState<CalendarDayEntry[]>([]);
  const [dayDetailMap, setDayDetailMap] = useState<Record<string, DaySummary>>({});
  const [weightDateMap, setWeightDateMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const dayDetailLoadingRef = useRef(new Set<string>());
  const monthLoadInFlightRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (monthLoadInFlightRef.current === monthKey) {
      return;
    }
    monthLoadInFlightRef.current = monthKey;
    setLoading(true);
    try {
      const response = await auth.fetchCalendar(monthKey);
      setDays(response.days);
      setDayDetailMap({});

      const dateToWeight: Record<string, number> = {};
      response.days.forEach((entry) => {
        if (typeof entry.weight_kg === "number") {
          dateToWeight[entry.date] = entry.weight_kg;
        }
      });
      setWeightDateMap(dateToWeight);
    } catch (error) {
      showAlert("Historial", parseApiError(error));
    } finally {
      if (monthLoadInFlightRef.current === monthKey) {
        monthLoadInFlightRef.current = null;
      }
      setLoading(false);
    }
  }, [auth.fetchCalendar, monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    void load();
  }, [isActive, load]);

  useEffect(() => {
    if (!selectedDay) {
      return;
    }
    if (dayDetailMap[selectedDay]) {
      return;
    }
    const selectedEntry = days.find((entry) => entry.date === selectedDay);
    if ((selectedEntry?.intake_count ?? 0) <= 0) {
      return;
    }
    if (dayDetailLoadingRef.current.has(selectedDay)) {
      return;
    }
    dayDetailLoadingRef.current.add(selectedDay);

    void (async () => {
      try {
        const detail = await auth.fetchDaySummary(selectedDay);
        setDayDetailMap((current) => {
          if (current[selectedDay]) {
            return current;
          }
          return {
            ...current,
            [selectedDay]: detail,
          };
        });
      } catch (error) {
        showAlert("Historial", parseApiError(error));
      } finally {
        dayDetailLoadingRef.current.delete(selectedDay);
      }
    })();
  }, [auth.fetchDaySummary, dayDetailMap, days, selectedDay]);

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
  const dayByDateMap = useMemo(() => {
    const map = new Map<string, CalendarDayEntry>();
    days.forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [days]);
  const weeklyStats = useMemo(() => {
    const currentMonth = monthFromKey(monthKey);
    const isCurrentMonth = todayIso.startsWith(monthKey);
    const monthLastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const endDate = isCurrentMonth ? new Date(`${todayIso}T00:00:00`) : monthLastDay;

    const windowDays: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(endDate);
      day.setDate(endDate.getDate() - i);
      const iso = formatDateLocal(day);
      if (!iso.startsWith(monthKey)) {
        break;
      }
      windowDays.push(iso);
    }

    if (windowDays.length === 0) {
      return null;
    }

    let kcalSum = 0;
    let proteinSum = 0;
    let goalRows = 0;
    let adheredRows = 0;
    for (const iso of windowDays) {
      const entry = dayByDateMap.get(iso);
      const kcal = entry?.kcal ?? 0;
      const protein = entry?.protein_g ?? 0;
      const proteinGoal = entry?.protein_goal_g ?? null;
      kcalSum += kcal;
      proteinSum += protein;
      if (proteinGoal && proteinGoal > 0) {
        goalRows += 1;
        if (protein >= proteinGoal * 0.95) {
          adheredRows += 1;
        }
      }
    }

    let streakDays = 0;
    for (let i = 0; i < 31; i += 1) {
      const day = new Date(endDate);
      day.setDate(endDate.getDate() - i);
      const iso = formatDateLocal(day);
      if (!iso.startsWith(monthKey)) {
        break;
      }
      const entry = dayByDateMap.get(iso);
      if ((entry?.intake_count ?? 0) > 0) {
        streakDays += 1;
      } else {
        break;
      }
    }

    return {
      avgKcal: Math.round(kcalSum / windowDays.length),
      avgProtein: Math.round((proteinSum / windowDays.length) * 10) / 10,
      adherenceProteinPct: goalRows ? Math.round((adheredRows / goalRows) * 100) : 0,
      streakDays,
    };
  }, [dayByDateMap, monthKey, todayIso]);
  const monthLabel = useMemo(
    () => monthFromKey(monthKey).toLocaleDateString(locale, { month: "long", year: "numeric" }),
    [locale, monthKey],
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
    const label = parsed.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [locale, selectedDay]);

  const confirmDeleteIntake = (intakeId: number) => {
    showAlert("Eliminar consumo", "Este registro se eliminará del historial.", [
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
              showAlert("Eliminar consumo", parseApiError(error));
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.mainScroll, webMainScrollStyle]}>
        <AppHeader title="Historial" subtitle="Actividad, adherencia y tendencias" />

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

        <View style={useDesktopLayout ? [styles.historyDesktopSplit, useWideDesktopLayout && styles.historyDesktopSplitWide] : undefined}>
        <AppCard style={[styles.historyCalendarCard, useDesktopLayout && styles.historyDesktopCalendarPane]}>
          <View style={styles.historyCalendarTopRow}>
            <View style={styles.historyCalendarTitleWrap}>
              <Text style={styles.historyCalendarTitle}>Calendario</Text>
              <Text style={styles.historyCalendarSubtitle}>Historial mensual de comidas y peso</Text>
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
              <Text style={styles.historyCalendarArrowIcon}>‹</Text>
            </Pressable>
            <Text style={styles.historyCalendarMonthLabel}>{monthLabel}</Text>
            <Pressable
              hitSlop={10}
              onPress={() => setMonthKey((current) => moveMonth(current, 1))}
              style={({ pressed }) => [styles.historyCalendarArrowTouch, pressed && styles.historyCalendarArrowTouchPressed]}
            >
              <Text style={styles.historyCalendarArrowIcon}>›</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.historyCalendarLoadingRow}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}

          {!loading && streakDays > 0 ? (
            <View
              style={[
                styles.historyCalendarStreakBadge,
                styles.historyCalendarStreakBadgeActive,
              ]}
            >
              <View style={styles.historyCalendarStreakFlameWrap}>
                <SvgXml xml={STREAK_FLAME_SVG_XML} width="100%" height="100%" />
              </View>
              <View style={styles.historyCalendarStreakTextWrap}>
                <Text style={styles.historyCalendarStreakTitle}>Racha activa</Text>
                <Text style={styles.historyCalendarStreakSubtitle}>Consistencia semanal en curso</Text>
              </View>
              <View style={[styles.historyCalendarStreakMetric, styles.historyCalendarStreakMetricActive]}>
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

        <AppCard style={useDesktopLayout ? styles.historyDesktopDetailPane : undefined}>
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
                  {selectedDetail.intakes.map((intake) => {
                    const rawName = intake.product_name ?? "Producto";
                    const displayName = normalizeDisplayProductName(rawName);
                    const isAiEstimated =
                      intake.estimated === true ||
                      intake.source_method === "meal_photo" ||
                      intake.source_method === "photo_estimate" ||
                      /^estimado:\s*/i.test(rawName);

                    return (
                      <View key={intake.id} style={styles.historyIntakeRow}>
                        <View style={styles.historyDayHead}>
                          <View style={styles.historyDayHeadLeft}>
                            <Text style={styles.historyDate} numberOfLines={1} ellipsizeMode="tail">
                              {displayName}
                            </Text>
                            {isAiEstimated ? (
                              <View style={styles.historyAIBadge}>
                                <Text style={styles.historyAIBadgeText}>IA</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.historyValue} numberOfLines={1} ellipsizeMode="clip">
                            {Math.round(intake.nutrients.kcal)} kcal
                          </Text>
                        </View>
                        <Text style={styles.helperText} numberOfLines={2} ellipsizeMode="tail">
                          {new Date(intake.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} ·{" "}
                          {Math.round(intake.quantity_g ?? 0)} g · P {Math.round(intake.nutrients.protein_g)} / C{" "}
                          {Math.round(intake.nutrients.carbs_g)} / G {Math.round(intake.nutrients.fat_g)}
                        </Text>
                        <Pressable onPress={() => confirmDeleteIntake(intake.id)} style={styles.historyDeleteBtn}>
                          <Text style={styles.historyDeleteText}>Eliminar</Text>
                        </Pressable>
                      </View>
                    );
                  })}
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SocialScreen() {
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const isWeb = Platform.OS === "web";
  const router = useWebRouter();
  const useDesktopLayout = isDesktopWebLayout(width);
  const webMainScrollStyle = useMemo(() => webMainContentContainerStyle(width), [width]);

  const emptyFeedState = useCallback(
    (): SocialFeedState => ({
      items: [],
      nextCursor: null,
      loading: false,
      loaded: false,
      refreshing: false,
      loadingMore: false,
      error: null,
    }),
    [],
  );

  const emptyProfileState = useCallback(
    (): SocialProfileState => ({
      user: null,
      is_me: false,
      is_friend: false,
      outgoing_request_pending: false,
      incoming_request_pending: false,
      posts_count: 0,
      friends_count: 0,
      items: [],
      next_cursor: null,
      loading: false,
      loaded: false,
      refreshing: false,
      loadingMore: false,
      error: null,
    }),
    [],
  );

  const initialSocialRoute = isWeb ? parseSocialRoute(router.path) : null;
  const [segment, setSegment] = useState<SocialSegmentTab>(initialSocialRoute?.segment ?? "feed");
  const [feedSort, setFeedSort] = useState<SocialFeedSort>("relevance");
  const [feedTypeFilter, setFeedTypeFilter] = useState<SocialFeedTypeFilter>("all");
  const [feedFilterMenu, setFeedFilterMenu] = useState<null | "sort" | "type">(null);
  const [feedState, setFeedState] = useState<SocialFeedState>(() => emptyFeedState());
  const [exploreState, setExploreState] = useState<SocialFeedState>(() => emptyFeedState());
  const [socialOverview, setSocialOverview] = useState<SocialOverview>({
    friends: [],
    incoming_requests: [],
    outgoing_requests: [],
  });
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [socialSearch, setSocialSearch] = useState("");
  const [socialResults, setSocialResults] = useState<SocialSearchItem[]>([]);
  const [searchingSocial, setSearchingSocial] = useState(false);
  const [sendingFriendUserId, setSendingFriendUserId] = useState<number | null>(null);
  const [respondingFriendRequestId, setRespondingFriendRequestId] = useState<number | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<SocialUser | null>(null);
  const [profileState, setProfileState] = useState<SocialProfileState>(() => emptyProfileState());
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerType, setComposerType] = useState<SocialPostType>("photo");
  const [composerCaption, setComposerCaption] = useState("");
  const [composerVisibility, setComposerVisibility] = useState<SocialVisibility>("friends");
  const [composerPhotos, setComposerPhotos] = useState<string[]>([]);
  const [composerRecipeTitle, setComposerRecipeTitle] = useState("");
  const [composerRecipeServings, setComposerRecipeServings] = useState("");
  const [composerRecipePrepTime, setComposerRecipePrepTime] = useState("");
  const [composerRecipeIngredients, setComposerRecipeIngredients] = useState<string[]>([""]);
  const [composerRecipeSteps, setComposerRecipeSteps] = useState<string[]>([""]);
  const [composerRecipeTags, setComposerRecipeTags] = useState("");
  const [composerRecipeKcal, setComposerRecipeKcal] = useState("");
  const [composerRecipeProtein, setComposerRecipeProtein] = useState("");
  const [composerRecipeCarbs, setComposerRecipeCarbs] = useState("");
  const [composerRecipeFat, setComposerRecipeFat] = useState("");
  const [composerProgressWeight, setComposerProgressWeight] = useState("");
  const [composerProgressBodyFat, setComposerProgressBodyFat] = useState("");
  const [composerProgressBmi, setComposerProgressBmi] = useState("");
  const [composerProgressNotes, setComposerProgressNotes] = useState("");
  const [publishingPost, setPublishingPost] = useState(false);
  const [commentsPost, setCommentsPost] = useState<SocialPost | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsItems, setCommentsItems] = useState<SocialComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const lastNonProfileSegmentRef = useRef<SocialSegmentTab>(initialSocialRoute?.segment ?? "feed");
  const resolvingProfileRouteRef = useRef<string | null>(null);

  const requestBadgeCount = socialOverview.incoming_requests.length;
  const activeFeedScope = segment === "explore" ? "explore" : "feed";
  const activeFeedState = activeFeedScope === "explore" ? exploreState : feedState;

  const setSegmentWithNavigation = useCallback(
    (nextSegment: SocialSegmentTab, options?: { replace?: boolean }) => {
      if (!isWeb) {
        setSegment(nextSegment);
        return;
      }
      const nextPath = socialRouteForSegment(nextSegment);
      if (options?.replace) {
        router.replace(nextPath);
        return;
      }
      router.navigate(nextPath);
    },
    [isWeb, router],
  );

  const mergePosts = useCallback((current: SocialPost[], incoming: SocialPost[]): SocialPost[] => {
    const ordered: SocialPost[] = [];
    const indexById = new Map<string, number>();
    [...current, ...incoming].forEach((post) => {
      const existingIndex = indexById.get(post.id);
      if (existingIndex == null) {
        indexById.set(post.id, ordered.length);
        ordered.push(post);
        return;
      }
      ordered[existingIndex] = post;
    });
    return ordered;
  }, []);

  const updateScopedFeedState = useCallback(
    (scope: "feed" | "explore", updater: (current: SocialFeedState) => SocialFeedState) => {
      if (scope === "feed") {
        setFeedState(updater);
        return;
      }
      setExploreState(updater);
    },
    [],
  );

  const applyPostUpdateEverywhere = useCallback((postId: string, updater: (post: SocialPost) => SocialPost) => {
    setFeedState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === postId ? updater(item) : item)),
    }));
    setExploreState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === postId ? updater(item) : item)),
    }));
    setProfileState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === postId ? updater(item) : item)),
    }));
    setCommentsPost((current) => (current && current.id === postId ? updater(current) : current));
  }, []);

  const removePostEverywhere = useCallback((postId: string) => {
    setFeedState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== postId),
    }));
    setExploreState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== postId),
    }));
    setProfileState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== postId),
      posts_count: Math.max(0, current.posts_count - 1),
    }));
    setCommentsPost((current) => (current?.id === postId ? null : current));
  }, []);

  const resetComposer = useCallback(
    (nextType: SocialPostType = "photo") => {
      setComposerType(nextType);
      setComposerCaption("");
      setComposerVisibility("friends");
      setComposerPhotos([]);
      setComposerRecipeTitle("");
      setComposerRecipeServings("");
      setComposerRecipePrepTime("");
      setComposerRecipeIngredients([""]);
      setComposerRecipeSteps([""]);
      setComposerRecipeTags("");
      setComposerRecipeKcal("");
      setComposerRecipeProtein("");
      setComposerRecipeCarbs("");
      setComposerRecipeFat("");
      setComposerProgressWeight(auth.profile?.weight_kg != null ? auth.profile.weight_kg.toFixed(1) : "");
      setComposerProgressBodyFat(auth.profile?.body_fat_percent != null ? auth.profile.body_fat_percent.toFixed(1) : "");
      setComposerProgressBmi(auth.profile?.bmi != null ? auth.profile.bmi.toFixed(1) : "");
      setComposerProgressNotes("");
    },
    [auth.profile],
  );

  const openComposer = useCallback(
    (nextType: SocialPostType = "photo") => {
      resetComposer(nextType);
      setComposerVisible(true);
    },
    [resetComposer],
  );

  const closeComposer = useCallback(() => {
    setComposerVisible(false);
  }, []);

  const closeFeedFilterMenu = useCallback(() => {
    setFeedFilterMenu(null);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const overview = await auth.fetchSocialOverview();
      setSocialOverview(overview);
      setOverviewLoaded(true);
    } catch (error) {
      showAlert("Social", parseApiError(error));
    } finally {
      setLoadingOverview(false);
    }
  }, [auth]);

  const loadFeed = useCallback(
    async (scope: "feed" | "explore", mode: "initial" | "refresh" | "more" = "initial") => {
      const current = scope === "feed" ? feedState : exploreState;
      if (mode === "more") {
        if (!current.nextCursor || current.loadingMore || current.loading) {
          return;
        }
      } else if (current.loading) {
        return;
      }

      updateScopedFeedState(scope, (state) => ({
        ...state,
        loading: mode === "initial",
        refreshing: mode === "refresh",
        loadingMore: mode === "more",
        error: null,
      }));

      try {
        const response = await auth.fetchSocialFeed({
          scope,
          limit: 8,
          cursor: mode === "more" ? current.nextCursor : undefined,
          sort: feedSort,
          postType: feedTypeFilter,
        });
        updateScopedFeedState(scope, (state) => ({
          ...state,
          items: mode === "more" ? mergePosts(state.items, response.items) : response.items,
          nextCursor: response.next_cursor,
          loading: false,
          refreshing: false,
          loadingMore: false,
          loaded: true,
          error: null,
        }));
      } catch (error) {
        const message = parseApiError(error);
        updateScopedFeedState(scope, (state) => ({
          ...state,
          loading: false,
          refreshing: false,
          loadingMore: false,
          loaded: true,
          error: message,
        }));
      }
    },
    [auth, exploreState, feedSort, feedState, feedTypeFilter, mergePosts, updateScopedFeedState],
  );

  const loadProfile = useCallback(
    async (mode: "initial" | "refresh" | "more" = "initial") => {
      if (!selectedProfile) {
        return;
      }
      if (mode === "more" && (!profileState.next_cursor || profileState.loadingMore || profileState.loading)) {
        return;
      }
      setProfileState((current) => ({
        ...current,
        loading: mode === "initial",
        refreshing: mode === "refresh",
        loadingMore: mode === "more",
        error: null,
      }));
      try {
        const response = await auth.fetchSocialProfile({
          userId: selectedProfile.id,
          limit: 8,
          cursor: mode === "more" ? profileState.next_cursor : undefined,
        });
        setProfileState((current) => ({
          ...current,
          user: response.user,
          is_me: response.is_me,
          is_friend: response.is_friend,
          outgoing_request_pending: response.outgoing_request_pending,
          incoming_request_pending: response.incoming_request_pending,
          posts_count: response.posts_count,
          friends_count: response.friends_count,
          items: mode === "more" ? mergePosts(current.items, response.items) : response.items,
          next_cursor: response.next_cursor,
          loading: false,
          loaded: true,
          refreshing: false,
          loadingMore: false,
          error: null,
        }));
      } catch (error) {
        setProfileState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          loadingMore: false,
          loaded: true,
          error: parseApiError(error),
        }));
      }
    },
    [auth, mergePosts, profileState.loading, profileState.loadingMore, profileState.next_cursor, selectedProfile],
  );

  useEffect(() => {
    if (!feedState.loaded && !feedState.loading) {
      void loadFeed("feed");
    }
  }, [feedState.loaded, feedState.loading, loadFeed]);

  useEffect(() => {
    if ((segment === "friends" || segment === "requests") && !overviewLoaded && !loadingOverview) {
      void loadOverview();
    }
    if (segment === "explore" && !exploreState.loaded && !exploreState.loading) {
      void loadFeed("explore");
    }
  }, [exploreState.loaded, exploreState.loading, loadFeed, loadOverview, loadingOverview, overviewLoaded, segment]);

  useEffect(() => {
    if (!selectedProfile || profileState.loaded || profileState.loading) {
      return;
    }
    void loadProfile();
  }, [loadProfile, profileState.loaded, profileState.loading, selectedProfile]);

  useEffect(() => {
    setFeedState(emptyFeedState());
    setExploreState(emptyFeedState());
  }, [emptyFeedState, feedSort, feedTypeFilter]);

  useEffect(() => {
    if (segment !== "feed" && segment !== "explore") {
      setFeedFilterMenu(null);
    }
  }, [segment]);

  useEffect(() => {
    if (segment !== "friends" || socialSearch.trim().length < 1) {
      if (socialSearch.trim().length < 1) {
        setSocialResults([]);
        setSearchingSocial(false);
      }
      return;
    }

    setSearchingSocial(true);
    const timeoutId = setTimeout(() => {
      void auth
        .searchSocialUsers(socialSearch.trim())
        .then((items) => setSocialResults(items))
        .catch((error) => showAlert("Social", parseApiError(error)))
        .finally(() => setSearchingSocial(false));
    }, 140);

    return () => clearTimeout(timeoutId);
  }, [auth, segment, socialSearch]);

  const refreshSearchIfNeeded = useCallback(async () => {
    const trimmed = socialSearch.trim();
    if (segment !== "friends" || trimmed.length < 1) {
      return;
    }
    const items = await auth.searchSocialUsers(trimmed);
    setSocialResults(items);
  }, [auth, segment, socialSearch]);

  const findKnownSocialUser = useCallback(
    (username: string): SocialUser | null => {
      const normalized = username.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      const candidates: SocialUser[] = [
        ...feedState.items.map((item) => item.user),
        ...exploreState.items.map((item) => item.user),
        ...socialOverview.friends,
        ...socialOverview.incoming_requests.map((item) => item.user),
        ...socialOverview.outgoing_requests.map((item) => item.user),
        ...socialResults,
        ...(selectedProfile ? [selectedProfile] : []),
      ];
      return candidates.find((item) => item.username.trim().toLowerCase() === normalized) ?? null;
    },
    [exploreState.items, feedState.items, selectedProfile, socialOverview.friends, socialOverview.incoming_requests, socialOverview.outgoing_requests, socialResults],
  );

  const openProfile = useCallback(
    (user: SocialUser) => {
      if (isWeb) {
        router.navigate(socialProfileRoute(user.username));
        return;
      }
      setSelectedProfile(user);
      setProfileState(emptyProfileState());
    },
    [emptyProfileState, isWeb, router],
  );

  const closeProfile = useCallback(() => {
    if (isWeb) {
      router.navigate(socialRouteForSegment(lastNonProfileSegmentRef.current), { replace: true });
      return;
    }
    setSelectedProfile(null);
    setProfileState(emptyProfileState());
  }, [emptyProfileState, isWeb, router]);

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const parsed = parseSocialRoute(router.path);
    if (!parsed) {
      return;
    }

    if (!parsed.username) {
      lastNonProfileSegmentRef.current = parsed.segment;
      if (segment !== parsed.segment) {
        setSegment(parsed.segment);
      }
      if (selectedProfile) {
        setSelectedProfile(null);
        setProfileState(emptyProfileState());
      }
      return;
    }

    const normalizedUsername = parsed.username.trim().toLowerCase();
    if (!normalizedUsername) {
      router.replace(socialRouteForSegment(lastNonProfileSegmentRef.current));
      return;
    }
    if (selectedProfile?.username.trim().toLowerCase() === normalizedUsername) {
      return;
    }
    if (resolvingProfileRouteRef.current === normalizedUsername) {
      return;
    }
    const known = findKnownSocialUser(normalizedUsername);
    if (known) {
      setSelectedProfile(known);
      setProfileState(emptyProfileState());
      return;
    }

    resolvingProfileRouteRef.current = normalizedUsername;
    void auth
      .searchSocialUsers(normalizedUsername, 24)
      .then((items) => {
        const exact = items.find((item) => item.username.trim().toLowerCase() === normalizedUsername);
        if (exact) {
          setSelectedProfile(exact);
          setProfileState(emptyProfileState());
          return;
        }
        router.replace(socialRouteForSegment(lastNonProfileSegmentRef.current));
      })
      .catch(() => {
        router.replace(socialRouteForSegment(lastNonProfileSegmentRef.current));
      })
      .finally(() => {
        if (resolvingProfileRouteRef.current === normalizedUsername) {
          resolvingProfileRouteRef.current = null;
        }
      });
  }, [auth, emptyProfileState, findKnownSocialUser, isWeb, router, segment, selectedProfile]);

  const handleSendFriendRequest = useCallback(
    async (targetUserId: number) => {
      setSendingFriendUserId(targetUserId);
      try {
        await auth.sendFriendRequest(targetUserId);
        await Promise.all([loadOverview(), refreshSearchIfNeeded()]);
        if (selectedProfile?.id === targetUserId) {
          await loadProfile("refresh");
        }
        showAlert("Social", "Solicitud enviada.");
      } catch (error) {
        showAlert("Social", parseApiError(error));
      } finally {
        setSendingFriendUserId(null);
      }
    },
    [auth, loadOverview, loadProfile, refreshSearchIfNeeded, selectedProfile],
  );

  const handleAcceptRequest = useCallback(
    async (requestId: number) => {
      setRespondingFriendRequestId(requestId);
      try {
        await auth.acceptFriendRequest(requestId);
        await Promise.all([loadOverview(), refreshSearchIfNeeded()]);
        if (selectedProfile) {
          await loadProfile("refresh");
        }
        showAlert("Social", "Solicitud aceptada.");
      } catch (error) {
        showAlert("Social", parseApiError(error));
      } finally {
        setRespondingFriendRequestId(null);
      }
    },
    [auth, loadOverview, loadProfile, refreshSearchIfNeeded, selectedProfile],
  );

  const handleRejectRequest = useCallback(
    async (requestId: number) => {
      setRespondingFriendRequestId(requestId);
      try {
        await auth.rejectFriendRequest(requestId);
        await Promise.all([loadOverview(), refreshSearchIfNeeded()]);
        if (selectedProfile) {
          await loadProfile("refresh");
        }
        showAlert("Social", "Solicitud rechazada.");
      } catch (error) {
        showAlert("Social", parseApiError(error));
      } finally {
        setRespondingFriendRequestId(null);
      }
    },
    [auth, loadOverview, loadProfile, refreshSearchIfNeeded, selectedProfile],
  );

  const optimizePickedAssets = useCallback(async (assets: ImagePicker.ImagePickerAsset[]): Promise<string[]> => {
    const prepared: string[] = [];
    for (const asset of assets) {
      if (!asset.uri) {
        continue;
      }
      try {
        const maxSide = Math.max(asset.width ?? 0, asset.height ?? 0);
        const actions: ImageManipulator.Action[] = [];
        if (maxSide > 1600 && asset.width && asset.height) {
          const scale = 1600 / maxSide;
          actions.push({
            resize: {
              width: Math.max(1, Math.round(asset.width * scale)),
              height: Math.max(1, Math.round(asset.height * scale)),
            },
          });
        }
        const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        prepared.push(result.uri || asset.uri);
      } catch {
        prepared.push(asset.uri);
      }
    }
    return prepared;
  }, []);

  const appendComposerPhotos = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[]) => {
      if (!assets.length) {
        return;
      }
      const remaining = Math.max(0, 3 - composerPhotos.length);
      if (!remaining) {
        showAlert("Publicación", "Máximo 3 fotos por publicación.");
        return;
      }
      const optimized = await optimizePickedAssets(assets.slice(0, remaining));
      setComposerPhotos((current) => [...current, ...optimized].slice(0, 3));
    },
    [composerPhotos.length, optimizePickedAssets],
  );

  const pickComposerPhotosFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert("Fotos", "Permite acceso a galería para publicar.");
      return;
    }
    const remaining = Math.max(1, 3 - composerPhotos.length);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 0.82,
    });
    if (!result.canceled) {
      await appendComposerPhotos(result.assets);
    }
  }, [appendComposerPhotos, composerPhotos.length]);

  const pickComposerPhotoFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert("Fotos", "Permite acceso a cámara para publicar.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.82,
    });
    if (!result.canceled && result.assets[0]) {
      await appendComposerPhotos([result.assets[0]]);
    }
  }, [appendComposerPhotos]);

  const handlePublishPost = useCallback(async () => {
    const recipeIngredients = composerRecipeIngredients.map((item) => item.trim()).filter(Boolean);
    const recipeSteps = composerRecipeSteps.map((item) => item.trim()).filter(Boolean);
    const recipeTags = composerRecipeTags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const computedProgressWeight = toOptionalNumber(composerProgressWeight);
    const computedProgressBodyFat = toOptionalNumber(composerProgressBodyFat);
    const explicitBmi = toOptionalNumber(composerProgressBmi);
    const derivedBmi =
      explicitBmi ??
      bmiValue(computedProgressWeight, auth.profile?.height_cm ?? null) ??
      null;

    if (composerType === "photo" && composerPhotos.length === 0) {
      showAlert("Publicación", "La publicación de foto necesita al menos una imagen.");
      return;
    }
    if (composerType === "recipe") {
      const recipeKcal = toOptionalNumber(composerRecipeKcal);
      const recipeProtein = toOptionalNumber(composerRecipeProtein);
      const recipeCarbs = toOptionalNumber(composerRecipeCarbs);
      const recipeFat = toOptionalNumber(composerRecipeFat);
      if (!composerRecipeTitle.trim()) {
        showAlert("Receta", "Pon un título a la receta.");
        return;
      }
      if (!recipeIngredients.length || !recipeSteps.length) {
        showAlert("Receta", "Añade al menos un ingrediente y un paso.");
        return;
      }
      if (!composerPhotos.length) {
        showAlert("Receta", "Añade al menos una foto del plato.");
        return;
      }
      if (recipeKcal == null || recipeProtein == null || recipeCarbs == null || recipeFat == null) {
        showAlert("Receta", "Esta receta no sale de aquí sin kcal, proteína, hidratos y grasas.");
        return;
      }
    }
    if (composerType === "progress") {
      const hasProgressContent =
        composerPhotos.length > 0 ||
        computedProgressWeight != null ||
        computedProgressBodyFat != null ||
        derivedBmi != null ||
        composerProgressNotes.trim().length > 0 ||
        composerCaption.trim().length > 0;
      if (!hasProgressContent) {
        showAlert("Progreso", "Publicar aire todavía no cuenta como progreso.");
        return;
      }
    }

    setPublishingPost(true);
    try {
      const created = await auth.createSocialPost({
        type: composerType,
        caption: composerCaption,
        visibility: composerVisibility,
        photos: composerPhotos,
        recipe:
          composerType === "recipe"
            ? {
                title: composerRecipeTitle.trim(),
                servings: toOptionalNumber(composerRecipeServings),
                prep_time_min: toOptionalNumber(composerRecipePrepTime),
                ingredients: recipeIngredients,
                steps: recipeSteps,
                nutrition_kcal: toOptionalNumber(composerRecipeKcal),
                nutrition_protein_g: toOptionalNumber(composerRecipeProtein),
                nutrition_carbs_g: toOptionalNumber(composerRecipeCarbs),
                nutrition_fat_g: toOptionalNumber(composerRecipeFat),
                tags: recipeTags,
              }
            : null,
        progress:
          composerType === "progress"
            ? {
                weight_kg: computedProgressWeight,
                body_fat_pct: computedProgressBodyFat,
                bmi: derivedBmi,
                notes: composerProgressNotes.trim() || null,
              }
            : null,
      });

      setFeedState((current) => ({
        ...current,
        items: mergePosts([created], current.items),
        loaded: true,
      }));
      if (selectedProfile && created.user.id === selectedProfile.id) {
        setProfileState((current) => ({
          ...current,
          items: mergePosts([created], current.items),
          posts_count: current.posts_count + 1,
        }));
      }
      closeComposer();
      resetComposer();
      setSegmentWithNavigation("feed", { replace: true });
      showAlert("Social", "Publicación compartida.");
    } catch (error) {
      showAlert("Social", parseApiError(error));
    } finally {
      setPublishingPost(false);
    }
  }, [
    auth,
    auth.profile?.height_cm,
    closeComposer,
    composerCaption,
    composerPhotos,
    composerProgressBmi,
    composerProgressBodyFat,
    composerProgressNotes,
    composerProgressWeight,
    composerRecipeCarbs,
    composerRecipeFat,
    composerRecipeIngredients,
    composerRecipeKcal,
    composerRecipePrepTime,
    composerRecipeProtein,
    composerRecipeServings,
    composerRecipeSteps,
    composerRecipeTags,
    composerRecipeTitle,
    composerType,
    composerVisibility,
    mergePosts,
    resetComposer,
    selectedProfile,
  ]);

  const openComments = useCallback(
    async (post: SocialPost) => {
      setCommentsPost(post);
      setCommentsVisible(true);
      setCommentsLoading(true);
      try {
        const items = await auth.fetchSocialComments(post.id);
        setCommentsItems(items);
      } catch (error) {
        showAlert("Comentarios", parseApiError(error));
      } finally {
        setCommentsLoading(false);
      }
    },
    [auth],
  );

  const closeComments = useCallback(() => {
    setCommentsVisible(false);
    setCommentsPost(null);
    setCommentsItems([]);
    setCommentDraft("");
  }, []);

  const submitComment = useCallback(async () => {
    if (!commentsPost || !commentDraft.trim()) {
      return;
    }
    setSendingComment(true);
    try {
      const created = await auth.createSocialComment(commentsPost.id, commentDraft.trim());
      setCommentsItems((current) => [...current, created]);
      setCommentDraft("");
      applyPostUpdateEverywhere(commentsPost.id, (post) => ({
        ...post,
        comment_count: post.comment_count + 1,
      }));
    } catch (error) {
      showAlert("Comentarios", parseApiError(error));
    } finally {
      setSendingComment(false);
    }
  }, [applyPostUpdateEverywhere, auth, commentDraft, commentsPost]);

  const toggleLike = useCallback(
    async (post: SocialPost) => {
      try {
        const response = post.liked_by_me ? await auth.unlikeSocialPost(post.id) : await auth.likeSocialPost(post.id);
        applyPostUpdateEverywhere(post.id, (current) => ({
          ...current,
          liked_by_me: response.liked,
          like_count: response.like_count,
        }));
      } catch (error) {
        showAlert("Social", parseApiError(error));
      }
    },
    [applyPostUpdateEverywhere, auth],
  );

  const handleManagePost = useCallback(
    (post: SocialPost) => {
      const visibilityOptions: Array<{ visibility: SocialVisibility; text: string }> = [
        { visibility: "public", text: "Pública" },
        { visibility: "friends", text: "Amigos" },
        { visibility: "private", text: "Privada" },
      ];
      const options = visibilityOptions.filter((item) => item.visibility !== post.visibility);

      showAlert("Gestionar publicación", "Cambia la visibilidad o bórrala si ya hizo su trabajo.", [
        ...options.map((item) => ({
          text: item.text,
          onPress: async () => {
            try {
              const updated = await auth.updateSocialPostVisibility(post.id, item.visibility);
              applyPostUpdateEverywhere(post.id, () => updated);
              setExploreState((current) => ({
                ...current,
                items: current.items.filter((currentPost) => currentPost.id !== post.id),
              }));
            } catch (error) {
              showAlert("Publicación", parseApiError(error));
            }
          },
        })),
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            showAlert("Eliminar publicación", "Si la borras, desaparece de verdad. Luego no vale arrepentirse.", [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Eliminar",
                style: "destructive",
                onPress: async () => {
                  try {
                    await auth.deleteSocialPost(post.id);
                    removePostEverywhere(post.id);
                    if (commentsPost?.id === post.id) {
                      setCommentsVisible(false);
                      setCommentsPost(null);
                      setCommentsItems([]);
                      setCommentDraft("");
                    }
                  } catch (error) {
                    showAlert("Publicación", parseApiError(error));
                  }
                },
              },
            ]),
        },
        { text: "Cancelar", style: "cancel" },
      ]);
    },
    [applyPostUpdateEverywhere, auth, commentsPost?.id, removePostEverywhere],
  );

  const handleShare = useCallback(async (post: SocialPost) => {
    const primaryText =
      post.type === "recipe" && post.recipe
        ? `${post.recipe.title}\n\n${post.caption ?? ""}`.trim()
        : `${post.caption ?? socialTypeLabel(post.type)}\n\nCompartido desde NutrIA`.trim();
    try {
      await Share.share({
        message: primaryText,
      });
    } catch {
      showAlert("Social", "No se pudo abrir el panel de compartir.");
    }
  }, []);

  const socialUi = useMemo(
    () => ({
      styles,
      theme,
      AppHeader,
      AppCard,
      EmptyState,
      SocialFeedSkeleton,
      SocialPostCard,
      SectionHeader,
      TagChip,
      AvatarCircle,
      MetricCard,
      ChoiceRow,
      InputField,
      TextInput,
      EditableStringListField,
      PrimaryButton,
      SecondaryButton,
    }),
    [],
  );

  const renderSegments = () => {
    const items: Array<{ value: SocialSegmentTab; label: string; badge?: number }> = [
      { value: "feed", label: "Feed" },
      { value: "explore", label: "Explorar" },
      { value: "friends", label: "Amigos" },
      { value: "requests", label: "Solicitudes", badge: requestBadgeCount },
    ];

    return (
      <View style={styles.socialSegmentsRow}>
        {items.map((item) => {
          const active = segment === item.value;
          return (
            <Pressable
              key={item.value}
              style={[styles.socialSegmentChip, active && styles.socialSegmentChipActive]}
              onPress={() => setSegmentWithNavigation(item.value)}
            >
              <Text style={[styles.socialSegmentChipText, active && styles.socialSegmentChipTextActive]}>{item.label}</Text>
              {item.badge ? (
                <View style={[styles.socialSegmentBadge, active && styles.socialSegmentBadgeActive]}>
                  <Text style={styles.socialSegmentBadgeText}>{item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderFeedFilters = () => {
    return (
      <View style={styles.socialFilterBlock}>
        <View style={styles.socialFilterDropdownRow}>
          <Pressable
            style={({ pressed }) => [styles.socialFilterSelect, pressed && styles.socialFilterSelectPressed]}
            onPress={() => setFeedFilterMenu("sort")}
          >
            <View style={styles.socialFilterSelectValueRow}>
              <Text style={styles.socialFilterSelectLabel}>Orden</Text>
              <Text style={styles.socialFilterSelectDivider}>·</Text>
              <Text style={styles.socialFilterSelectValue}>{socialFeedSortLabel(feedSort)}</Text>
              <Text style={styles.socialFilterSelectChevron}>▾</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.socialFilterSelect, pressed && styles.socialFilterSelectPressed]}
            onPress={() => setFeedFilterMenu("type")}
          >
            <View style={styles.socialFilterSelectValueRow}>
              <Text style={styles.socialFilterSelectLabel}>Tipo</Text>
              <Text style={styles.socialFilterSelectDivider}>·</Text>
              <Text style={styles.socialFilterSelectValue}>{socialFeedTypeFilterLabel(feedTypeFilter)}</Text>
              <Text style={styles.socialFilterSelectChevron}>▾</Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderFeedFilterModal = () => {
    if (!feedFilterMenu) {
      return null;
    }

    const isSortMenu = feedFilterMenu === "sort";
    const options = isSortMenu
      ? ([
          { value: "relevance", label: "Relevancia", meta: "Amigos primero y luego el resto." },
          { value: "recent", label: "Más reciente", meta: "Orden cronológico puro." },
        ] as const)
      : ([
          { value: "all", label: "Todo" },
          { value: "photo", label: "Foto" },
          { value: "recipe", label: "Receta" },
          { value: "progress", label: "Progreso" },
        ] as const);

    return (
      <Modal transparent animationType="fade" visible onRequestClose={closeFeedFilterMenu}>
        <View style={styles.socialModalLayer}>
          <Pressable style={styles.socialModalBackdrop} onPress={closeFeedFilterMenu} />
          <View style={[styles.socialModalCard, styles.socialFilterModalCard]}>
            <Text style={styles.socialModalTitle}>{isSortMenu ? "Orden del feed" : "Tipo de publicación"}</Text>
            <View style={styles.socialFilterOptionList}>
              {options.map((option) => {
                const active = isSortMenu ? feedSort === option.value : feedTypeFilter === option.value;
                const typeMeta =
                  !isSortMenu && (option.value === "photo" || option.value === "recipe" || option.value === "progress")
                    ? socialTypeMeta(option.value)
                    : null;
                return (
                  <Pressable
                    key={`filter-option-${option.value}`}
                    style={[
                      styles.socialFilterOption,
                      active && styles.socialFilterOptionActive,
                      typeMeta
                        ? {
                            borderColor: active ? typeMeta.color : typeMeta.borderColor,
                            backgroundColor: active ? typeMeta.softBackground : theme.panelSoft,
                          }
                        : null,
                    ]}
                    onPress={() => {
                      if (isSortMenu) {
                        setFeedSort(option.value as SocialFeedSort);
                      } else {
                        setFeedTypeFilter(option.value as SocialFeedTypeFilter);
                      }
                      closeFeedFilterMenu();
                    }}
                  >
                    <View style={styles.socialFilterOptionCopy}>
                      <Text
                        style={[
                          styles.socialFilterOptionTitle,
                          active && styles.socialFilterOptionTitleActive,
                          typeMeta && active ? { color: typeMeta.color } : null,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {"meta" in option && option.meta ? <Text style={styles.socialFilterOptionMeta}>{option.meta}</Text> : null}
                    </View>
                    {active ? <Text style={styles.socialFilterOptionCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <SecondaryButton title="Cerrar" onPress={closeFeedFilterMenu} />
          </View>
        </View>
      </Modal>
    );
  };

  const feedSegmentsNode = renderSegments();
  const feedFiltersNode = renderFeedFilters();

  if (selectedProfile) {
    return (
      <>
        <ProfileView
          ui={socialUi}
          webMainScrollStyle={webMainScrollStyle}
          profileState={profileState}
          selectedProfile={selectedProfile}
          socialOverview={socialOverview}
          authUserId={auth.user?.id}
          sendingFriendUserId={sendingFriendUserId}
          respondingFriendRequestId={respondingFriendRequestId}
          onBack={closeProfile}
          onRefresh={() => void loadProfile("refresh")}
          onLoadMore={() => void loadProfile("more")}
          onOpenProfile={openProfile}
          onToggleLike={(post) => void toggleLike(post)}
          onOpenComments={(post) => void openComments(post)}
          onShare={(post) => void handleShare(post)}
          onManagePost={(post) => void handleManagePost(post)}
          onSendFriendRequest={(userId) => void handleSendFriendRequest(userId)}
          onAcceptRequest={(requestId) => void handleAcceptRequest(requestId)}
        />
        <Comments
          ui={socialUi}
          visible={commentsVisible}
          loading={commentsLoading}
          items={commentsItems}
          draft={commentDraft}
          sending={sendingComment}
          onClose={closeComments}
          onChangeDraft={setCommentDraft}
          onSubmit={() => void submitComment()}
        />
      </>
    );
  }

  return (
    <>
      {segment === "feed" ? (
        <FeedView
          scope="feed"
          state={feedState}
          ui={socialUi}
          webMainScrollStyle={webMainScrollStyle}
          authUserId={auth.user?.id}
          segmentsNode={feedSegmentsNode}
          filtersNode={feedFiltersNode}
          onCreate={(type) => openComposer(type ?? "photo")}
          onRefresh={() => void loadFeed("feed", "refresh")}
          onRetry={() => void loadFeed("feed")}
          onLoadMore={() => void loadFeed("feed", "more")}
          onOpenProfile={openProfile}
          onToggleLike={(post) => void toggleLike(post)}
          onOpenComments={(post) => void openComments(post)}
          onShare={(post) => void handleShare(post)}
          onManagePost={(post) => void handleManagePost(post)}
        />
      ) : segment === "explore" ? (
        <ExploreView
          state={exploreState}
          ui={socialUi}
          webMainScrollStyle={webMainScrollStyle}
          authUserId={auth.user?.id}
          segmentsNode={feedSegmentsNode}
          filtersNode={feedFiltersNode}
          onCreate={(type) => openComposer(type ?? "photo")}
          onRefresh={() => void loadFeed("explore", "refresh")}
          onRetry={() => void loadFeed("explore")}
          onLoadMore={() => void loadFeed("explore", "more")}
          onOpenProfile={openProfile}
          onToggleLike={(post) => void toggleLike(post)}
          onOpenComments={(post) => void openComments(post)}
          onShare={(post) => void handleShare(post)}
          onManagePost={(post) => void handleManagePost(post)}
        />
      ) : segment === "friends" ? (
        <FriendsView
          ui={socialUi}
          webMainScrollStyle={webMainScrollStyle}
          socialSearch={socialSearch}
          socialResults={socialResults}
          searchingSocial={searchingSocial}
          socialOverview={socialOverview}
          loadingOverview={loadingOverview}
          overviewLoaded={overviewLoaded}
          sendingFriendUserId={sendingFriendUserId}
          respondingFriendRequestId={respondingFriendRequestId}
          segmentsNode={feedSegmentsNode}
          onCreate={(type) => openComposer(type ?? "photo")}
          onChangeSearch={setSocialSearch}
          onOpenProfile={openProfile}
          onSendFriendRequest={(userId) => void handleSendFriendRequest(userId)}
          onAcceptRequest={(requestId) => void handleAcceptRequest(requestId)}
        />
      ) : (
        <RequestsView
          ui={socialUi}
          webMainScrollStyle={webMainScrollStyle}
          socialOverview={socialOverview}
          loadingOverview={loadingOverview}
          overviewLoaded={overviewLoaded}
          respondingFriendRequestId={respondingFriendRequestId}
          segmentsNode={feedSegmentsNode}
          onCreate={(type) => openComposer(type ?? "photo")}
          onOpenProfile={openProfile}
          onAcceptRequest={(requestId) => void handleAcceptRequest(requestId)}
          onRejectRequest={(requestId) => void handleRejectRequest(requestId)}
        />
      )}
      {renderFeedFilterModal()}
      <Composer
        ui={socialUi}
        visible={composerVisible}
        publishing={publishingPost}
        composerType={composerType}
        composerVisibility={composerVisibility}
        composerCaption={composerCaption}
        composerPhotos={composerPhotos}
        composerRecipeTitle={composerRecipeTitle}
        composerRecipeServings={composerRecipeServings}
        composerRecipePrepTime={composerRecipePrepTime}
        composerRecipeIngredients={composerRecipeIngredients}
        composerRecipeSteps={composerRecipeSteps}
        composerRecipeTags={composerRecipeTags}
        composerRecipeKcal={composerRecipeKcal}
        composerRecipeProtein={composerRecipeProtein}
        composerRecipeCarbs={composerRecipeCarbs}
        composerRecipeFat={composerRecipeFat}
        composerProgressWeight={composerProgressWeight}
        composerProgressBodyFat={composerProgressBodyFat}
        composerProgressBmi={composerProgressBmi}
        composerProgressNotes={composerProgressNotes}
        onClose={closeComposer}
        onPublish={() => void handlePublishPost()}
        onSetType={setComposerType}
        onSetVisibility={setComposerVisibility}
        onSetCaption={setComposerCaption}
        onPickLibrary={() => void pickComposerPhotosFromLibrary()}
        onPickCamera={() => void pickComposerPhotoFromCamera()}
        onRemovePhoto={(index) => setComposerPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}
        onSetRecipeTitle={setComposerRecipeTitle}
        onSetRecipeServings={setComposerRecipeServings}
        onSetRecipePrepTime={setComposerRecipePrepTime}
        onSetRecipeIngredients={setComposerRecipeIngredients}
        onSetRecipeSteps={setComposerRecipeSteps}
        onSetRecipeTags={setComposerRecipeTags}
        onSetRecipeKcal={setComposerRecipeKcal}
        onSetRecipeProtein={setComposerRecipeProtein}
        onSetRecipeCarbs={setComposerRecipeCarbs}
        onSetRecipeFat={setComposerRecipeFat}
        onSetProgressWeight={setComposerProgressWeight}
        onSetProgressBodyFat={setComposerProgressBodyFat}
        onSetProgressBmi={setComposerProgressBmi}
        onSetProgressNotes={setComposerProgressNotes}
      />
      <Comments
        ui={socialUi}
        visible={commentsVisible}
        loading={commentsLoading}
        items={commentsItems}
        draft={commentDraft}
        sending={sendingComment}
        onClose={closeComments}
        onChangeDraft={setCommentDraft}
        onSubmit={() => void submitComment()}
      />
    </>
  );
}

function SettingsScreen({
  isActive,
  focusSection,
  onFocusSectionHandled,
}: {
  isActive: boolean;
  focusSection?: "profile" | null;
  onFocusSectionHandled?: () => void;
}) {
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const useDesktopLayout = isDesktopWebLayout(width);
  const useWideDesktopLayout = isWideDesktopWebLayout(width);
  const webMainScrollStyle = useMemo(() => webMainContentContainerStyle(width), [width]);
  const today = formatDateLocal(new Date());
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
      const [goalResult, analysisResult, bodySummaryResult, aiStatusResult] = await Promise.allSettled([
        auth.fetchGoal(today),
        auth.fetchAnalysis(today),
        auth.fetchBodySummary(),
        auth.fetchUserAIKeyStatus(),
      ]);

      const analysis = analysisResult.status === "fulfilled" ? analysisResult.value : null;
      if (analysis) {
        setRecommendedGoal(analysis.recommended_goal);
        setSuggestedKcalAdjustment(analysis.suggested_kcal_adjustment);
      }

      const bodySummary = bodySummaryResult.status === "fulfilled" ? bodySummaryResult.value : null;
      if (bodySummary) {
        setBodyHints(bodySummary.hints);
      }

      const aiStatus = aiStatusResult.status === "fulfilled" ? aiStatusResult.value : null;
      if (aiStatus) {
        setAiKeyStatus(aiStatus);
      }

      const goalResponse = goalResult.status === "fulfilled" ? goalResult.value : null;
      if (goalResponse) {
        setGoalDraft({
          kcal_goal: String(goalResponse.kcal_goal),
          protein_goal: String(goalResponse.protein_goal),
          fat_goal: String(goalResponse.fat_goal),
          carbs_goal: String(goalResponse.carbs_goal),
        });
      } else if (analysis) {
        setGoalDraft({
          kcal_goal: String(analysis.recommended_goal.kcal_goal),
          protein_goal: String(analysis.recommended_goal.protein_goal),
          fat_goal: String(analysis.recommended_goal.fat_goal),
          carbs_goal: String(analysis.recommended_goal.carbs_goal),
        });
      }

      if (goalResult.status === "rejected" && analysisResult.status === "rejected") {
        showAlert("Objetivos", parseApiError(goalResult.reason));
      }
    } catch (error) {
      showAlert("Ajustes", parseApiError(error));
    } finally {
      setLoadingMeta(false);
    }
  }, [auth.fetchAnalysis, auth.fetchBodySummary, auth.fetchGoal, auth.fetchUserAIKeyStatus, today]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    void loadMeta();
  }, [isActive, loadMeta]);

  useEffect(() => {
    if (!isActive || !focusSection) {
      return;
    }
    if (focusSection === "profile") {
      setOpenSections((current) => ({
        ...current,
        profile: true,
      }));
    }
    onFocusSectionHandled?.();
  }, [focusSection, isActive, onFocusSectionHandled]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const applyApi = async () => {
    const normalized = normalizeBaseUrl(apiDraft);
    if (!normalized) {
      showAlert("API", "URL inválida.");
      return;
    }

    auth.setApiBaseUrl(normalized);
    setChecking(true);
    const ok = await auth.checkHealth(normalized);
    setChecking(false);

    if (!ok) {
      showAlert("API", "No se pudo conectar con esa URL.");
      return;
    }

    showAlert("API", "Conexión OK.");
  };

  const saveGoals = async () => {
    const payload = {
      kcal_goal: Number(goalDraft.kcal_goal),
      protein_goal: Number(goalDraft.protein_goal),
      fat_goal: Number(goalDraft.fat_goal),
      carbs_goal: Number(goalDraft.carbs_goal),
    };
    if (!payload.kcal_goal || !payload.protein_goal || !payload.fat_goal || !payload.carbs_goal) {
      showAlert("Objetivos", "Revisa los valores.");
      return;
    }
    setSavingGoals(true);
    try {
      await auth.saveGoal(today, payload);
      showAlert("Objetivos", "Objetivos guardados.");
      await loadMeta();
    } catch (error) {
      showAlert("Objetivos", parseApiError(error));
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
      showAlert("Perfil", "Peso y altura son obligatorios.");
      return;
    }

    setSavingProfile(true);
    try {
      await auth.saveProfile({
        weight_kg: weight,
        height_cm: height,
        age: auth.profile?.age ?? ageFromBirthDateString(auth.user?.birth_date),
        sex: auth.user?.sex ?? auth.profile?.sex ?? "other",
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
      showAlert("Perfil", "Perfil actualizado.");
      await loadMeta();
    } catch (error) {
      showAlert("Perfil", parseApiError(error));
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
      showAlert("Datos", tx("Export JSON generado ({{sizeKb}} KB). Revisar consola del bundler.", { sizeKb: Math.round(text.length / 1024) }));
    } catch (error) {
      showAlert("Datos", parseApiError(error));
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
      showAlert("Datos", tx("Export CSV generado ({{days}} días). Revisa consola del bundler.", { days: rows.length - 1 }));
    } catch (error) {
      showAlert("Datos", parseApiError(error));
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
        showAlert("Datos", "No hay datos suficientes para compartir.");
        return;
      }
      const avgKcal = rows.reduce((acc, row) => acc + row.consumed.kcal, 0) / rows.length;
      const avgProtein = rows.reduce((acc, row) => acc + row.consumed.protein_g, 0) / rows.length;
      const avgWater = rows.reduce((acc, row) => acc + (row.water_ml ?? 0), 0) / rows.length;

      await Share.share({
        message: [
          tx("Resumen semanal NutrIA"),
          tx("Kcal promedio: {{avgKcal}}", { avgKcal: avgKcal.toFixed(0) }),
          tx("Proteína promedio: {{avgProtein}} g", { avgProtein: avgProtein.toFixed(1) }),
          tx("Agua promedio: {{avgWater}} ml", { avgWater: avgWater.toFixed(0) }),
        ].join("\n"),
      });
    } catch (error) {
      showAlert("Datos", parseApiError(error));
    }
  };

  const saveAIKey = async () => {
    if (!aiKeyInput.trim()) {
      showAlert("IA", "Pega una API key válida.");
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
      showAlert("IA", "Clave guardada correctamente.");
    } catch (error) {
      showAlert("IA", parseApiError(error));
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
      showAlert("IA", response.message);
      const statusPayload = await auth.fetchUserAIKeyStatus();
      setAiKeyStatus(statusPayload);
    } catch (error) {
      showAlert("IA", parseApiError(error));
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
      showAlert("IA", "Clave eliminada.");
    } catch (error) {
      showAlert("IA", parseApiError(error));
    } finally {
      setDeletingAIKey(false);
    }
  };

  const hasGoalsConfigured = Boolean(goalDraft.kcal_goal && goalDraft.protein_goal && goalDraft.fat_goal && goalDraft.carbs_goal);
  const hasProfileConfigured = Boolean(profileDraft.weight_kg && profileDraft.height_cm);
  const activeHintsCount = bodyHints.length;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.mainScroll, webMainScrollStyle]}>
        <AppHeader title="Ajustes" subtitle="Objetivos, perfil corporal, IA y datos" />

        <View style={useDesktopLayout ? [styles.desktopSectionGrid, useWideDesktopLayout && styles.desktopSectionGridWide] : undefined}>
        <AppCard
          style={[
            styles.settingsHeroCard,
            useDesktopLayout && (useWideDesktopLayout ? styles.settingsHeroDesktopWide : styles.settingsHeroDesktop),
          ]}
        >
          <SectionHeader title="Estado rápido" subtitle="Configuración clave del perfil" />
          <View style={styles.settingsStatusRow}>
            <TagChip label={hasGoalsConfigured ? "Objetivos listos" : "Faltan objetivos"} tone={hasGoalsConfigured ? "accent" : "warning"} />
            <TagChip label={hasProfileConfigured ? "Perfil completo" : "Perfil pendiente"} tone={hasProfileConfigured ? "accent" : "warning"} />
            <TagChip label={aiKeyStatus?.configured ? "IA activa" : "IA sin clave"} tone={aiKeyStatus?.configured ? "accent" : "default"} />
          </View>
          <StatRow label="Consejos" value={`${activeHintsCount}`} />
          <StatRow
            label="Sugerencia kcal"
            value={suggestedKcalAdjustment !== null ? `${suggestedKcalAdjustment >= 0 ? "+" : ""}${suggestedKcalAdjustment.toFixed(0)} kcal` : "N/D"}
          />
        </AppCard>

        <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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
                <SecondaryButton title="Usar recomendación" onPress={useRecommendedGoals} />
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
              <StatRow label="Kcal" value={goalDraft.kcal_goal || "-"} />
              <StatRow label="Proteína" value={goalDraft.protein_goal ? `${goalDraft.protein_goal} g` : "-"} />
              <StatRow label="Grasas" value={goalDraft.fat_goal ? `${goalDraft.fat_goal} g` : "-"} />
              <StatRow label="Carbs" value={goalDraft.carbs_goal ? `${goalDraft.carbs_goal} g` : "-"} />
            </View>
          )}
        </AppCard>

        <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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
              <ReadOnlyField label="Altura (cm)" value={profileDraft.height_cm || "No disponible"} />
              <Text style={styles.helperText}>
                Altura, sexo y edad quedan bloqueados tras el registro. La edad se recalcula al registrar peso en Cuerpo.
              </Text>
              <ReadOnlyField label="Sexo" value={auth.user?.sex ?? auth.profile?.sex ?? "other"} />
              <ReadOnlyField
                label="Edad"
                value={
                  auth.profile?.age !== null && auth.profile?.age !== undefined
                    ? String(auth.profile.age)
                    : ageFromBirthDateString(auth.user?.birth_date) !== null
                      ? String(ageFromBirthDateString(auth.user?.birth_date))
                      : "No disponible"
                }
              />
              <ReadOnlyField label="Fecha de nacimiento" value={auth.user?.birth_date ?? "No disponible"} />
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
              <StatRow label="Peso" value={profileDraft.weight_kg ? `${profileDraft.weight_kg} kg` : "-"} />
              <StatRow label="Altura" value={profileDraft.height_cm ? `${profileDraft.height_cm} cm` : "-"} />
              <StatRow label="Sexo" value={auth.user?.sex ?? auth.profile?.sex ?? "other"} />
            </View>
          )}
        </AppCard>

        <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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
              <StatRow label="Proveedor" value="OpenAI" />
              <StatRow label="Estado" value={aiKeyStatus?.configured ? "Clave configurada" : "Sin clave configurada"} />
              {aiKeyStatus?.key_hint ? <StatRow label="Hint" value={aiKeyStatus.key_hint} /> : null}
            </View>
          )}
        </AppCard>

        {DEV_SETTINGS_MODE ? (
          <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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

        <AppCard style={useDesktopLayout ? [styles.desktopSectionGridItem, useWideDesktopLayout && styles.desktopSectionGridItemWide] : undefined}>
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
                onPress={() => showAlert("Datos", "Stub listo. Pendiente endpoint de borrado seguro.")}
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
              <StatRow label="Export JSON" value="Disponible" />
              <StatRow label="Export CSV" value="Disponible" />
              <StatRow label="Resumen semanal" value="Compartible" />
            </View>
          )}
        </AppCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuantityMethodSelector(props: {
  method: IntakeMethod;
  onChange: (method: IntakeMethod) => void;
  product: Product;
}) {
  const isRecipeProduct = props.product.source === "user_recipe";
  const options: Array<{ label: string; value: IntakeMethod; disabled?: boolean }> = [
    { label: "Gramos", value: "grams", disabled: isRecipeProduct },
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

function AddScreen(props: {
  isActive: boolean;
  launchAction: AddLaunchAction | null;
  onLaunchActionHandled: (requestId: number) => void;
  onIntakeSaved: () => void;
  onMealSourceSheetVisibilityChange: (visible: boolean) => void;
  onScanCameraVisibilityChange: (visible: boolean) => void;
  onMealQuestionsVisibilityChange: (visible: boolean) => void;
  onBackToPanel: () => void;
}) {
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const { language } = useI18n();
  const webScanStyle = useMemo(() => webScanContainerStyle(width), [width]);
  const webScanFrameResponsiveStyle = useMemo(() => webScanFrameStyle(width), [width]);
  const notifyMealSourceSheetVisibility = props.onMealSourceSheetVisibilityChange;
  const notifyScanCameraVisibility = props.onScanCameraVisibilityChange;
  const notifyMealQuestionsVisibility = props.onMealQuestionsVisibilityChange;
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<AddMode>("hub");
  const [scanLocked, setScanLocked] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanSuccessFlash, setScanSuccessFlash] = useState(false);
  const [showScannedProductImage, setShowScannedProductImage] = useState(false);
  const [phase, setPhase] = useState<"camera" | "label" | "quantity">("camera");
  const [quantityBackTarget, setQuantityBackTarget] = useState<AddBackTarget>("hub");
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [productQuality, setProductQuality] = useState<ProductDataQuality | null>(null);
  const [preferredServing, setPreferredServing] = useState<ProductPreference | null>(null);
  const scanRequestLockRef = useRef(false);
  const scanPulse = useRef(new Animated.Value(0)).current;
  const [recentProducts, setRecentProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<FavoriteProduct[]>([]);
  const [myRecipes, setMyRecipes] = useState<UserRecipe[]>([]);
  const [loadingMyRecipes, setLoadingMyRecipes] = useState(false);
  const lastHubDataRefreshRef = useRef(0);
  const lastRecipesRefreshRef = useRef(0);
  const [recipesStage, setRecipesStage] = useState<"chooser" | "detail" | "manual" | "ai_input" | "ai_options" | "ai_result">("chooser");
  const [recipeManualBackStage, setRecipeManualBackStage] = useState<"chooser" | "detail" | "ai_result">("chooser");
  const [selectedRecipe, setSelectedRecipe] = useState<UserRecipe | null>(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeDraftId, setRecipeDraftId] = useState<number | null>(null);
  const [recipeTitle, setRecipeTitle] = useState("");
  const [recipeMealType, setRecipeMealType] = useState<RecipeMealType>("lunch");
  const [recipeServings, setRecipeServings] = useState("1");
  const [recipePrepTime, setRecipePrepTime] = useState("");
  const [recipeIngredientRows, setRecipeIngredientRows] = useState<
    Array<{ key: string; name: string; quantity: string; unit: string }>
  >([{ key: createLocalDraftKey("recipe-ingredient"), name: "", quantity: "", unit: "" }]);
  const [recipeStepRows, setRecipeStepRows] = useState<Array<{ key: string; value: string }>>([
    { key: createLocalDraftKey("recipe-step"), value: "" },
  ]);
  const [recipeTagsInput, setRecipeTagsInput] = useState("");
  const [recipeKcal, setRecipeKcal] = useState("");
  const [recipeProtein, setRecipeProtein] = useState("");
  const [recipeCarbs, setRecipeCarbs] = useState("");
  const [recipeFat, setRecipeFat] = useState("");
  const [recipeCoachFeedback, setRecipeCoachFeedback] = useState<string | null>(null);
  const [recipeAssumptions, setRecipeAssumptions] = useState<string[]>([]);
  const [recipeSuggestedExtras, setRecipeSuggestedExtras] = useState<string[]>([]);
  const [recipeAiMealType, setRecipeAiMealType] = useState<RecipeMealType>("lunch");
  const [recipeAiTargetKcal, setRecipeAiTargetKcal] = useState("");
  const [recipeAiTargetProtein, setRecipeAiTargetProtein] = useState("");
  const [recipeAiTargetFat, setRecipeAiTargetFat] = useState("");
  const [recipeAiTargetCarbs, setRecipeAiTargetCarbs] = useState("");
  const [recipeAiGoalMode, setRecipeAiGoalMode] = useState<GoalType>("maintain");
  const [recipeAiOnlyIngredients, setRecipeAiOnlyIngredients] = useState(true);
  const [recipeAiPantryBasics, setRecipeAiPantryBasics] = useState(true);
  const [recipeAiAllergiesInput, setRecipeAiAllergiesInput] = useState("");
  const [recipeAiPreferencesInput, setRecipeAiPreferencesInput] = useState("");
  const [recipeAiIngredientRows, setRecipeAiIngredientRows] = useState<
    Array<{ key: string; name: string; quantity: string; unit: string }>
  >([{ key: createLocalDraftKey("ai-ingredient"), name: "", quantity: "", unit: "" }]);
  const [recipeAiAutoFocusIngredientKey, setRecipeAiAutoFocusIngredientKey] = useState<string | null>(null);
  const [recipeAiOptions, setRecipeAiOptions] = useState<RecipeAiOptionPreview[]>([]);
  const [recipeAiGenerationId, setRecipeAiGenerationId] = useState<string | null>(null);
  const [recipeAiSelectedOption, setRecipeAiSelectedOption] = useState<RecipeAiOptionPreview | null>(null);
  const [recipeAiResult, setRecipeAiResult] = useState<RecipeAiDetailResponse | null>(null);
  const [recipeAiKeyConfigured, setRecipeAiKeyConfigured] = useState<boolean | null>(null);

  const [labelName, setLabelName] = useState("");
  const [labelBrand, setLabelBrand] = useState("");
  const [labelText, setLabelText] = useState("");
  const [labelFixKcal, setLabelFixKcal] = useState("");
  const [labelFixProtein, setLabelFixProtein] = useState("");
  const [labelFixFat, setLabelFixFat] = useState("");
  const [labelFixCarbs, setLabelFixCarbs] = useState("");
  const [labelPhotos, setLabelPhotos] = useState<string[]>([]);
  const [labelQuestions, setLabelQuestions] = useState<string[]>([]);
  const [correctionPreview, setCorrectionPreview] = useState<ProductCorrectionResponse | null>(null);

  const [mealDescription, setMealDescription] = useState("");
  const [mealPlateWeight, setMealPlateWeight] = useState("");
  const [mealPhotos, setMealPhotos] = useState<string[]>([]);
  const [mealStep, setMealStep] = useState<"compose" | "questions" | "result">("compose");
  const [mealQuestions, setMealQuestions] = useState<MealEstimateQuestion[]>([]);
  const [mealQuestionAnswers, setMealQuestionAnswers] = useState<Record<string, string>>({});
  const [mealAssumptions, setMealAssumptions] = useState<string[]>([]);
  const [mealIngredients, setMealIngredients] = useState<string[]>([]);
  const [mealAnalysisId, setMealAnalysisId] = useState<string | null>(null);
  const [mealAnalysisExpiresAt, setMealAnalysisExpiresAt] = useState<string | null>(null);
  const [mealPreview, setMealPreview] = useState<MealPhotoEstimateResponse | null>(null);
  const [mealEditable, setMealEditable] = useState<{ kcal: string; protein_g: string; fat_g: string; carbs_g: string }>({
    kcal: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
  });
  const [mealQuestionProgress, setMealQuestionProgress] = useState(0);
  const [mealQuestionPhase, setMealQuestionPhase] = useState<string | null>(null);
  const [mealSourceSheetOpen, setMealSourceSheetOpen] = useState(false);
  const [mealSourceSheetVisible, setMealSourceSheetVisible] = useState(false);
  const mealSourceSheetAnim = useRef(new Animated.Value(0)).current;
  const [toastFeedback, setToastFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualKcal, setManualKcal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<FoodSearchItem[]>([]);
  const [manualHasSearched, setManualHasSearched] = useState(false);
  const [showManualCreateForm, setShowManualCreateForm] = useState(false);
  const [searchingFoods, setSearchingFoods] = useState(false);
  const manualSearchRequestIdRef = useRef(0);
  const lastManualSearchQueryRef = useRef("");
  const manualSearchAbortControllerRef = useRef<AbortController | null>(null);
  const manualSearchInFlightQueryRef = useRef("");

  const [method, setMethod] = useState<IntakeMethod>("grams");
  const [grams, setGrams] = useState(100);
  const [units, setUnits] = useState(1);
  const [percentPack, setPercentPack] = useState(25);
  const [useDefaultSummary100g, setUseDefaultSummary100g] = useState(true);
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
      showAlert("Permisos", "Activa permiso de cámara para usar el escáner.");
    }
  }, [permission?.granted, requestPermission]);

  const resetScanState = useCallback(() => {
    scanRequestLockRef.current = false;
    setMealSourceSheetOpen(false);
    setMealSourceSheetVisible(false);
    notifyMealSourceSheetVisibility(false);
    notifyMealQuestionsVisibility(false);
    mealSourceSheetAnim.setValue(0);
    setPhase("camera");
    setQuantityBackTarget("hub");
    setScanLocked(false);
    setProcessing(false);
    setScanSuccessFlash(false);
    setShowScannedProductImage(false);
    setProduct(null);
    setProductQuality(null);
    setPreferredServing(null);
    setBarcode("");
    setLabelName("");
    setLabelBrand("");
    setLabelText("");
    setLabelFixKcal("");
    setLabelFixProtein("");
    setLabelFixFat("");
    setLabelFixCarbs("");
    setLabelPhotos([]);
    setLabelQuestions([]);
    setCorrectionPreview(null);
    setMealAnalysisId(null);
    setMealAnalysisExpiresAt(null);
    setMealQuestionProgress(0);
    setMealQuestionPhase(null);
    setMethod("grams");
    setGrams(100);
    setUnits(1);
    setPercentPack(25);
  }, [mealSourceSheetAnim, notifyMealQuestionsVisibility, notifyMealSourceSheetVisibility]);

  const resetToHub = useCallback(() => {
    resetScanState();
    setMode("hub");
  }, [resetScanState]);

  const prefillFromPreference = useCallback((nextProduct: Product, pref: ProductPreference | null) => {
    if (pref?.method === "units" && pref.quantity_units && nextProduct.serving_size_g) {
      setMethod("units");
      setUnits(pref.quantity_units);
      setUseDefaultSummary100g(false);
      return;
    }
    if (pref?.method === "grams" && pref.quantity_g) {
      setMethod("grams");
      setGrams(pref.quantity_g);
      setUseDefaultSummary100g(false);
      return;
    }
    if (pref?.method === "percent_pack" && pref.percent_pack && nextProduct.net_weight_g) {
      setMethod("percent_pack");
      setPercentPack(pref.percent_pack);
      setUseDefaultSummary100g(false);
      return;
    }
    if (nextProduct.source === "user_recipe") {
      setMethod("units");
      setUnits(1);
      setUseDefaultSummary100g(false);
      return;
    }
    setMethod("grams");
    setGrams(100);
    setUnits(1);
    setPercentPack(25);
    setUseDefaultSummary100g(true);
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
          next.push({
            id: intake.product_id,
            name: intake.product_name ?? tx("Producto {{productId}}", { productId: intake.product_id }),
          });
        });
      setRecentProducts(next.slice(0, 6));
      setFavoriteProducts(favorites);
    } catch {
      setRecentProducts([]);
      setFavoriteProducts([]);
    }
  }, [auth.fetchDaySummary, auth.fetchFavoriteProducts, todayKey]);

  const loadMyRecipes = useCallback(async () => {
    setLoadingMyRecipes(true);
    try {
      const rows = await auth.fetchMyRecipes({ limit: 120 });
      setMyRecipes(rows);
    } catch (error) {
      showAlert("Crear recetas", parseApiError(error));
      setMyRecipes([]);
    } finally {
      setLoadingMyRecipes(false);
    }
  }, [auth.fetchMyRecipes]);

  const resetRecipeEditor = useCallback(
    (backStage: "chooser" | "detail" | "ai_result" = "chooser") => {
      setRecipeManualBackStage(backStage);
      setRecipeDraftId(null);
      setRecipeTitle("");
      setRecipeMealType("lunch");
      setRecipeServings("1");
      setRecipePrepTime("");
      setRecipeIngredientRows([{ key: createLocalDraftKey("recipe-ingredient"), name: "", quantity: "", unit: "" }]);
      setRecipeStepRows([{ key: createLocalDraftKey("recipe-step"), value: "" }]);
      setRecipeTagsInput("");
      setRecipeKcal("");
      setRecipeProtein("");
      setRecipeCarbs("");
      setRecipeFat("");
      setRecipeCoachFeedback(null);
      setRecipeAssumptions([]);
      setRecipeSuggestedExtras([]);
    },
    [],
  );

  const resetRecipeAiBuilder = useCallback(() => {
    setRecipeAiMealType("lunch");
    setRecipeAiTargetKcal("");
    setRecipeAiTargetProtein("");
    setRecipeAiTargetFat("");
    setRecipeAiTargetCarbs("");
    setRecipeAiGoalMode("maintain");
    setRecipeAiOnlyIngredients(true);
    setRecipeAiPantryBasics(true);
    setRecipeAiAllergiesInput("");
    setRecipeAiPreferencesInput("");
    setRecipeAiIngredientRows([{ key: createLocalDraftKey("ai-ingredient"), name: "", quantity: "", unit: "" }]);
    setRecipeAiAutoFocusIngredientKey(null);
    setRecipeAiOptions([]);
    setRecipeAiGenerationId(null);
    setRecipeAiSelectedOption(null);
    setRecipeAiResult(null);
  }, []);

  const populateRecipeEditor = useCallback(
    (
      payload: UserRecipePayload,
      options?: {
        id?: number | null;
        backStage?: "chooser" | "detail" | "ai_result";
        coachFeedback?: string | null;
        assumptions?: string[];
        suggestedExtras?: string[];
      },
    ) => {
      setRecipeManualBackStage(options?.backStage ?? "chooser");
      setRecipeDraftId(options?.id ?? null);
      setRecipeTitle(payload.title);
      setRecipeMealType(payload.meal_type);
      setRecipeServings(String(payload.servings));
      setRecipePrepTime(payload.prep_time_min != null ? String(payload.prep_time_min) : "");
      setRecipeIngredientRows(
        payload.ingredients.length
          ? payload.ingredients.map((item, index) => ({
              key: createLocalDraftKey(`recipe-ingredient-${index}`),
              name: item.name,
              quantity: item.quantity != null ? String(item.quantity) : "",
              unit: item.unit ?? "",
            }))
          : [{ key: createLocalDraftKey("recipe-ingredient"), name: "", quantity: "", unit: "" }],
      );
      setRecipeStepRows(
        payload.steps.length
          ? payload.steps.map((step, index) => ({
              key: createLocalDraftKey(`recipe-step-${index}`),
              value: step,
            }))
          : [{ key: createLocalDraftKey("recipe-step"), value: "" }],
      );
      setRecipeTagsInput(payload.tags.join(", "));
      setRecipeKcal(String(payload.nutrition_kcal));
      setRecipeProtein(String(payload.nutrition_protein_g));
      setRecipeCarbs(String(payload.nutrition_carbs_g));
      setRecipeFat(String(payload.nutrition_fat_g));
      setRecipeCoachFeedback(options?.coachFeedback ?? null);
      setRecipeAssumptions(options?.assumptions ?? []);
      setRecipeSuggestedExtras(options?.suggestedExtras ?? []);
    },
    [],
  );

  const openRecipeDetail = useCallback(
    async (recipeId: number) => {
      setSaving(true);
      try {
        const recipe = await auth.fetchRecipe(recipeId);
        setSelectedRecipe(recipe);
        setRecipesStage("detail");
      } catch (error) {
        showAlert("Crear recetas", parseApiError(error));
      } finally {
        setSaving(false);
      }
    },
    [auth.fetchRecipe],
  );

  const startRecipeManualCreation = useCallback(() => {
    resetRecipeEditor("chooser");
    setRecipesStage("manual");
  }, [resetRecipeEditor]);

  const startRecipeAiCreation = useCallback(async () => {
    resetRecipeAiBuilder();
    setRecipesStage("ai_input");
    try {
      const aiStatus = await auth.fetchUserAIKeyStatus();
      setRecipeAiKeyConfigured(aiStatus.configured && aiStatus.provider === "openai");
    } catch {
      setRecipeAiKeyConfigured(false);
    }
  }, [auth.fetchUserAIKeyStatus, resetRecipeAiBuilder]);

  const openProductInQuantity = useCallback(
    (nextProduct: Product, backTarget: AddBackTarget = "hub", pref: ProductPreference | null = null) => {
      setShowScannedProductImage(false);
      setQuantityBackTarget(backTarget);
      setProduct(nextProduct);
      setPreferredServing(pref);
      setLabelName(nextProduct.name);
      setLabelBrand(nextProduct.brand ?? "");
      setMode("barcode");
      setPhase("quantity");
      prefillFromPreference(nextProduct, pref);
    },
    [prefillFromPreference],
  );

  const startBarcodeFlow = async () => {
    resetScanState();
    setQuantityBackTarget("barcode_camera");
    setMode("barcode");
    setPhase("camera");
    await requestCameraAndUnlock();
  };

  const ensureAIKeyConfigured = useCallback(async (): Promise<boolean> => {
    try {
      const statusPayload = await auth.fetchUserAIKeyStatus();
      if (statusPayload.configured) {
        return true;
      }
      showAlert("IA", "Configura tu API key en Settings > IA para usar estimación por foto.");
      return false;
    } catch (error) {
      showAlert("IA", parseApiError(error));
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
    setMealPlateWeight("");
    setMealPhotos([]);
    setMealStep("compose");
    setMealQuestions([]);
    setMealQuestionAnswers({});
    setMealAssumptions([]);
    setMealIngredients([]);
    setMealAnalysisId(null);
    setMealAnalysisExpiresAt(null);
    setMealPreview(null);
    setMealQuestionProgress(0);
    setMealQuestionPhase(null);
    setMealEditable({
      kcal: "",
      protein_g: "",
      fat_g: "",
      carbs_g: "",
    });
    setToastFeedback(null);
    setMode("meal_photo");
  };

  const openMealSourceSheet = useCallback(() => {
    if (mealSourceSheetOpen) {
      return;
    }
    notifyMealSourceSheetVisibility(true);
    setMealSourceSheetVisible(true);
    setMealSourceSheetOpen(true);
    mealSourceSheetAnim.stopAnimation();
    Animated.spring(mealSourceSheetAnim, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.95,
      useNativeDriver: true,
    }).start();
  }, [mealSourceSheetAnim, mealSourceSheetOpen, notifyMealSourceSheetVisibility]);

  const closeMealSourceSheet = useCallback(
    (onClosed?: () => void) => {
      if (!mealSourceSheetVisible) {
        onClosed?.();
        return;
      }
      setMealSourceSheetOpen(false);
      notifyMealSourceSheetVisibility(false);
      mealSourceSheetAnim.stopAnimation();
      Animated.timing(mealSourceSheetAnim, {
        toValue: 0,
        duration: 230,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMealSourceSheetVisible(false);
        }
        onClosed?.();
      });
    },
    [mealSourceSheetAnim, mealSourceSheetVisible, notifyMealSourceSheetVisibility],
  );

  useEffect(() => {
    return () => {
      notifyMealSourceSheetVisibility(false);
    };
  }, [notifyMealSourceSheetVisibility]);

  useEffect(() => {
    notifyScanCameraVisibility(mode === "barcode" && phase === "camera" && props.isActive);
  }, [mode, phase, notifyScanCameraVisibility, props.isActive]);

  useEffect(() => {
    return () => {
      notifyScanCameraVisibility(false);
    };
  }, [notifyScanCameraVisibility]);

  useEffect(() => {
    notifyMealQuestionsVisibility(mode === "meal_photo" && mealStep === "questions" && props.isActive);
  }, [mealStep, mode, notifyMealQuestionsVisibility, props.isActive]);

  useEffect(() => {
    return () => {
      notifyMealQuestionsVisibility(false);
    };
  }, [notifyMealQuestionsVisibility]);

  const startManualFlow = () => {
    resetScanState();
    setManualName("");
    setManualKcal("");
    setManualProtein("");
    setManualFat("");
    setManualCarbs("");
    setManualSearch("");
    setManualResults([]);
    setManualHasSearched(false);
    setShowManualCreateForm(false);
    manualSearchRequestIdRef.current += 1;
    lastManualSearchQueryRef.current = "";
    setQuantityBackTarget("manual");
    setMode("manual");
  };

  const startManualCreateFlow = () => {
    startManualFlow();
    setShowManualCreateForm(true);
  };

  const startRecipesFlow = () => {
    resetScanState();
    setQuantityBackTarget("recipes");
    setRecipesStage("chooser");
    setSelectedRecipe(null);
    setRecipeSearch("");
    resetRecipeEditor("chooser");
    resetRecipeAiBuilder();
    setMode("recipes");
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
      if (launch.action === "meal_photo") {
        await startMealFlow();
        return;
      }
      if (launch.action === "recipes") {
        startRecipesFlow();
        return;
      }
      startManualFlow();
    };

    void run().finally(() => {
      props.onLaunchActionHandled(launch.requestId);
    });
  }, [
    props.launchAction,
    props.onLaunchActionHandled,
    startBarcodeFlow,
    startMealFlow,
    startManualFlow,
    startRecipesFlow,
  ]);

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

  const defaultSummary100g = useMemo(() => {
    if (!product) {
      return null;
    }
    if (product.nutrition_basis === "per_serving" && (product.serving_size_g ?? 0) > 0) {
      const factor = 100 / (product.serving_size_g ?? 1);
      return {
        kcal: Math.round(product.kcal * factor),
        protein: Math.round(product.protein_g * factor * 10) / 10,
        carbs: Math.round(product.carbs_g * factor * 10) / 10,
        fats: Math.round(product.fat_g * factor * 10) / 10,
      };
    }
    return {
      kcal: Math.round(product.kcal),
      protein: Math.round(product.protein_g * 10) / 10,
      carbs: Math.round(product.carbs_g * 10) / 10,
      fats: Math.round(product.fat_g * 10) / 10,
    };
  }, [product]);

  const quantityMacroSummary = useMemo(() => {
    if (useDefaultSummary100g && defaultSummary100g) {
      return defaultSummary100g;
    }
    if (previewNutrients) {
      return previewNutrients;
    }
    return defaultSummary100g;
  }, [defaultSummary100g, previewNutrients, useDefaultSummary100g]);

  const favoriteProductIds = useMemo(
    () => new Set(favoriteProducts.map((item) => item.product.id)),
    [favoriteProducts],
  );

  const applyBarcodeLookupResult = useCallback(
    async (rawBarcode: string, lookup: ProductLookupResponse) => {
      setBarcode(rawBarcode);
      if (lookup.product) {
        setQuantityBackTarget("barcode_camera");
        setProduct(lookup.product);
        prefillFromPreference(lookup.product, lookup.preferred_serving);
        setPreferredServing(lookup.preferred_serving);
        setLabelName(lookup.product.name);
        setLabelBrand(lookup.product.brand ?? "");
        await new Promise((resolve) => {
          setTimeout(resolve, 180);
        });
        setPhase("quantity");
        return;
      }

      setQuantityBackTarget("barcode_camera");
      setProduct(null);
      setPreferredServing(null);
      setLabelName("");
      setLabelBrand("");
      setLabelQuestions([
        lookup.message ?? "No hay nutrición suficiente para este barcode.",
        ...lookup.missing_fields.map((field) => tx("Falta {{field}}", { field })),
      ]);
      setPhase("label");
    },
    [prefillFromPreference],
  );

  const handleScan = async (result: BarcodeScanningResult) => {
    if (scanLocked || scanRequestLockRef.current) {
      return;
    }

    scanRequestLockRef.current = true;
    setShowScannedProductImage(true);
    setScanLocked(true);
    setProcessing(true);
    Vibration.vibrate(50);
    setScanSuccessFlash(true);

    try {
      const raw = result.data.trim();
      const lookup = await auth.lookupByBarcode(raw);
      await applyBarcodeLookupResult(raw, lookup);
    } catch (error) {
      showAlert("Escáner", parseApiError(error));
      setScanLocked(false);
      scanRequestLockRef.current = false;
      setPhase("camera");
    } finally {
      setProcessing(false);
    }
  };

  const lookupBarcodeFallback = async () => {
    const raw = barcode.trim();
    if (!raw) {
      showAlert("Escáner", "Introduce un EAN/UPC para buscar.");
      return;
    }

    setProcessing(true);
    try {
      const lookup = await auth.lookupByBarcode(raw);
      await applyBarcodeLookupResult(raw, lookup);
    } catch (error) {
      showAlert("Escáner", parseApiError(error));
    } finally {
      setProcessing(false);
    }
  };

  const scanBarcodeFromImage = async () => {
    if (Platform.OS !== "web") {
      return;
    }

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert("Permisos", "Necesitas permisos de cámara para capturar y escanear.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.95, allowsEditing: false });
    const firstAsset = result.canceled ? null : result.assets[0];
    if (!firstAsset?.uri) {
      return;
    }

    setShowScannedProductImage(true);
    setProcessing(true);
    try {
      let matches = await scanFromURLAsync(firstAsset.uri, BARCODE_TYPES);
      if (!matches.length) {
        const mirrored = await ImageManipulator.manipulateAsync(
          firstAsset.uri,
          [{ flip: ImageManipulator.FlipType.Horizontal }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: false },
        );
        matches = await scanFromURLAsync(mirrored.uri, BARCODE_TYPES);
      }

      const firstMatch = matches.find((entry) => entry.data?.trim());
      if (!firstMatch?.data) {
        showAlert("Escáner", "No detectamos un barcode válido. Prueba con más luz o una imagen más nítida.");
        return;
      }

      const raw = firstMatch.data.trim();
      const lookup = await auth.lookupByBarcode(raw);
      await applyBarcodeLookupResult(raw, lookup);
    } catch (error) {
      showAlert("Escáner", parseApiError(error));
    } finally {
      setProcessing(false);
    }
  };

  const captureLabelPhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert("Permisos", "Necesitas permisos de cámara para capturar etiqueta.");
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

  const readImageSize = useCallback(async (uri: string): Promise<{ width: number; height: number } | null> => {
    return await new Promise((resolve) => {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        () => resolve(null),
      );
    });
  }, []);

  const preprocessMealPhotosForUpload = useCallback(
    async (
      uris: string[],
      onProgress?: (ratio: number) => void,
    ): Promise<string[]> => {
      if (!uris.length) {
        onProgress?.(1);
        return [];
      }

      const output: string[] = [];
      for (let index = 0; index < uris.length; index += 1) {
        const uri = uris[index];
        if (!uri) {
          continue;
        }
        onProgress?.(index / uris.length);
        try {
          const size = await readImageSize(uri);
          let resizeAction: ImageManipulator.ActionResize["resize"] | undefined;
          if (size) {
            const maxSide = Math.max(size.width, size.height);
            if (maxSide > 1280) {
              const scale = 1280 / maxSide;
              resizeAction = {
                width: Math.max(1, Math.round(size.width * scale)),
                height: Math.max(1, Math.round(size.height * scale)),
              };
            }
          }

          const result = await ImageManipulator.manipulateAsync(
            uri,
            resizeAction ? [{ resize: resizeAction }] : [],
            {
              compress: 0.75,
              format: ImageManipulator.SaveFormat.JPEG,
              base64: false,
            },
          );
          output.push(result.uri || uri);
        } catch {
          output.push(uri);
        }
        onProgress?.((index + 1) / uris.length);
      }
      return output;
    },
    [readImageSize],
  );

  const addMealPhotos = useCallback(
    (uris: string[]) => {
      const incoming = uris.filter((uri) => !!uri.trim());
      if (!incoming.length) {
        return;
      }

      const next = [...mealPhotos];
      for (const uri of incoming) {
        if (next.length >= MAX_MEAL_PHOTOS) {
          break;
        }
        if (!next.includes(uri)) {
          next.push(uri);
        }
      }

      const added = next.length - mealPhotos.length;
      if (added <= 0) {
        showAlert("Fotos", tx("Máximo {{max}} fotos por estimación.", { max: MAX_MEAL_PHOTOS }));
        return;
      }
      if (added < incoming.length) {
        showAlert("Fotos", tx("Solo se guardaron {{max}} fotos (máximo).", { max: MAX_MEAL_PHOTOS }));
      }

      setMealPreview(null);
      setMealPhotos(next);
      setMealAnalysisId(null);
      setMealAnalysisExpiresAt(null);
      setMealStep("compose");
      setMealQuestions([]);
      setMealQuestionAnswers({});
      setMealQuestionProgress(0);
      setMealQuestionPhase(null);
    },
    [mealPhotos],
  );

  const captureMealPhoto = async () => {
    if (mealPhotos.length >= MAX_MEAL_PHOTOS) {
      showAlert("Fotos", tx("Máximo {{max}} fotos por estimación.", { max: MAX_MEAL_PHOTOS }));
      return;
    }
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert("Permisos", "Necesitas permisos de cámara para capturar comida.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false });
    const firstAsset = result.canceled ? null : result.assets[0];
    if (!firstAsset?.uri) {
      return;
    }
    addMealPhotos([firstAsset.uri]);
  };

  const pickMealPhotoFromLibrary = async () => {
    if (mealPhotos.length >= MAX_MEAL_PHOTOS) {
      showAlert("Fotos", tx("Máximo {{max}} fotos por estimación.", { max: MAX_MEAL_PHOTOS }));
      return;
    }
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert("Permisos", "Necesitas permisos de galería para subir una foto.");
      return;
    }
    const remaining = Math.max(1, MAX_MEAL_PHOTOS - mealPhotos.length);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    const selectedUris = result.canceled ? [] : result.assets.map((asset) => asset.uri).filter(Boolean);
    if (!selectedUris.length) {
      return;
    }
    addMealPhotos(selectedUris);
  };

  const removeMealPhoto = () => {
    setMealPhotos([]);
    setMealPlateWeight("");
    setMealAnalysisId(null);
    setMealAnalysisExpiresAt(null);
    setMealQuestions([]);
    setMealQuestionAnswers({});
    setMealAssumptions([]);
    setMealIngredients([]);
    setMealPreview(null);
    setMealQuestionProgress(0);
    setMealQuestionPhase(null);
    setMealEditable({
      kcal: "",
      protein_g: "",
      fat_g: "",
      carbs_g: "",
    });
    setMealStep("compose");
  };

  const resolveMealPlateWeightNote = useCallback((): string | null => {
    const raw = mealPlateWeight.trim();
    if (!raw) {
      return "";
    }
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return `${Math.round(parsed)} g`;
  }, [mealPlateWeight]);

  const runMealQuestions = async () => {
    const hasKey = await ensureAIKeyConfigured();
    if (!hasKey) {
      return;
    }
    if (mealPhotos.length === 0) {
      showAlert("Estimación", "Primero toma o sube una foto de la comida.");
      return;
    }
    const resolvedPlateWeight = resolveMealPlateWeightNote();
    if (resolvedPlateWeight === null) {
      showAlert("Estimación", "El peso del plato debe ser un número válido en gramos.");
      return;
    }
    const quantityNote = resolvedPlateWeight || undefined;
    setSaving(true);
    setMealQuestionProgress(0);
    setMealQuestionPhase(tx("Preparando fotos..."));
    let progressTicker: ReturnType<typeof setInterval> | null = null;
    try {
      const processedPhotos = await preprocessMealPhotosForUpload(mealPhotos, (ratio) => {
        setMealQuestionProgress(Math.round(Math.max(0, Math.min(1, ratio)) * 35));
      });
      setMealQuestionPhase(tx("Subiendo fotos..."));
      progressTicker = setInterval(() => {
        setMealQuestionProgress((current) => {
          if (current >= 92) {
            return current;
          }
          const nextValue = current < 70 ? current + 2 : current + 1;
          return Math.min(92, nextValue);
        });
        setMealQuestionPhase((currentPhase) => {
          if (currentPhase === tx("Subiendo fotos...")) {
            return tx("Analizando...");
          }
          return tx("Generando preguntas...");
        });
      }, 220);

      const response = await auth.mealEstimateQuestions({
        description: mealDescription.trim() || undefined,
        quantityNote,
        photos: processedPhotos,
        locale: language,
        onUploadProgress: ({ ratio }) => {
          const normalized = Math.max(0, Math.min(1, ratio));
          setMealQuestionProgress((current) => Math.max(current, Math.round(35 + normalized * 35)));
        },
      });
      setMealQuestionProgress(100);
      setMealQuestionPhase(tx("Preguntas listas"));
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
      setMealAnalysisId(response.analysis_id ?? null);
      setMealAnalysisExpiresAt(response.analysis_expires_at ?? null);
      setMealStep("questions");
    } catch (error) {
      showAlert("Estimación", parseApiError(error));
      setMealQuestionProgress(0);
      setMealQuestionPhase(null);
    } finally {
      if (progressTicker) {
        clearInterval(progressTicker);
      }
      setSaving(false);
      if (mealStep === "compose") {
        setTimeout(() => {
          setMealQuestionPhase(null);
          setMealQuestionProgress(0);
        }, 260);
      }
    }
  };

  const parseMealMacroInput = useCallback((value: string): number | null => {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }, []);

  const formatMealMacroInput = useCallback((value: number): string => {
    if (!Number.isFinite(value)) {
      return "";
    }
    const rounded = Math.round(value * 10) / 10;
    return String(rounded).replace(".", ",");
  }, []);

  const resolveMealEditedMacros = useCallback((): MealEstimateOverride | null => {
    if (!mealPreview) {
      return null;
    }

    const fallback = mealPreview.preview_nutrients;

    const resolved = {
      kcal: parseMealMacroInput(mealEditable.kcal) ?? fallback.kcal,
      protein_g: parseMealMacroInput(mealEditable.protein_g) ?? fallback.protein_g,
      fat_g: parseMealMacroInput(mealEditable.fat_g) ?? fallback.fat_g,
      carbs_g: parseMealMacroInput(mealEditable.carbs_g) ?? fallback.carbs_g,
    };

    if (Object.values(resolved).some((value) => !Number.isFinite(value) || value < 0)) {
      return null;
    }
    return resolved;
  }, [mealEditable, mealPreview, parseMealMacroInput]);

  const runMealPreview = async () => {
    const hasKey = await ensureAIKeyConfigured();
    if (!hasKey) {
      return;
    }
    if (mealPhotos.length === 0) {
      showAlert("Estimación", "Añade una foto antes de calcular.");
      return;
    }
    const resolvedPlateWeight = resolveMealPlateWeightNote();
    if (resolvedPlateWeight === null) {
      showAlert("Estimación", "El peso del plato debe ser un número válido en gramos.");
      return;
    }
    const quantityNote = resolvedPlateWeight || undefined;
    setSaving(true);
    try {
      const response = await auth.mealPhotoEstimateCalculate({
        description: mealDescription.trim() || undefined,
        answers: mealQuestionAnswers,
        quantityNote,
        analysisId: mealAnalysisId ?? undefined,
        photos: mealAnalysisId ? [] : mealPhotos,
        commit: false,
        locale: language,
      });
      setMealPreview(response);
      if (response.question_items?.length) {
        setMealQuestions(response.question_items);
      }
      setMealAssumptions(response.assumptions);
      setMealIngredients(response.detected_ingredients);
      setMealEditable({
        kcal: formatMealMacroInput(response.preview_nutrients.kcal),
        protein_g: formatMealMacroInput(response.preview_nutrients.protein_g),
        fat_g: formatMealMacroInput(response.preview_nutrients.fat_g),
        carbs_g: formatMealMacroInput(response.preview_nutrients.carbs_g),
      });
      setMealStep("result");
    } catch (error) {
      const message = parseApiError(error);
      if (message.toLowerCase().includes("expir")) {
        setMealAnalysisId(null);
        setMealAnalysisExpiresAt(null);
      }
      showAlert("Estimación", message);
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
      showAlert("Estimación", "Añade una foto antes de guardar.");
      return;
    }
    const resolvedPlateWeight = resolveMealPlateWeightNote();
    if (resolvedPlateWeight === null) {
      showAlert("Estimación", "El peso del plato debe ser un número válido en gramos.");
      return;
    }
    const quantityNote = resolvedPlateWeight || undefined;
    setSaving(true);
    try {
      const overrides = resolveMealEditedMacros();
      if (!overrides) {
        showAlert("Estimación", "Revisa los valores de kcal, proteína, grasas y carbohidratos.");
        return;
      }
      const response = await auth.mealPhotoEstimate({
        description: mealDescription.trim() || undefined,
        answers: mealQuestionAnswers,
        quantityNote,
        analysisId: mealAnalysisId ?? undefined,
        photos: mealAnalysisId ? [] : mealPhotos,
        commit: true,
        locale: language,
        overrides,
      });
      if (!response.saved || !response.intake) {
        showAlert("Estimación", "No se pudo guardar. Revisa las preguntas sugeridas.");
        return;
      }
      setToastFeedback({ kind: "success", message: "Consumo guardado correctamente." });
      resetToHub();
      props.onIntakeSaved();
    } catch (error) {
      const message = parseApiError(error);
      if (message.toLowerCase().includes("expir")) {
        setMealAnalysisId(null);
        setMealAnalysisExpiresAt(null);
      }
      setToastFeedback({ kind: "error", message });
    } finally {
      setSaving(false);
    }
  };

  const buildManualCorrectionLabelText = (): string | null => {
    const parseNonNegative = (raw: string): number | null => {
      const value = Number(raw.trim().replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        return null;
      }
      return value;
    };

    const kcal = parseNonNegative(labelFixKcal);
    const protein = parseNonNegative(labelFixProtein);
    const fat = parseNonNegative(labelFixFat);
    const carbs = parseNonNegative(labelFixCarbs);

    if (kcal === null || protein === null || fat === null || carbs === null) {
      showAlert("Corrección", "Introduce valores válidos de kcal, proteína, grasas y carbohidratos.");
      return null;
    }

    return `Por 100 g Energía ${kcal} kcal Proteínas ${protein} g Grasas ${fat} g Carbohidratos ${carbs} g`;
  };

  const createFromLabel = async () => {
    if (mode !== "label_fix" && !labelName.trim()) {
      showAlert("Producto", "Indica nombre del producto.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "label_fix") {
        if (!product?.id) {
          showAlert("Corrección", "Primero selecciona un producto escaneado para corregir.");
          return;
        }
        const manualLabelText = buildManualCorrectionLabelText();
        if (!manualLabelText) {
          return;
        }

        const correction = await auth.correctProductFromLabel({
          productId: product.id,
          name: product.name,
          brand: product.brand ?? "",
          labelText: manualLabelText,
          photos: [],
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
        showAlert("Etiqueta", questions);
        setLabelQuestions(notes);
        return;
      }

      setProduct(response.product);
      setQuantityBackTarget("barcode_camera");
      prefillFromPreference(response.product, preferredServing);
      setMode("barcode");
      setPhase("quantity");
    } catch (error) {
      showAlert("Etiqueta", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmCorrection = async () => {
    if (mode !== "label_fix") {
      return;
    }
    if (!product?.id) {
      showAlert("Corrección", "Primero selecciona un producto escaneado para corregir.");
      return;
    }
    const manualLabelText = buildManualCorrectionLabelText();
    if (!manualLabelText) {
      return;
    }

    setSaving(true);
    try {
      const response = await auth.correctProductFromLabel({
        productId: product.id,
        name: product.name,
        brand: product.brand ?? "",
        labelText: manualLabelText,
        photos: [],
        confirmUpdate: true,
      });
      setCorrectionPreview(response);
      if (!response.updated) {
        showAlert("Corrección", response.message);
        return;
      }
      setProduct(response.product);
      prefillFromPreference(response.product, preferredServing);
      setMode("barcode");
      setPhase("quantity");
      showAlert("Corrección", "Producto actualizado con datos verificados.");
    } catch (error) {
      showAlert("Corrección", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const searchManualFoods = useCallback(
    async (queryOverride?: string, options?: { silent?: boolean; force?: boolean }) => {
      const query = (queryOverride ?? manualSearch).trim();
      if (query.length < 2) {
        if (!options?.silent) {
          showAlert("Buscar", "Escribe al menos 2 caracteres.");
        }
        return;
      }

      if (!options?.force && query === lastManualSearchQueryRef.current) {
        return;
      }

      if (searchingFoods && manualSearchInFlightQueryRef.current === query) {
        return;
      }

      const requestId = manualSearchRequestIdRef.current + 1;
      manualSearchRequestIdRef.current = requestId;
      manualSearchAbortControllerRef.current?.abort();
      const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
      manualSearchAbortControllerRef.current = abortController;
      manualSearchInFlightQueryRef.current = query;
      setManualHasSearched(true);
      setSearchingFoods(true);
      try {
        const response = await auth.searchFoods(query, 20, abortController?.signal);
        if (manualSearchRequestIdRef.current !== requestId) {
          return;
        }
        lastManualSearchQueryRef.current = query;
        setManualResults(response.results);
      } catch (error) {
        if (manualSearchRequestIdRef.current !== requestId) {
          return;
        }
        if (isAbortRequestError(error)) {
          return;
        }
        if (!options?.silent) {
          showAlert("Buscar", parseApiError(error));
        }
      } finally {
        if (manualSearchRequestIdRef.current === requestId) {
          if (manualSearchAbortControllerRef.current === abortController) {
            manualSearchAbortControllerRef.current = null;
            manualSearchInFlightQueryRef.current = "";
          }
          setSearchingFoods(false);
        }
      }
    },
    [auth, manualSearch, searchingFoods],
  );

  const selectManualResult = async (item: FoodSearchItem) => {
    setShowScannedProductImage(false);
    if (item.origin === "openfoodfacts_remote" && item.product.barcode) {
      setSearchingFoods(true);
      try {
        const lookup = await auth.lookupByBarcode(item.product.barcode);
        if (lookup.product) {
          setQuantityBackTarget("manual");
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
        setQuantityBackTarget("manual");
        setBarcode(item.product.barcode);
        setLabelName(item.product.name);
        setLabelBrand(item.product.brand ?? "");
        setLabelQuestions([
          lookup.message ?? "No hay nutrición suficiente para este barcode.",
          ...lookup.missing_fields.map((field) => tx("Falta {{field}}", { field })),
        ]);
        setMode("barcode");
        setPhase("label");
        return;
      } catch (error) {
        showAlert("Buscar", parseApiError(error));
        return;
      } finally {
        setSearchingFoods(false);
      }
    }

    openProductInQuantity(item.product, "manual");
  };

  const selectFavoriteProduct = (favorite: FavoriteProduct) => {
    openProductInQuantity(favorite.product, "hub");
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
      lastHubDataRefreshRef.current = 0;
    } catch (error) {
      showAlert("Favoritos", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveManualProduct = async () => {
    const kcal = Number(manualKcal);
    const protein = Number(manualProtein);
    const fat = Number(manualFat);
    const carbs = Number(manualCarbs);
    const trimmedName = manualName.trim();

    if (!trimmedName) {
      showAlert("Manual", "El nombre es obligatorio.");
      return;
    }
    if (trimmedName.length < 2) {
      showAlert("Manual", "El nombre debe tener al menos 2 caracteres.");
      return;
    }
    if (![kcal, protein, fat, carbs].every((value) => Number.isFinite(value) && value >= 0)) {
      showAlert("Manual", "Completa macros válidos por 100 g.");
      return;
    }

    setSaving(true);
    try {
      const response = await auth.createCommunityFood({
        name: trimmedName,
        nutrition_basis: "per_100g",
        kcal,
        protein_g: protein,
        fat_g: fat,
        carbs_g: carbs,
      });
      setProduct(response);
      setShowScannedProductImage(false);
      setPreferredServing(null);
      setQuantityBackTarget("manual");
      setMode("barcode");
      setPhase("quantity");
      setMethod("grams");
      setGrams(100);
      lastHubDataRefreshRef.current = 0;
      lastRecipesRefreshRef.current = 0;
      showAlert("Manual", "Producto compartido en la base comunitaria.");
    } catch (error) {
      showAlert("Manual", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase();
    if (!query) {
      return myRecipes;
    }
    return myRecipes.filter((recipe) => {
      const haystack = [
        recipe.title,
        recipeMealTypeLabel(recipe.meal_type),
        recipe.tags.join(" "),
        recipe.ingredients.map((item) => item.name).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [myRecipes, recipeSearch]);

  const recipeAiDesktopLayout = Platform.OS === "web" && width >= 1180;
  const recipeAiStickyCardStyle = useMemo(
    () =>
      Platform.OS === "web"
        ? ({ position: "sticky", top: WEB_CHROME_TOTAL_HEIGHT + 18 } as unknown as ViewStyle)
        : undefined,
    [],
  );
  const recipeAiFilledIngredientCount = useMemo(
    () => recipeAiIngredientRows.filter((row) => row.name.trim()).length,
    [recipeAiIngredientRows],
  );
  const recipeAiHasAnyIngredientData = useMemo(
    () => recipeAiIngredientRows.some((row) => row.name.trim() || row.quantity.trim() || row.unit.trim()),
    [recipeAiIngredientRows],
  );
  const recipeAiRestrictionSummary = useMemo(() => {
    const items: string[] = [];
    items.push(recipeAiOnlyIngredients ? "Solo usa lo listado" : "Puede proponer extras");
    if (recipeAiPantryBasics) {
      items.push("Básicos permitidos");
    }
    if (recipeAiAllergiesInput.trim()) {
      items.push("Alergias definidas");
    }
    if (recipeAiPreferencesInput.trim()) {
      items.push("Preferencias activas");
    }
    return items;
  }, [recipeAiAllergiesInput, recipeAiOnlyIngredients, recipeAiPantryBasics, recipeAiPreferencesInput]);

  useEffect(() => {
    if (!recipeAiAutoFocusIngredientKey) {
      return;
    }
    const timer = setTimeout(() => setRecipeAiAutoFocusIngredientKey(null), 350);
    return () => clearTimeout(timer);
  }, [recipeAiAutoFocusIngredientKey]);

  const appendRecipeAiIngredientRow = useCallback(() => {
    const nextKey = createLocalDraftKey("ai-ingredient");
    setRecipeAiIngredientRows((current) => [...current, { key: nextKey, name: "", quantity: "", unit: "" }]);
    setRecipeAiAutoFocusIngredientKey(nextKey);
  }, []);

  const buildRecipePayloadFromEditor = useCallback((): UserRecipePayload | null => {
    const title = recipeTitle.trim();
    const servings = Number(recipeServings.trim().replace(",", "."));
    const prepTime = recipePrepTime.trim() ? Number(recipePrepTime.trim().replace(",", ".")) : null;
    const kcal = Number(recipeKcal.trim().replace(",", "."));
    const protein = Number(recipeProtein.trim().replace(",", "."));
    const carbs = Number(recipeCarbs.trim().replace(",", "."));
    const fat = Number(recipeFat.trim().replace(",", "."));
    const ingredients = recipeIngredientRows
      .map((item) => ({
        name: item.name.trim(),
        quantity: item.quantity.trim() ? toOptionalNumber(item.quantity) : null,
        unit: item.unit.trim() || null,
      }))
      .filter((item) => item.name);
    const steps = recipeStepRows.map((item) => item.value.trim()).filter(Boolean);
    const tags = recipeTagsInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!title) {
      showAlert("Crear recetas", "El título es obligatorio.");
      return null;
    }
    if (!Number.isFinite(servings) || servings < 1) {
      showAlert("Crear recetas", "Las raciones deben ser un número válido.");
      return null;
    }
    if (prepTime != null && (!Number.isFinite(prepTime) || prepTime < 0)) {
      showAlert("Crear recetas", "El tiempo estimado no tiene buena pinta.");
      return null;
    }
    if (!ingredients.length) {
      showAlert("Crear recetas", "Añade al menos un ingrediente.");
      return null;
    }
    if (!steps.length) {
      showAlert("Crear recetas", "Añade al menos un paso.");
      return null;
    }
    if (![kcal, protein, carbs, fat].every((value) => Number.isFinite(value) && value >= 0)) {
      showAlert("Crear recetas", "Completa kcal, proteína, hidratos y grasas para poder guardarla.");
      return null;
    }

    return {
      title,
      meal_type: recipeMealType,
      servings: Math.round(servings),
      prep_time_min: prepTime == null ? null : Math.round(prepTime),
      ingredients,
      steps,
      tags,
      nutrition_kcal: kcal,
      nutrition_protein_g: protein,
      nutrition_carbs_g: carbs,
      nutrition_fat_g: fat,
    };
  }, [
    recipeCarbs,
    recipeFat,
    recipeIngredientRows,
    recipeKcal,
    recipeMealType,
    recipePrepTime,
    recipeProtein,
    recipeServings,
    recipeStepRows,
    recipeTagsInput,
    recipeTitle,
  ]);

  const saveRecipeDraft = async () => {
    const payload = buildRecipePayloadFromEditor();
    if (!payload) {
      return;
    }
    const payloadWithDefault =
      recipeManualBackStage === "ai_result"
        ? { ...payload, default_quantity_units: payload.servings }
        : selectedRecipe?.id === recipeDraftId && selectedRecipe.preferred_serving?.method === "units"
          ? { ...payload, default_quantity_units: selectedRecipe.preferred_serving.quantity_units ?? payload.servings }
          : payload;

    setSaving(true);
    try {
      const response = recipeDraftId
        ? await auth.updateRecipe(recipeDraftId, payloadWithDefault)
        : await auth.createRecipe(payloadWithDefault);
      setSelectedRecipe(response);
      setRecipesStage("detail");
      lastRecipesRefreshRef.current = 0;
      await loadMyRecipes();
      showAlert("Crear recetas", recipeDraftId ? "Receta actualizada." : "Receta guardada.");
    } catch (error) {
      showAlert("Crear recetas", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const runRecipeGenerator = async () => {
    if (recipeAiKeyConfigured === false) {
      showAlert("IA", "Configura tu API key de OpenAI en Ajustes > IA para generar recetas.");
      return;
    }

    const availableIngredients = recipeAiIngredientRows
      .map((item) => ({
        name: item.name.trim(),
        quantity: item.quantity.trim() ? toOptionalNumber(item.quantity) : null,
        unit: item.unit.trim() || null,
      }))
      .filter((item) => item.name);

    if (!availableIngredients.length) {
      showAlert("Crear recetas", "Añade al menos un ingrediente disponible.");
      return;
    }

    setSaving(true);
    setRecipeAiOptions([]);
    setRecipeAiGenerationId(null);
    setRecipeAiSelectedOption(null);
    setRecipeAiResult(null);
    setRecipesStage("ai_options");
    try {
      const response = await auth.generateRecipeOptions({
        meal_type: recipeAiMealType,
        target_kcal: toOptionalNumber(recipeAiTargetKcal) ?? undefined,
        target_protein_g: toOptionalNumber(recipeAiTargetProtein) ?? undefined,
        target_fat_g: toOptionalNumber(recipeAiTargetFat) ?? undefined,
        target_carbs_g: toOptionalNumber(recipeAiTargetCarbs) ?? undefined,
        goal_mode: recipeAiGoalMode,
        use_only_ingredients: recipeAiOnlyIngredients,
        allergies: recipeAiAllergiesInput
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        preferences: recipeAiPreferencesInput
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        available_ingredients: availableIngredients,
        allow_basic_pantry: recipeAiPantryBasics,
        locale: language,
      });
      setRecipeAiGenerationId(response.generation_id);
      setRecipeAiOptions(response.options);
      setRecipesStage("ai_options");
    } catch (error) {
      setRecipesStage("ai_input");
      showAlert("Crear recetas", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openRecipeAiDetail = useCallback(
    async (option: RecipeAiOptionPreview) => {
      if (!recipeAiGenerationId) {
        showAlert("Crear recetas", "La generación actual ya no está disponible. Vuelve a generar opciones.");
        return;
      }
      setSaving(true);
      setRecipeAiSelectedOption(option);
      setRecipeAiResult(null);
      setRecipesStage("ai_result");
      try {
        const response = await auth.fetchRecipeAiDetail({
          generation_id: recipeAiGenerationId,
          option_id: option.option_id,
        });
        setRecipeAiResult(response);
        setRecipesStage("ai_result");
      } catch (error) {
        setRecipesStage("ai_options");
        showAlert("Crear recetas", parseApiError(error));
      } finally {
        setSaving(false);
      }
    },
    [auth.fetchRecipeAiDetail, recipeAiGenerationId],
  );

  const editSelectedRecipe = useCallback(
    (recipe: UserRecipe) => {
      populateRecipeEditor(
        {
          title: recipe.title,
          meal_type: recipe.meal_type,
          servings: recipe.servings,
          prep_time_min: recipe.prep_time_min,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          tags: recipe.tags,
          nutrition_kcal: recipe.nutrition_kcal,
          nutrition_protein_g: recipe.nutrition_protein_g,
          nutrition_carbs_g: recipe.nutrition_carbs_g,
          nutrition_fat_g: recipe.nutrition_fat_g,
        },
        {
          id: recipe.id,
          backStage: "detail",
          coachFeedback: recipe.coach_feedback,
          assumptions: recipe.assumptions,
          suggestedExtras: recipe.suggested_extras,
        },
      );
      setRecipesStage("manual");
    },
    [populateRecipeEditor],
  );

  const editRecipeFromAiResult = useCallback(() => {
    if (!recipeAiResult) {
      return;
    }
    populateRecipeEditor(recipeAiResult.recipe, {
      backStage: "ai_result",
      coachFeedback: recipeAiResult.feedback.summary,
      assumptions: recipeAiResult.assumptions,
      suggestedExtras: recipeAiResult.feedback.suggested_extras,
    });
    setRecipesStage("manual");
  }, [populateRecipeEditor, recipeAiResult]);

  const saveRecipeFromAiResult = async () => {
    if (!recipeAiResult) {
      return;
    }
    const generatedPayload = {
      ...recipeAiResult.recipe,
      default_quantity_units: recipeAiResult.recipe.servings,
    };
    setSaving(true);
    try {
      const response = await auth.createRecipe(generatedPayload);
      setSelectedRecipe(response);
      setRecipesStage("detail");
      lastRecipesRefreshRef.current = 0;
      await loadMyRecipes();
      showAlert("Crear recetas", "Receta IA guardada.");
    } catch (error) {
      showAlert("Crear recetas", parseApiError(error));
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

      showAlert("Consumo", "Consumo guardado correctamente.");
      lastHubDataRefreshRef.current = 0;
      resetToHub();
      props.onIntakeSaved();
    } catch (error) {
      showAlert("Consumo", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveWithPreferredQuantity = async () => {
    if (!product || !preferredServing) {
      showAlert("Cantidad", "No hay una cantidad previa guardada para este producto.");
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
      showAlert("Consumo", "Guardado con la última cantidad usada.");
      lastHubDataRefreshRef.current = 0;
      resetToHub();
      props.onIntakeSaved();
    } catch (error) {
      showAlert("Consumo", parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openCorrectionFromProduct = () => {
    if (!product) {
      return;
    }
    const formatMacro = (value: number): string => {
      const rounded = Math.round(value * 10) / 10;
      return Number.isInteger(rounded) ? `${rounded}` : rounded.toString();
    };

    setMode("label_fix");
    setPhase("label");
    setBarcode(product.barcode ?? "");
    setLabelName(product.name);
    setLabelBrand(product.brand ?? "");
    setLabelText("");
    setLabelFixKcal(formatMacro(product.kcal));
    setLabelFixProtein(formatMacro(product.protein_g));
    setLabelFixFat(formatMacro(product.fat_g));
    setLabelFixCarbs(formatMacro(product.carbs_g));
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
    const now = Date.now();
    if (now - lastHubDataRefreshRef.current < 20_000) {
      return;
    }
    lastHubDataRefreshRef.current = now;
    void loadRecentProducts();
  }, [loadRecentProducts, mode]);

  useEffect(() => {
    if (mode !== "manual") {
      manualSearchAbortControllerRef.current?.abort();
      manualSearchAbortControllerRef.current = null;
      manualSearchInFlightQueryRef.current = "";
      setSearchingFoods(false);
      return;
    }
    const query = manualSearch.trim();
    if (manualSearchInFlightQueryRef.current && manualSearchInFlightQueryRef.current !== query) {
      manualSearchAbortControllerRef.current?.abort();
      manualSearchAbortControllerRef.current = null;
      manualSearchInFlightQueryRef.current = "";
      setSearchingFoods(false);
    }
    if (query.length < 2) {
      manualSearchRequestIdRef.current += 1;
      manualSearchAbortControllerRef.current?.abort();
      manualSearchAbortControllerRef.current = null;
      manualSearchInFlightQueryRef.current = "";
      setSearchingFoods(false);
      if (!query) {
        setManualResults([]);
        setManualHasSearched(false);
        lastManualSearchQueryRef.current = "";
      }
      return;
    }

    const timer = setTimeout(() => {
      void searchManualFoods(query, { silent: true });
    }, 320);

    return () => clearTimeout(timer);
  }, [manualSearch, mode, searchManualFoods]);

  useEffect(() => {
    return () => {
      manualSearchAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (mode !== "recipes") {
      return;
    }
    const now = Date.now();
    if (now - lastRecipesRefreshRef.current < 30_000) {
      return;
    }
    lastRecipesRefreshRef.current = now;
    void loadMyRecipes();
  }, [loadMyRecipes, mode]);

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
    setUseDefaultSummary100g(true);
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
  }, [auth.fetchProductDataQuality, mode, phase, product]);

  const handleQuantityMethodChange = useCallback((nextMethod: IntakeMethod) => {
    setUseDefaultSummary100g(false);
    setMethod(nextMethod);
  }, []);

  const renderSearchResultStatus = useCallback((item: FoodSearchItem) => {
    if (item.badge === "Verificado") {
      return (
        <View style={styles.searchVerifiedIconWrap}>
          <VerifiedTickIcon />
        </View>
      );
    }

    if (item.badge === "Comunidad") {
      return <TagChip label="Comunidad" tone="default" />;
    }

    if (item.badge === "Estimado") {
      return <TagChip label="Estimado" tone="warning" />;
    }

    return null;
  }, []);

  const goBackInAdd = useCallback(() => {
    if (saving || processing) {
      return;
    }

    if (mode === "hub") {
      return;
    }

    if (mode === "label_fix") {
      setMode("barcode");
      setPhase("quantity");
      setCorrectionPreview(null);
      setLabelQuestions([]);
      return;
    }

    if (mode === "meal_photo") {
      if (mealStep === "result") {
        setMealStep("questions");
        return;
      }
      if (mealStep === "questions") {
        setMealStep("compose");
        return;
      }
      resetToHub();
      return;
    }

    if (mode === "manual") {
      if (showManualCreateForm) {
        setShowManualCreateForm(false);
        return;
      }
      resetToHub();
      return;
    }

    if (mode === "recipes") {
      if (recipesStage === "manual") {
        setRecipesStage(recipeManualBackStage);
        return;
      }
      if (recipesStage === "ai_result") {
        setRecipesStage(recipeAiOptions.length ? "ai_options" : "ai_input");
        return;
      }
      if (recipesStage === "ai_options") {
        setRecipesStage("ai_input");
        return;
      }
      if (recipesStage === "detail" || recipesStage === "ai_input") {
        setRecipesStage("chooser");
        return;
      }
      resetToHub();
      return;
    }

    if (mode === "barcode") {
      if (phase === "camera") {
        resetToHub();
        return;
      }

      if (phase === "label") {
        if (quantityBackTarget === "manual") {
          setMode("manual");
          return;
        }
        if (quantityBackTarget === "recipes") {
          setMode("recipes");
          return;
        }
        setPhase("camera");
        setScanLocked(false);
        setProcessing(false);
        setScanSuccessFlash(false);
        return;
      }

      if (phase === "quantity") {
        setShowScannedProductImage(false);
        setProductQuality(null);
        setProduct(null);
        setPreferredServing(null);
        if (quantityBackTarget === "manual") {
          setMode("manual");
          return;
        }
        if (quantityBackTarget === "recipes") {
          setMode("recipes");
          return;
        }
        if (quantityBackTarget === "barcode_camera") {
          setPhase("camera");
          setScanLocked(false);
          setProcessing(false);
          setScanSuccessFlash(false);
          return;
        }
        resetToHub();
      }
    }
  }, [
    mealStep,
    mode,
    phase,
    processing,
    quantityBackTarget,
    recipeAiOptions.length,
    recipeManualBackStage,
    recipesStage,
    resetToHub,
    saving,
    showManualCreateForm,
  ]);

  const subtitle =
    mode === "hub"
      ? "Escáner, recetas, foto de comida o carga manual"
      : mode === "barcode"
        ? "Escáner de código de barras"
        : mode === "label_fix"
          ? "Corregir o añadir datos nutricionales por etiqueta"
          : mode === "meal_photo"
            ? "Estimación guiada de plato por foto + descripción"
            : mode === "recipes"
            ? "Crear, guardar y reutilizar recetas propias"
            : "Búsqueda manual por nombre o marca";
  const isQuantityScreen = mode === "barcode" && phase === "quantity" && !!product;
  const addHeaderTitle = isQuantityScreen ? "Añadir alimento" : "Añadir";
  const addHeaderSubtitle = isQuantityScreen ? "" : subtitle;
  const scanCameraToPanel = useCallback(() => {
    resetToHub();
    props.onBackToPanel();
  }, [props, resetToHub]);

  const showLabelForm = mode === "label_fix" || (mode === "barcode" && phase === "label");
  const mealPrecision = mealPreview ? mealPrecisionMeta(mealPreview.confidence_level, language) : null;
  const unknownAnswerLabel = language === "en" ? "I don't know" : "No sé";
  const mealResultSummary = useMemo(() => {
    if (!mealPreview) {
      return null;
    }
    const fallback = mealPreview.preview_nutrients;
    return {
      kcal: parseMealMacroInput(mealEditable.kcal) ?? fallback.kcal,
      protein_g: parseMealMacroInput(mealEditable.protein_g) ?? fallback.protein_g,
      fat_g: parseMealMacroInput(mealEditable.fat_g) ?? fallback.fat_g,
      carbs_g: parseMealMacroInput(mealEditable.carbs_g) ?? fallback.carbs_g,
    };
  }, [mealEditable, mealPreview, parseMealMacroInput]);
  const mealSourceSheetTranslate = mealSourceSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });
  const mealSourceSheetScale = mealSourceSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const mealSourceSheetBackdropOpacity = mealSourceSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.scanContainer, webScanStyle]}>
        <AppHeader
          title={addHeaderTitle}
          subtitle={addHeaderSubtitle}
          onBack={
            mode === "barcode" && phase === "camera"
              ? scanCameraToPanel
              : mode === "meal_photo" && mealStep === "questions"
                ? removeMealPhoto
                : undefined
          }
          rightActionLabel={isQuantityScreen ? "Regístralo" : undefined}
          onRightAction={isQuantityScreen ? () => void saveIntake() : undefined}
          rightActionDisabled={isQuantityScreen ? saving : undefined}
        />

        {mode === "hub" ? (
          <ScrollView contentContainerStyle={styles.addHubPane}>
            <AddActionCard
              title="Escanear código de barras"
              subtitle="Busca en BD/OpenFoodFacts y registra cantidad"
              onPress={() => void startBarcodeFlow()}
            />
            <AddActionCard
              title="Crear recetas"
              subtitle="Usa una existente o crea una nueva manual/IA"
              onPress={startRecipesFlow}
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

        {mode === "barcode" && phase === "camera" && props.isActive ? (
          <View style={styles.scanCameraWrap}>
            {hasCamera ? (
              <>
                <CameraView
                  style={styles.cameraView}
                  facing={Platform.OS === "web" ? "front" : "back"}
                  onBarcodeScanned={scanLocked ? undefined : handleScan}
                  barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
                />

                <View pointerEvents="none" style={styles.scanOverlay}>
                  <Animated.View
                    style={[
                      styles.scanFrame,
                      webScanFrameResponsiveStyle,
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
                  <Text style={styles.scanHint}>
                    {Platform.OS === "web"
                      ? "Guía visual: detecta códigos en toda la cámara"
                      : "Centra el código de barras"}
                  </Text>
                  {scanSuccessFlash ? (
                    <View style={styles.scanSuccessBadge}>
                      <Text style={styles.scanSuccessBadgeText}>OK</Text>
                    </View>
                  ) : null}
                </View>

                {Platform.OS === "web" ? (
                  <View style={styles.webScanToolsRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.webScanToolChip,
                        pressed && !processing && styles.webScanToolChipPressed,
                        processing && styles.disabledButton,
                      ]}
                      onPress={() => void scanBarcodeFromImage()}
                      disabled={processing}
                    >
                      <Text style={styles.webScanToolChipText}>Capturar y escanear</Text>
                    </Pressable>
                  </View>
                ) : null}

                {processing ? (
                  <View style={styles.scanBusyOverlay}>
                    <ActivityIndicator color={theme.accent} size="large" />
                    <Text style={styles.helperText}>Buscando producto...</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.helperText}>
                  {Platform.OS === "web" ? "Cámara no disponible en este navegador." : "Permiso de cámara pendiente."}
                </Text>
                <SecondaryButton title="Conceder permiso" onPress={() => void requestCameraAndUnlock()} />
                {Platform.OS === "web" ? (
                  <View style={styles.webBarcodeFallbackCard}>
                    <InputField
                      label="EAN/UPC"
                      value={barcode}
                      onChangeText={setBarcode}
                      keyboardType="numeric"
                      placeholder="Ej: 8410188014561"
                    />
                    <PrimaryButton title="Buscar código" onPress={() => void lookupBarcodeFallback()} loading={processing} />
                    <SecondaryButton title="Capturar y escanear" onPress={() => void scanBarcodeFromImage()} disabled={processing} />
                  </View>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        {showLabelForm ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {mode === "label_fix" ? "Corregir valores manualmente" : "Producto no encontrado o incompleto"}
              </Text>

              {mode === "label_fix" ? (
                <>
                  <Text style={styles.helperText}>Producto seleccionado (no editable):</Text>
                  <ReadOnlyField label="Barcode" value={barcode || "Sin barcode"} />
                  <ReadOnlyField label="Nombre" value={labelName || "Sin nombre"} />
                  <ReadOnlyField label="Marca" value={labelBrand || "Sin marca"} />
                  <Text style={styles.helperText}>Introduce solo valores por 100 g:</Text>
                  <InputField
                    label="kcal"
                    value={labelFixKcal}
                    onChangeText={(value) => {
                      setLabelFixKcal(value);
                      setCorrectionPreview(null);
                    }}
                    keyboardType="numeric"
                  />
                  <InputField
                    label="Proteína (g)"
                    value={labelFixProtein}
                    onChangeText={(value) => {
                      setLabelFixProtein(value);
                      setCorrectionPreview(null);
                    }}
                    keyboardType="numeric"
                  />
                  <InputField
                    label="Grasas (g)"
                    value={labelFixFat}
                    onChangeText={(value) => {
                      setLabelFixFat(value);
                      setCorrectionPreview(null);
                    }}
                    keyboardType="numeric"
                  />
                  <InputField
                    label="Carbohidratos (g)"
                    value={labelFixCarbs}
                    onChangeText={(value) => {
                      setLabelFixCarbs(value);
                      setCorrectionPreview(null);
                    }}
                    keyboardType="numeric"
                  />
                </>
              ) : (
                <>
                  <InputField
                    label="Barcode"
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
                </>
              )}

              {labelQuestions.map((question) => (
                <Text key={question} style={styles.helperText}>
                  - {question}
                </Text>
              ))}

              {mode !== "label_fix" ? (
                <>
                  <SecondaryButton title="Tomar foto de etiqueta" onPress={() => void captureLabelPhoto()} />
                  <Text style={styles.helperText}>{labelPhotos.length} foto(s) adjuntas</Text>
                </>
              ) : null}

              <PrimaryButton
                title={mode === "label_fix" ? "Analizar corrección" : "Crear producto"}
                onPress={() => void createFromLabel()}
                loading={saving}
              />
              {mode === "label_fix" && correctionPreview ? (
                <AppCard style={styles.previewCard}>
                  <SectionHeader title="Comparación" subtitle={correctionPreview.message} />
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
            </View>
          </ScrollView>
        ) : null}

        {mode === "meal_photo" ? (
          <>
            {mealStep === "compose" ? (
              <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Analizar comida con IA</Text>
                  <Text style={styles.helperText}>1) Añade hasta 3 fotos 2) responde preguntas 3) revisa la estimación.</Text>
                  {mealPhotos.length > 0 ? (
                    <Pressable
                      onPress={openMealSourceSheet}
                      style={({ pressed }) => [styles.mealPhotoPreviewWrap, pressed && styles.mealPhotoPressablePressed]}
                    >
                      <Image source={{ uri: mealPhotos[0] }} style={styles.mealPhotoPreviewImage} resizeMode="contain" />
                      <View style={styles.mealPhotoCountBadge}>
                        <Text style={styles.mealPhotoCountBadgeText}>
                          {mealPhotos.length}/{MAX_MEAL_PHOTOS}
                        </Text>
                      </View>
                      {mealPhotos.length > 1 ? (
                        <View style={styles.mealPhotoThumbStrip}>
                          {mealPhotos.map((uri, index) => (
                            <Image
                              key={`${uri}-${index}`}
                              source={{ uri }}
                              style={[styles.mealPhotoThumb, index === 0 && styles.mealPhotoThumbPrimary]}
                              resizeMode="cover"
                            />
                          ))}
                        </View>
                      ) : null}
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={openMealSourceSheet}
                      style={({ pressed }) => [styles.mealPhotoGuideCard, pressed && styles.mealPhotoPressablePressed]}
                    >
                      <View style={styles.mealPhotoGuideIconWrap}>
                        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                          <Rect x={3} y={6} width={18} height={13} rx={3} stroke={theme.accent} strokeWidth={1.9} />
                          <Circle cx={12} cy={12.5} r={3.2} stroke={theme.accent} strokeWidth={1.9} />
                          <Rect x={7.2} y={4.2} width={3.8} height={2.5} rx={1} fill={theme.accent} />
                        </Svg>
                      </View>
                      <Text style={styles.mealPhotoGuideTitle}>Añade una foto del plato</Text>
                      <Text style={styles.mealPhotoGuideText}>
                        Mejor precisión con buena luz y el plato completo visible.
                      </Text>
                    </Pressable>
                  )}
                  {mealPhotos.length > 0 ? (
                    <SecondaryButton
                      title={mealPhotos.length > 1 ? "Eliminar fotos" : "Eliminar foto"}
                      onPress={removeMealPhoto}
                    />
                  ) : null}
                  <InputField
                    label="Descripción (opcional)"
                    value={mealDescription}
                    onChangeText={(value) => {
                      setMealDescription(value);
                      setMealPreview(null);
                    }}
                    placeholder="Describe la comida (ej: arroz con pollo y mayonesa)"
                  />
                  <InputField
                    label="Peso total del plato (g, opcional)"
                    value={mealPlateWeight}
                    onChangeText={(value) => {
                      setMealPlateWeight(value);
                      setMealPreview(null);
                    }}
                    keyboardType="numeric"
                    placeholder="Ej: 420"
                  />
                  <Text style={styles.helperText}>Una breve descripción mejora la precisión.</Text>
                  <Pressable
                    onPress={() => void runMealQuestions()}
                    disabled={saving || mealPhotos.length === 0}
                    style={[styles.primaryButton, (saving || mealPhotos.length === 0) && styles.disabledButton]}
                  >
                    {saving && mealQuestionPhase ? (
                      <View style={styles.mealQuestionProgressButtonContent}>
                        <View style={styles.mealQuestionProgressRingWrap}>
                          <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
                            <Circle cx={17} cy={17} r={14.5} stroke={theme.panel} strokeWidth={3.2} />
                            <Circle
                              cx={17}
                              cy={17}
                              r={14.5}
                              stroke={theme.bg}
                              strokeWidth={3.2}
                              strokeLinecap="round"
                              strokeDasharray={91.11}
                              strokeDashoffset={91.11 * (1 - Math.max(0, Math.min(100, mealQuestionProgress)) / 100)}
                              transform="rotate(-90 17 17)"
                            />
                          </Svg>
                          <Text style={styles.mealQuestionProgressPercent}>{Math.round(mealQuestionProgress)}%</Text>
                        </View>
                        <Text style={styles.primaryButtonText}>Generando</Text>
                      </View>
                    ) : (
                      <Text style={styles.primaryButtonText}>Generar preguntas</Text>
                    )}
                  </Pressable>
                  {saving && mealQuestionPhase ? <Text style={styles.mealQuestionProgressPhase}>{mealQuestionPhase}</Text> : null}
                </View>
              </ScrollView>
            ) : null}

            {mealStep === "questions" ? (
              <View style={styles.mealQuestionScreen}>
                <ScrollView contentContainerStyle={styles.mealQuestionContent} keyboardShouldPersistTaps="handled">
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>{tx("Ayúdame a afinar la estimación")}</Text>
                    <Text style={styles.helperText}>{tx("Responde 2-3 preguntas para mejorar la precisión.")}</Text>
                  </View>
                  {mealQuestions.map((question) => (
                    <View key={question.id} style={styles.mealQuestionCard}>
                      <Text style={styles.mealQuestionPrompt}>{question.prompt}</Text>
                      {question.answer_type === "single_choice" ? (
                        <View style={styles.methodRow}>
                          {(question.options.some((option) => isUnknownAnswer(option))
                            ? question.options
                            : [...question.options, unknownAnswerLabel]
                          ).map((option, index) => {
                            const active =
                              normalizeAnswerToken(mealQuestionAnswers[question.id] ?? "") === normalizeAnswerToken(option);
                            return (
                              <Pressable
                                key={`${question.id}-${option}-${index}`}
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
                          placeholder={question.placeholder ?? tx("Respuesta")}
                          placeholderTextColor={theme.placeholder}
                        />
                      )}
                      {question.answer_type !== "single_choice" ? (
                        <View style={styles.methodRow}>
                          <Pressable
                            style={[
                              styles.methodChip,
                              isUnknownAnswer(mealQuestionAnswers[question.id] ?? "") && styles.methodChipActive,
                            ]}
                            onPress={() =>
                              setMealQuestionAnswers((current) => ({
                                ...current,
                                [question.id]: unknownAnswerLabel,
                              }))
                            }
                          >
                            <Text
                              style={[
                                styles.methodChipText,
                                isUnknownAnswer(mealQuestionAnswers[question.id] ?? "") && styles.methodChipTextActive,
                              ]}
                            >
                              {unknownAnswerLabel}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                  {mealIngredients.length > 0 ? (
                    <Text style={styles.helperText}>{tx("Detectado: {{ingredients}}", { ingredients: mealIngredients.join(", ") })}</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.bottomActionBar}>
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
                  <Text style={styles.sectionTitle}>{tx("Estimación nutricional")}</Text>
                  {mealPrecision ? (
                    <View style={styles.mealPrecisionCard}>
                      <View style={styles.mealPrecisionHeader}>
                        <Text style={styles.mealPrecisionLabel}>{tx("Precisión estimada")}</Text>
                        <TagChip label={mealPrecision.label} tone={mealPrecision.tone} />
                      </View>
                      <View style={styles.mealPrecisionValueRow}>
                        <Text style={[styles.mealPrecisionValue, { color: mealPrecision.color }]}>{mealPrecision.percent}%</Text>
                        <Text style={styles.mealPrecisionMetaText}>{tx("Basado en foto y respuestas")}</Text>
                      </View>
                      <View style={styles.mealPrecisionTrack}>
                        <View
                          style={[
                            styles.mealPrecisionFill,
                            { width: `${mealPrecision.percent}%`, backgroundColor: mealPrecision.color },
                          ]}
                        />
                      </View>
                    </View>
                  ) : null}
                  {mealPhotos[0] ? <Image source={{ uri: mealPhotos[0] }} style={styles.mealResultImage} resizeMode="cover" /> : null}
                  <TagChip label={tx("Estimado (no exacto)")} tone="warning" />
                  {mealResultSummary ? (
                    <AddQuantityMacroSummary
                      kcal={mealResultSummary.kcal}
                      protein={mealResultSummary.protein_g}
                      carbs={mealResultSummary.carbs_g}
                      fats={mealResultSummary.fat_g}
                    />
                  ) : null}
                  <Text style={styles.helperText}>{tx("Puedes ajustar los valores antes de guardar.")}</Text>
                  <View style={styles.mealEditableGrid}>
                    <InputField
                      label={tx("Kcal")}
                      value={mealEditable.kcal}
                      onChangeText={(value) => setMealEditable((current) => ({ ...current, kcal: value }))}
                      keyboardType="numeric"
                    />
                    <InputField
                      label={tx("Proteína (g)")}
                      value={mealEditable.protein_g}
                      onChangeText={(value) => setMealEditable((current) => ({ ...current, protein_g: value }))}
                      keyboardType="numeric"
                    />
                    <InputField
                      label={tx("Carbohidratos (g)")}
                      value={mealEditable.carbs_g}
                      onChangeText={(value) => setMealEditable((current) => ({ ...current, carbs_g: value }))}
                      keyboardType="numeric"
                    />
                    <InputField
                      label={tx("Grasas (g)")}
                      value={mealEditable.fat_g}
                      onChangeText={(value) => setMealEditable((current) => ({ ...current, fat_g: value }))}
                      keyboardType="numeric"
                    />
                  </View>
                  {mealIngredients.length ? (
                    <Text style={styles.helperText}>{tx("Estimado a partir de: {{ingredients}}", { ingredients: mealIngredients.join(", ") })}</Text>
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
              <PrimaryButton
                title="Buscar por nombre"
                onPress={() => void searchManualFoods(undefined, { force: true })}
                loading={searchingFoods}
              />
              {manualResults.length ? (
                <View style={styles.searchResultsWrap}>
                  {manualResults.map((item) => (
                    <Pressable
                      key={`${item.product.id}-${item.badge}-${item.origin}`}
                      style={styles.searchResultRow}
                      onPress={() => void selectManualResult(item)}
                    >
                      <View style={styles.searchResultTextWrap}>
                        <Text style={styles.searchResultTitle}>{item.product.name}</Text>
                        <Text style={styles.searchResultSubtitle}>
                          {item.product.brand ?? "Sin marca"} · {Math.round(item.product.kcal)} kcal
                        </Text>
                      </View>
                      <View style={styles.searchResultBadgeWrap}>
                        {renderSearchResultStatus(item)}
                        <Text style={styles.inlineRowChevron}>›</Text>
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
            </View>
          </ScrollView>
        ) : null}

        {mode === "recipes" ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            {recipesStage === "chooser" ? (
              <>
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Crear recetas</Text>
                  <Text style={styles.helperText}>
                    Reutiliza una receta tuya o crea una nueva con un flujo más limpio que el invento anterior.
                  </Text>
                </View>

                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Usar una receta existente"
                    subtitle="Busca entre tus recetas y abre el detalle para añadirla al día."
                  />
                  <InputField
                    label="Buscar por nombre"
                    value={recipeSearch}
                    onChangeText={setRecipeSearch}
                    placeholder="Ej: tortillas, bowl, avena..."
                  />
                  {loadingMyRecipes ? <ActivityIndicator color={theme.accent} /> : null}
                  {filteredRecipes.length ? (
                    <View style={styles.recipePreviewList}>
                      {filteredRecipes.map((recipe) => (
                        <Pressable
                          key={recipe.id}
                          style={styles.recipePreviewRow}
                          onPress={() => void openRecipeDetail(recipe.id)}
                        >
                          <View style={styles.recipePreviewImagePlaceholder}>
                            <Text style={styles.recipePreviewImagePlaceholderText}>R</Text>
                          </View>
                          <View style={styles.recipePreviewTextWrap}>
                            <Text style={styles.recipePreviewTitle}>{recipe.title}</Text>
                            <Text style={styles.recipePreviewSubtitle}>
                              {recipeMealTypeLabel(recipe.meal_type)} · {recipe.servings} raciones
                            </Text>
                            <Text style={styles.recipePreviewMacroLine}>
                              {Math.round(recipe.nutrition_kcal)} kcal · P {Math.round(recipe.nutrition_protein_g * 10) / 10} · C{" "}
                              {Math.round(recipe.nutrition_carbs_g * 10) / 10} · G {Math.round(recipe.nutrition_fat_g * 10) / 10}
                            </Text>
                          </View>
                          <Text style={styles.inlineRowChevron}>›</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {!loadingMyRecipes && !filteredRecipes.length ? (
                    <EmptyState
                      title={recipeSearch.trim() ? "No encaja ninguna receta" : "Sin recetas todavía"}
                      subtitle={
                        recipeSearch.trim()
                          ? "Prueba otro nombre o crea una nueva."
                          : "Crea tu primera receta manualmente o deja que la IA haga el trabajo sucio."
                      }
                    />
                  ) : null}
                </View>

                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Crear una nueva receta"
                    subtitle="Elige si quieres montarla a mano o generar una versión base con IA."
                  />
                  <View style={styles.recipeChoiceGrid}>
                    <Pressable style={styles.recipeChoiceCard} onPress={startRecipeManualCreation}>
                      <Text style={styles.recipeChoiceTitle}>Crear manualmente</Text>
                      <Text style={styles.recipeChoiceText}>
                        Título, tipo de comida, ingredientes, pasos, raciones y macros por ración.
                      </Text>
                    </Pressable>
                    <Pressable style={styles.recipeChoiceCard} onPress={() => void startRecipeAiCreation()}>
                      <Text style={styles.recipeChoiceTitle}>Generar con IA</Text>
                      <Text style={styles.recipeChoiceText}>
                        Dile qué tienes, tu objetivo y deja que proponga receta, macros y feedback útil.
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}

            {recipesStage === "detail" && selectedRecipe ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{selectedRecipe.title}</Text>
                <Text style={styles.helperText}>
                  {recipeMealTypeLabel(selectedRecipe.meal_type)} · {selectedRecipe.servings} raciones
                  {selectedRecipe.prep_time_min ? ` · ${selectedRecipe.prep_time_min} min` : ""}
                </Text>
                <View style={styles.tagRow}>
                  <TagChip label={recipeMealTypeLabel(selectedRecipe.meal_type)} tone="accent" />
                  {selectedRecipe.tags.map((tag) => (
                    <TagChip key={tag} label={tag} tone="default" />
                  ))}
                </View>
                <AddQuantityMacroSummary
                  kcal={selectedRecipe.nutrition_kcal}
                  protein={selectedRecipe.nutrition_protein_g}
                  carbs={selectedRecipe.nutrition_carbs_g}
                  fats={selectedRecipe.nutrition_fat_g}
                />

                <SectionHeader title="Ingredientes" />
                <View style={styles.recipeBulletList}>
                  {selectedRecipe.ingredients.map((ingredient, index) => (
                    <Text key={`${ingredient.name}-${index}`} style={styles.helperText}>
                      · {ingredient.name}
                      {ingredient.quantity != null ? ` · ${ingredient.quantity}` : ""}
                      {ingredient.unit ? ` ${ingredient.unit}` : ""}
                    </Text>
                  ))}
                </View>

                <SectionHeader title="Pasos" />
                <View style={styles.recipeBulletList}>
                  {selectedRecipe.steps.map((step, index) => (
                    <Text key={`${selectedRecipe.id}-step-${index}`} style={styles.helperText}>
                      {index + 1}. {step}
                    </Text>
                  ))}
                </View>

                {selectedRecipe.coach_feedback ? (
                  <>
                    <SectionHeader title="Feedback" subtitle="Notas guardadas con la receta" />
                    <View style={styles.recipeFeedbackCard}>
                      <Text style={styles.helperText}>{selectedRecipe.coach_feedback}</Text>
                      {selectedRecipe.assumptions.map((item) => (
                        <Text key={item} style={styles.helperText}>
                          · {item}
                        </Text>
                      ))}
                      {selectedRecipe.suggested_extras.map((item) => (
                        <Text key={`extra-${item}`} style={styles.helperText}>
                          · Podría mejorar con: {item}
                        </Text>
                      ))}
                    </View>
                  </>
                ) : null}

                <PrimaryButton
                  title="Añadir al día"
                  onPress={() => openProductInQuantity(selectedRecipe.product, "recipes", selectedRecipe.preferred_serving)}
                />
                <SecondaryButton title="Editar receta" onPress={() => editSelectedRecipe(selectedRecipe)} disabled={saving} />
              </View>
            ) : null}

            {recipesStage === "manual" ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{recipeDraftId ? "Editar receta" : "Crear receta manualmente"}</Text>
                <Text style={styles.helperText}>
                  Guarda una receta reutilizable con estructura real. Nada de producto manual disfrazado.
                </Text>
                <InputField label="Título" value={recipeTitle} onChangeText={setRecipeTitle} placeholder="Ej: Bowl proteico de atún" />

                <Text style={styles.fieldLabel}>Tipo de comida</Text>
                <View style={styles.methodRow}>
                  {(["breakfast", "brunch", "lunch", "snack", "dinner"] as RecipeMealType[]).map((item) => {
                    const active = recipeMealType === item;
                    return (
                      <Pressable
                        key={item}
                        style={[styles.methodChip, active && styles.methodChipActive]}
                        onPress={() => setRecipeMealType(item)}
                      >
                        <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>
                          {recipeMealTypeLabel(item)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.recipeEditorGrid}>
                  <InputField label="Raciones" value={recipeServings} onChangeText={setRecipeServings} keyboardType="numeric" />
                  <InputField
                    label="Tiempo estimado (min)"
                    value={recipePrepTime}
                    onChangeText={setRecipePrepTime}
                    keyboardType="numeric"
                  />
                </View>

                <SectionHeader title="Ingredientes" subtitle="Nombre, cantidad y unidad." />
                {recipeIngredientRows.map((row, index) => (
                  <View key={row.key} style={styles.recipeEditorRow}>
                    <View style={styles.recipeEditorPrimaryField}>
                      <InputField
                        label={`Ingrediente ${index + 1}`}
                        value={row.name}
                        onChangeText={(value) =>
                          setRecipeIngredientRows((current) =>
                            current.map((item) => (item.key === row.key ? { ...item, name: value } : item)),
                          )
                        }
                        placeholder="Ej: avena"
                      />
                    </View>
                    <View style={styles.recipeEditorCompactField}>
                      <InputField
                        label="Cantidad"
                        value={row.quantity}
                        onChangeText={(value) =>
                          setRecipeIngredientRows((current) =>
                            current.map((item) => (item.key === row.key ? { ...item, quantity: value } : item)),
                          )
                        }
                        keyboardType="numeric"
                        placeholder="80"
                      />
                    </View>
                    <View style={styles.recipeEditorCompactField}>
                      <InputField
                        label="Unidad"
                        value={row.unit}
                        onChangeText={(value) =>
                          setRecipeIngredientRows((current) =>
                            current.map((item) => (item.key === row.key ? { ...item, unit: value } : item)),
                          )
                        }
                        placeholder="g"
                      />
                    </View>
                    {recipeIngredientRows.length > 1 ? (
                      <Pressable
                        style={styles.recipeRowRemove}
                        onPress={() => setRecipeIngredientRows((current) => current.filter((item) => item.key !== row.key))}
                      >
                        <Text style={styles.recipeRowRemoveText}>Quitar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                <SecondaryButton
                  title="Añadir ingrediente"
                  onPress={() =>
                    setRecipeIngredientRows((current) => [
                      ...current,
                      { key: createLocalDraftKey("recipe-ingredient"), name: "", quantity: "", unit: "" },
                    ])
                  }
                />

                <SectionHeader title="Pasos" subtitle="Lista breve y clara." />
                {recipeStepRows.map((row, index) => (
                  <View key={row.key} style={styles.recipeStepRow}>
                    <View style={styles.recipeEditorPrimaryField}>
                      <InputField
                        label={`Paso ${index + 1}`}
                        value={row.value}
                        onChangeText={(value) =>
                          setRecipeStepRows((current) =>
                            current.map((item) => (item.key === row.key ? { ...item, value } : item)),
                          )
                        }
                        placeholder="Ej: mezcla y cocina"
                      />
                    </View>
                    {recipeStepRows.length > 1 ? (
                      <Pressable
                        style={styles.recipeRowRemove}
                        onPress={() => setRecipeStepRows((current) => current.filter((item) => item.key !== row.key))}
                      >
                        <Text style={styles.recipeRowRemoveText}>Quitar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                <SecondaryButton
                  title="Añadir paso"
                  onPress={() =>
                    setRecipeStepRows((current) => [...current, { key: createLocalDraftKey("recipe-step"), value: "" }])
                  }
                />

                <InputField
                  label="Tags (separados por comas)"
                  value={recipeTagsInput}
                  onChangeText={setRecipeTagsInput}
                  placeholder="high protein, vegetariana..."
                />

                <SectionHeader title="Macros por ración" subtitle="Necesarios para poder reutilizar la receta al añadirla al día." />
                <View style={styles.mealEditableGrid}>
                  <InputField label="Kcal" value={recipeKcal} onChangeText={setRecipeKcal} keyboardType="numeric" />
                  <InputField
                    label="Proteína (g)"
                    value={recipeProtein}
                    onChangeText={setRecipeProtein}
                    keyboardType="numeric"
                  />
                  <InputField
                    label="Carbohidratos (g)"
                    value={recipeCarbs}
                    onChangeText={setRecipeCarbs}
                    keyboardType="numeric"
                  />
                  <InputField label="Grasas (g)" value={recipeFat} onChangeText={setRecipeFat} keyboardType="numeric" />
                </View>

                {recipeCoachFeedback ? (
                  <View style={styles.recipeFeedbackCard}>
                    <Text style={styles.sectionTitle}>Feedback / Coach</Text>
                    <Text style={styles.helperText}>{recipeCoachFeedback}</Text>
                    {recipeAssumptions.map((item) => (
                      <Text key={item} style={styles.helperText}>
                        · {item}
                      </Text>
                    ))}
                    {recipeSuggestedExtras.map((item) => (
                      <Text key={`recipe-editor-extra-${item}`} style={styles.helperText}>
                        · Mejoraría con: {item}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <PrimaryButton title={recipeDraftId ? "Guardar cambios" : "Guardar receta"} onPress={() => void saveRecipeDraft()} loading={saving} />
                {recipeManualBackStage === "ai_result" ? (
                  <SecondaryButton title="Volver al resultado IA" onPress={() => setRecipesStage("ai_result")} disabled={saving} />
                ) : null}
              </View>
            ) : null}

            {recipesStage === "ai_input" ? (
              <View style={styles.recipeAiScreen}>
                <View style={[styles.sectionCard, styles.recipeAiHeroCard]}>
                  <Text style={styles.recipeAiEyebrow}>Crear recetas · IA</Text>
                  <Text style={styles.recipeAiHeroTitle}>Genera una base útil con lo que tienes a mano</Text>
                  <Text style={styles.recipeAiHeroText}>
                    Define contexto, objetivo e ingredientes. La IA te devuelve una receta completa con macros y feedback que luego
                    puedes revisar antes de guardarla.
                  </Text>
                </View>

                {recipeAiKeyConfigured === null ? (
                  <View style={[styles.sectionCard, styles.recipeAiLoadingCard]}>
                    <ActivityIndicator color={theme.accent} />
                    <Text style={styles.helperText}>Comprobando si tu clave de IA está lista.</Text>
                  </View>
                ) : null}

                {recipeAiKeyConfigured === false ? (
                  <View style={[styles.sectionCard, styles.recipeAiUnavailableCard]}>
                    <Text style={styles.recipeAiSectionTitle}>IA no configurada</Text>
                    <Text style={styles.helperText}>
                      Configura tu API key de OpenAI en Ajustes &gt; IA para usar este generador y no depender de la imaginación.
                    </Text>
                    <SecondaryButton
                      title="Recordarme dónde está"
                      onPress={() => showAlert("IA", "La configuración está en Ajustes > IA. Sí, escondida donde suelen esconderla estas cosas.")}
                    />
                  </View>
                ) : null}

                {recipeAiKeyConfigured ? (
                  <View style={[styles.recipeAiLayout, recipeAiDesktopLayout && styles.recipeAiLayoutDesktop]}>
                    <View style={styles.recipeAiMainColumn}>
                      <View style={[styles.sectionCard, styles.recipeAiSectionCard]}>
                        <View style={styles.recipeAiSectionHeader}>
                          <Text style={styles.recipeAiSectionTitle}>Tipo de comida</Text>
                          <Text style={styles.recipeAiSectionHelper}>
                            Le da contexto a la receta y ajusta mejor raciones, tono y estructura.
                          </Text>
                        </View>
                        <View style={styles.recipeAiChipRow}>
                          {(["breakfast", "brunch", "lunch", "snack", "dinner"] as RecipeMealType[]).map((item) => {
                            const active = recipeAiMealType === item;
                            return (
                              <Pressable
                                key={item}
                                disabled={saving}
                                onPress={() => setRecipeAiMealType(item)}
                                style={({ pressed }) => [
                                  styles.recipeAiChip,
                                  active && styles.recipeAiChipActive,
                                  pressed && !saving && styles.recipeAiChipPressed,
                                  saving && styles.recipeAiChipDisabled,
                                ]}
                              >
                                <Text style={[styles.recipeAiChipText, active && styles.recipeAiChipTextActive]}>
                                  {recipeMealTypeLabel(item)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={[styles.sectionCard, styles.recipeAiSectionCard]}>
                        <View style={styles.recipeAiSectionHeader}>
                          <Text style={styles.recipeAiSectionTitle}>Objetivo nutricional</Text>
                          <Text style={styles.recipeAiSectionHelper}>
                            Opcional, pero ayuda a que la propuesta no salga a ojo del vecino.
                          </Text>
                        </View>
                        <View style={styles.recipeAiMacroGrid}>
                          {([
                            {
                              key: "kcal",
                              label: "Kcal objetivo",
                              value: recipeAiTargetKcal,
                              setter: setRecipeAiTargetKcal,
                              tone: "kcal" as const,
                              placeholder: "Ej: 650",
                            },
                            {
                              key: "protein",
                              label: "Proteína objetivo",
                              value: recipeAiTargetProtein,
                              setter: setRecipeAiTargetProtein,
                              tone: "protein" as const,
                              placeholder: "Ej: 40",
                            },
                            {
                              key: "carbs",
                              label: "Carbs objetivo",
                              value: recipeAiTargetCarbs,
                              setter: setRecipeAiTargetCarbs,
                              tone: "carbs" as const,
                              placeholder: "Ej: 55",
                            },
                            {
                              key: "fat",
                              label: "Grasas objetivo",
                              value: recipeAiTargetFat,
                              setter: setRecipeAiTargetFat,
                              tone: "fat" as const,
                              placeholder: "Ej: 18",
                            },
                          ]).map((field) => {
                            const accent = macroAccentMeta(field.tone);
                            return (
                              <View
                                key={field.key}
                                style={[
                                  styles.recipeAiMacroCard,
                                  {
                                    borderColor: accent.borderColor,
                                    backgroundColor: field.value.trim() ? accent.softBackground : theme.panelSoft,
                                  },
                                ]}
                              >
                                <View style={[styles.recipeAiMacroCardBar, { backgroundColor: accent.color }]} />
                                <InputField
                                  label={field.label}
                                  value={field.value}
                                  onChangeText={field.setter}
                                  keyboardType="numeric"
                                  inputMode="numeric"
                                  placeholder={field.placeholder}
                                  editable={!saving}
                                  accentColor={accent.color}
                                  containerStyle={styles.recipeAiMacroFieldWrap}
                                  inputStyle={styles.recipeAiMacroInput}
                                />
                              </View>
                            );
                          })}
                        </View>

                        <View style={styles.recipeAiInlineSection}>
                          <Text style={styles.recipeAiInlineLabel}>Modo</Text>
                          <View style={styles.recipeAiChipRow}>
                            {([
                              { label: "Perder grasa", value: "lose" },
                              { label: "Mantener", value: "maintain" },
                              { label: "Ganar", value: "gain" },
                            ] as Array<{ label: string; value: GoalType }>).map((item) => {
                              const active = recipeAiGoalMode === item.value;
                              return (
                                <Pressable
                                  key={item.value}
                                  disabled={saving}
                                  onPress={() => setRecipeAiGoalMode(item.value)}
                                  style={({ pressed }) => [
                                    styles.recipeAiChip,
                                    active && styles.recipeAiChipActive,
                                    pressed && !saving && styles.recipeAiChipPressed,
                                    saving && styles.recipeAiChipDisabled,
                                  ]}
                                >
                                  <Text style={[styles.recipeAiChipText, active && styles.recipeAiChipTextActive]}>{item.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      </View>

                      <View style={[styles.sectionCard, styles.recipeAiSectionCard]}>
                        <View style={styles.recipeAiSectionHeader}>
                          <Text style={styles.recipeAiSectionTitle}>Restricciones</Text>
                          <Text style={styles.recipeAiSectionHelper}>
                            Define hasta dónde puede improvisar y qué debe evitar desde el principio.
                          </Text>
                        </View>
                        <View style={styles.recipeAiChipRow}>
                          <Pressable
                            disabled={saving}
                            onPress={() => setRecipeAiOnlyIngredients((current) => !current)}
                            style={({ pressed }) => [
                              styles.recipeAiChip,
                              recipeAiOnlyIngredients && styles.recipeAiChipActive,
                              pressed && !saving && styles.recipeAiChipPressed,
                              saving && styles.recipeAiChipDisabled,
                            ]}
                          >
                            <Text style={[styles.recipeAiChipText, recipeAiOnlyIngredients && styles.recipeAiChipTextActive]}>
                              {recipeAiOnlyIngredients ? "Solo estos ingredientes" : "Puede sugerir extras"}
                            </Text>
                          </Pressable>
                          <Pressable
                            disabled={saving}
                            onPress={() => setRecipeAiPantryBasics((current) => !current)}
                            style={({ pressed }) => [
                              styles.recipeAiChip,
                              recipeAiPantryBasics && styles.recipeAiChipActive,
                              pressed && !saving && styles.recipeAiChipPressed,
                              saving && styles.recipeAiChipDisabled,
                            ]}
                          >
                            <Text style={[styles.recipeAiChipText, recipeAiPantryBasics && styles.recipeAiChipTextActive]}>
                              {recipeAiPantryBasics ? "Tengo básicos de cocina" : "Sin básicos extra"}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={styles.recipeAiTextFieldGrid}>
                          <InputField
                            label="Alergias o prohibidos"
                            value={recipeAiAllergiesInput}
                            onChangeText={setRecipeAiAllergiesInput}
                            placeholder="Ej: nueces, marisco"
                            editable={!saving}
                            helperText="Separa por comas lo que no puede aparecer."
                            containerStyle={styles.recipeAiTextField}
                          />
                          <InputField
                            label="Preferencias"
                            value={recipeAiPreferencesInput}
                            onChangeText={setRecipeAiPreferencesInput}
                            placeholder="Ej: vegetariana, sin lactosa"
                            editable={!saving}
                            helperText="Sirve para modular estilo y restricciones blandas."
                            containerStyle={styles.recipeAiTextField}
                          />
                        </View>
                      </View>

                      <View style={[styles.sectionCard, styles.recipeAiSectionCard]}>
                        <View style={styles.recipeAiSectionHeader}>
                          <Text style={styles.recipeAiSectionTitle}>Ingredientes disponibles</Text>
                          <Text style={styles.recipeAiSectionHelper}>
                            Añade nombre, cantidad y unidad si la sabes. La IA solo puede trabajar con lo que pongas aquí.
                          </Text>
                        </View>

                        {!recipeAiHasAnyIngredientData ? (
                          <View style={styles.recipeAiIngredientEmptyState}>
                            <Text style={styles.recipeAiIngredientEmptyTitle}>Todavía no has puesto ingredientes</Text>
                            <Text style={styles.recipeAiIngredientEmptyText}>
                              Empieza con algo simple: pollo, arroz, huevo, tomate. Con eso ya sale una receta decente.
                            </Text>
                          </View>
                        ) : null}

                        <View style={styles.recipeAiIngredientList}>
                          {recipeAiIngredientRows.map((row, index) => {
                            const missingName = Boolean((row.quantity.trim() || row.unit.trim()) && !row.name.trim());
                            return (
                              <View key={row.key} style={styles.recipeAiIngredientCard}>
                                <View style={styles.recipeAiIngredientCardHeader}>
                                  <Text style={styles.recipeAiIngredientIndex}>Ingrediente {index + 1}</Text>
                                  {recipeAiIngredientRows.length > 1 ? (
                                    <Pressable
                                      disabled={saving}
                                      style={({ pressed }) => [
                                        styles.recipeAiIngredientRemove,
                                        pressed && styles.recipeAiIngredientRemovePressed,
                                        saving && styles.recipeAiChipDisabled,
                                      ]}
                                      onPress={() =>
                                        setRecipeAiIngredientRows((current) => current.filter((item) => item.key !== row.key))
                                      }
                                    >
                                      <Text style={styles.recipeAiIngredientRemoveText}>×</Text>
                                    </Pressable>
                                  ) : null}
                                </View>

                                <View style={styles.recipeAiIngredientRow}>
                                  <InputField
                                    label="Nombre"
                                    value={row.name}
                                    onChangeText={(value) =>
                                      setRecipeAiIngredientRows((current) =>
                                        current.map((item) => (item.key === row.key ? { ...item, name: value } : item)),
                                      )
                                    }
                                    placeholder="Ej: pollo"
                                    editable={!saving}
                                    autoFocus={recipeAiAutoFocusIngredientKey === row.key}
                                    invalid={missingName}
                                    helperText={missingName ? "Falta el nombre para que la IA sepa qué hacer con esto." : undefined}
                                    containerStyle={styles.recipeAiIngredientNameField}
                                  />
                                  <View style={styles.recipeAiIngredientMetaFields}>
                                    <InputField
                                      label="Cantidad"
                                      value={row.quantity}
                                      onChangeText={(value) =>
                                        setRecipeAiIngredientRows((current) =>
                                          current.map((item) => (item.key === row.key ? { ...item, quantity: value } : item)),
                                        )
                                      }
                                      keyboardType="numeric"
                                      inputMode="numeric"
                                      placeholder="Ej: 200"
                                      editable={!saving}
                                      containerStyle={styles.recipeAiIngredientCompactField}
                                    />
                                    <InputField
                                      label="Unidad"
                                      value={row.unit}
                                      onChangeText={(value) =>
                                        setRecipeAiIngredientRows((current) =>
                                          current.map((item) => (item.key === row.key ? { ...item, unit: value } : item)),
                                        )
                                      }
                                      placeholder="Ej: g"
                                      editable={!saving}
                                      containerStyle={styles.recipeAiIngredientCompactField}
                                    />
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>

                        <View style={styles.recipeAiIngredientActions}>
                          <SecondaryButton title="Añadir ingrediente" onPress={appendRecipeAiIngredientRow} disabled={saving} />
                          <Text style={styles.recipeAiSectionFootnote}>Añade varios si quieres que la receta cierre mejor macros y textura.</Text>
                        </View>
                      </View>

                      <View style={[styles.sectionCard, styles.recipeAiCtaCard]}>
                        <View style={styles.recipeAiCtaCopy}>
                          <Text style={styles.recipeAiSectionTitle}>Generar receta</Text>
                          <Text style={styles.recipeAiSectionHelper}>
                            La IA usará exactamente estos datos. Luego podrás revisar el resultado antes de guardarlo.
                          </Text>
                        </View>
                        <PrimaryButton
                          title="Generar receta"
                          loadingTitle="Generando receta..."
                          onPress={() => void runRecipeGenerator()}
                          loading={saving}
                          disabled={!recipeAiFilledIngredientCount}
                          style={styles.recipeAiPrimaryButton}
                          textStyle={styles.recipeAiPrimaryButtonText}
                        />
                      </View>
                    </View>

                    {recipeAiDesktopLayout ? (
                      <View style={styles.recipeAiSidebar}>
                        <View style={[styles.sectionCard, styles.recipeAiSummaryCard, recipeAiStickyCardStyle]}>
                          <Text style={styles.recipeAiSummaryEyebrow}>Resumen</Text>
                          <Text style={styles.recipeAiSummaryTitle}>Lo que va a usar la IA</Text>

                          <View style={styles.recipeAiSummaryBlock}>
                            <View style={styles.recipeAiSummaryRow}>
                              <Text style={styles.recipeAiSummaryLabel}>Tipo</Text>
                              <Text style={styles.recipeAiSummaryValue}>{recipeMealTypeLabel(recipeAiMealType)}</Text>
                            </View>
                            <View style={styles.recipeAiSummaryRow}>
                              <Text style={styles.recipeAiSummaryLabel}>Modo</Text>
                              <Text style={styles.recipeAiSummaryValue}>
                                {recipeAiGoalMode === "lose" ? "Perder grasa" : recipeAiGoalMode === "gain" ? "Ganar" : "Mantener"}
                              </Text>
                            </View>
                            <View style={styles.recipeAiSummaryRow}>
                              <Text style={styles.recipeAiSummaryLabel}>Ingredientes</Text>
                              <Text style={styles.recipeAiSummaryValue}>{recipeAiFilledIngredientCount}</Text>
                            </View>
                          </View>

                          <View style={styles.recipeAiSummaryMacroGrid}>
                            {([
                              { label: "Kcal", value: recipeAiTargetKcal || "—", tone: "kcal" as const },
                              { label: "Prote", value: recipeAiTargetProtein || "—", tone: "protein" as const },
                              { label: "Carbs", value: recipeAiTargetCarbs || "—", tone: "carbs" as const },
                              { label: "Grasa", value: recipeAiTargetFat || "—", tone: "fat" as const },
                            ]).map((item) => {
                              const accent = macroAccentMeta(item.tone);
                              return (
                                <View
                                  key={item.label}
                                  style={[styles.recipeAiSummaryMacroCard, { borderColor: accent.borderColor, backgroundColor: accent.softBackground }]}
                                >
                                  <Text style={[styles.recipeAiSummaryMacroLabel, { color: accent.color }]}>{item.label}</Text>
                                  <Text style={styles.recipeAiSummaryMacroValue}>{item.value}</Text>
                                </View>
                              );
                            })}
                          </View>

                          <View style={styles.recipeAiSummaryRestrictionBlock}>
                            <Text style={styles.recipeAiSummarySubheading}>Restricciones activas</Text>
                            <View style={styles.recipeAiSummaryRestrictionList}>
                              {recipeAiRestrictionSummary.map((item) => (
                                <View key={item} style={styles.recipeAiSummaryRestrictionPill}>
                                  <Text style={styles.recipeAiSummaryRestrictionText}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          </View>

                          <PrimaryButton
                            title="Generar receta"
                            loadingTitle="Generando receta..."
                            onPress={() => void runRecipeGenerator()}
                            loading={saving}
                            disabled={!recipeAiFilledIngredientCount}
                            style={styles.recipeAiPrimaryButton}
                            textStyle={styles.recipeAiPrimaryButtonText}
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {recipesStage === "ai_options" ? (
              <View style={styles.sectionCard}>
                <View style={styles.recipeAiOptionsHeader}>
                  <View style={styles.recipeAiOptionsHeaderCopy}>
                    <Text style={styles.sectionTitle}>Elige una dirección</Text>
                    <Text style={styles.helperText}>
                      Te propongo tres recetas distintas. La estrella marca la que mejor encaja con lo que llevas hoy.
                    </Text>
                  </View>
                  {recipeAiGenerationId ? <TagChip label="3 opciones" tone="accent" /> : null}
                </View>

                {saving && recipeAiOptions.length === 0 ? (
                  <View style={styles.recipeAiOptionsSkeletonList}>
                    {[0, 1, 2].map((item) => (
                      <View key={`recipe-ai-skeleton-${item}`} style={styles.recipeAiOptionCard}>
                        <View style={styles.skeletonLineLg} />
                        <View style={styles.skeletonRow}>
                          <View style={styles.skeletonTile} />
                          <View style={styles.skeletonTile} />
                        </View>
                        <View style={styles.skeletonLineMd} />
                        <View style={styles.skeletonLineSm} />
                        <View style={styles.skeletonLineSm} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.recipeAiOptionsList}>
                    {recipeAiOptions.map((option) => {
                      const complexityTone =
                        option.complexity === "low" ? "low" : option.complexity === "high" ? "high" : "medium";
                      return (
                        <Pressable
                          key={option.option_id}
                          onPress={() => void openRecipeAiDetail(option)}
                          disabled={saving}
                          style={({ pressed }) => [
                            styles.recipeAiOptionCard,
                            option.recommended && styles.recipeAiOptionCardRecommended,
                            pressed && !saving && styles.recipeAiOptionCardPressed,
                          ]}
                        >
                            <View style={styles.recipeAiOptionHeader}>
                              <View style={styles.recipeAiOptionHeaderCopy}>
                              <View style={styles.recipeAiOptionTitleRow}>
                                <Text style={styles.recipeAiOptionTitle}>{option.title}</Text>
                                {option.recommended ? <Text style={styles.recipeAiRecommendedStar}>★</Text> : null}
                              </View>
                              <Text style={styles.recipeAiOptionMeta}>
                                {recipeMealTypeLabel(option.meal_type)} · {option.servings} raciones
                                {option.prep_time_min != null ? ` · ${option.prep_time_min} min` : ""}
                              </Text>
                              </View>
                              <View
                                style={[
                                  styles.recipeAiComplexityChip,
                                  complexityTone === "low"
                                    ? styles.recipeAiComplexityChipLow
                                    : complexityTone === "high"
                                      ? styles.recipeAiComplexityChipHigh
                                      : styles.recipeAiComplexityChipMedium,
                                ]}
                              >
                                <Text style={styles.recipeAiComplexityChipText}>
                                  {option.complexity === "low" ? "Bajo" : option.complexity === "high" ? "Alto" : "Medio"}
                                </Text>
                              </View>
                            </View>

                          {option.recommended && option.recommended_reason ? (
                            <View style={styles.recipeAiRecommendedCallout}>
                              <Text style={styles.recipeAiRecommendedCalloutText}>Recomendada: {option.recommended_reason}</Text>
                            </View>
                          ) : null}

                          <Text style={styles.recipeAiOptionSummary}>{option.summary}</Text>

                          <View style={styles.recipeAiOptionMacroRow}>
                            {([
                              { label: "kcal", value: Math.round(option.nutrition_kcal), tone: "kcal" as const },
                              { label: "P", value: Math.round(option.nutrition_protein_g), tone: "protein" as const },
                              { label: "C", value: Math.round(option.nutrition_carbs_g), tone: "carbs" as const },
                              { label: "G", value: Math.round(option.nutrition_fat_g), tone: "fat" as const },
                            ]).map((item) => {
                              const accent = macroAccentMeta(item.tone);
                              return (
                                <View
                                  key={`${option.option_id}-${item.label}`}
                                  style={[
                                    styles.recipeAiOptionMacroPill,
                                    { borderColor: accent.borderColor, backgroundColor: accent.softBackground },
                                  ]}
                                >
                                  <Text style={[styles.recipeAiOptionMacroLabel, { color: accent.color }]}>{item.label}</Text>
                                  <Text style={styles.recipeAiOptionMacroValue}>{item.value}</Text>
                                </View>
                              );
                            })}
                          </View>

                          {option.highlights.length ? (
                            <View style={styles.recipeAiOptionHighlightList}>
                              {option.highlights.map((item) => (
                                <Text key={`${option.option_id}-${item}`} style={styles.recipeAiOptionHighlightText}>
                                  · {item}
                                </Text>
                              ))}
                            </View>
                          ) : null}

                          <PrimaryButton
                            title="Elegir esta receta"
                            onPress={() => void openRecipeAiDetail(option)}
                            disabled={saving}
                            style={styles.recipeAiOptionButton}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}

            {recipesStage === "ai_result" ? (
              <View style={styles.sectionCard}>
                {saving && !recipeAiResult ? (
                  <View style={styles.recipeAiDetailSkeleton}>
                    <View style={styles.skeletonLineLg} />
                    <View style={styles.skeletonLineMd} />
                    <View style={styles.skeletonBlockTall} />
                    <View style={styles.skeletonLineMd} />
                    <View style={styles.skeletonLineSm} />
                    <View style={styles.skeletonLineSm} />
                  </View>
                ) : recipeAiResult ? (
                  <>
                    <View style={styles.recipeAiDetailHeader}>
                      <View style={styles.recipeAiDetailHeaderCopy}>
                        <View style={styles.recipeAiOptionTitleRow}>
                          <Text style={styles.sectionTitle}>{recipeAiResult.recipe.title}</Text>
                          {recipeAiResult.recommended ? <Text style={styles.recipeAiRecommendedStar}>★</Text> : null}
                        </View>
                        <Text style={styles.helperText}>
                          {recipeMealTypeLabel(recipeAiResult.recipe.meal_type)} · {recipeAiResult.recipe.servings} raciones
                          {recipeAiResult.recipe.prep_time_min != null ? ` · ${recipeAiResult.recipe.prep_time_min} min` : ""}
                        </Text>
                        {recipeAiResult.recommended && recipeAiResult.recommended_reason ? (
                          <Text style={styles.recipeAiDetailReason}>Recomendada: {recipeAiResult.recommended_reason}</Text>
                        ) : null}
                      </View>
                      <TagChip label={`IA · ${recipeAiResult.model_used}`} tone="accent" />
                    </View>

                    <SectionHeader title="Resumen nutricional" />
                    <AddQuantityMacroSummary
                      kcal={recipeAiResult.recipe.nutrition_kcal}
                      protein={recipeAiResult.recipe.nutrition_protein_g}
                      carbs={recipeAiResult.recipe.nutrition_carbs_g}
                      fats={recipeAiResult.recipe.nutrition_fat_g}
                    />

                    <SectionHeader title="Receta" />
                    <View style={styles.recipeBulletList}>
                      {recipeAiResult.recipe.ingredients.map((ingredient, index) => (
                        <Text key={`${ingredient.name}-${index}`} style={styles.helperText}>
                          · {ingredient.name}
                          {ingredient.quantity != null ? ` · ${ingredient.quantity}` : ""}
                          {ingredient.unit ? ` ${ingredient.unit}` : ""}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.recipeBulletList}>
                      {recipeAiResult.recipe.steps.map((step, index) => (
                        <Text key={`ai-step-${index}`} style={styles.helperText}>
                          {index + 1}. {step}
                        </Text>
                      ))}
                    </View>

                    <SectionHeader title="Feedback / Coach" />
                    <View style={styles.recipeFeedbackCard}>
                      <Text style={styles.helperText}>{recipeAiResult.feedback.summary}</Text>
                      {recipeAiResult.feedback.highlights.map((item) => (
                        <Text key={`highlight-${item}`} style={styles.helperText}>
                          · {item}
                        </Text>
                      ))}
                      {recipeAiResult.feedback.gaps.map((item) => (
                        <Text key={`gap-${item}`} style={styles.helperText}>
                          · {item}
                        </Text>
                      ))}
                      {recipeAiResult.feedback.tips.map((item) => (
                        <Text key={`tip-${item}`} style={styles.helperText}>
                          · {item}
                        </Text>
                      ))}
                      {recipeAiResult.assumptions.map((item) => (
                        <Text key={`assumption-${item}`} style={styles.helperText}>
                          · Supuesto: {item}
                        </Text>
                      ))}
                    </View>

                    <PrimaryButton title="Guardar receta" onPress={() => void saveRecipeFromAiResult()} loading={saving} />
                    <SecondaryButton title="Editar" onPress={editRecipeFromAiResult} disabled={saving} />
                    <SecondaryButton title="Ver otras opciones" onPress={() => setRecipesStage("ai_options")} disabled={saving} />
                    <SecondaryButton title="Generar otra variante" onPress={() => void runRecipeGenerator()} disabled={saving} />
                  </>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        {mode === "barcode" && phase === "quantity" && product ? (
          <ScrollView contentContainerStyle={styles.scanPane} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{product.name}</Text>
              <Text style={styles.helperText}>{tx("Marca: {{brand}}", { brand: product.brand ?? "-" })}</Text>
              {showScannedProductImage && product.image_url ? (
                <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="contain" />
              ) : null}
              {productQuality ? (
                <>
                  <TagChip
                    label={tx("Calidad: {{quality}}", { quality: productQuality.label })}
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
              {showScannedProductImage ? (
                <View style={styles.correctionCallout}>
                  <View style={styles.correctionCalloutHeader}>
                    <Text style={styles.correctionCalloutTitle}>¿Etiqueta desactualizada?</Text>
                    <Text style={styles.correctionCalloutText}>Puedes corregir valores con una foto de la etiqueta.</Text>
                  </View>
                  <SecondaryButton
                    title="Corregir valores manualmente"
                    onPress={openCorrectionFromProduct}
                    disabled={saving}
                  />
                </View>
              ) : null}

              <QuantityMethodSelector method={method} onChange={handleQuantityMethodChange} product={product} />

              {method === "grams" ? (
                <View style={styles.sliderWrap}>
                  <Text style={styles.sliderLabel}>{Math.round(grams)} g</Text>
                  <Slider
                    minimumValue={5}
                    maximumValue={500}
                    step={5}
                    value={grams}
                    onValueChange={(value) => {
                      setUseDefaultSummary100g(false);
                      setGrams(value);
                    }}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  <TextInput
                    value={String(Math.round(grams))}
                    onChangeText={(value) => {
                      const parsed = Number(value);
                      if (Number.isFinite(parsed)) {
                        setUseDefaultSummary100g(false);
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
                    onValueChange={(value) => {
                      setUseDefaultSummary100g(false);
                      setUnits(value);
                    }}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  <TextInput
                    value={String(units)}
                    onChangeText={(value) => {
                      const parsed = Number(value);
                      if (Number.isFinite(parsed)) {
                        setUseDefaultSummary100g(false);
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
                    onValueChange={(value) => {
                      setUseDefaultSummary100g(false);
                      setPercentPack(value);
                    }}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  <TextInput
                    value={String(Math.round(percentPack))}
                    onChangeText={(value) => {
                      const parsed = Number(value);
                      if (Number.isFinite(parsed)) {
                        setUseDefaultSummary100g(false);
                        setPercentPack(clamp(parsed, 0, 100));
                      }
                    }}
                    keyboardType="numeric"
                    style={styles.quantityInput}
                  />
                  <Text style={styles.helperText}>net_weight_g: {product.net_weight_g ?? "N/A"}</Text>
                </View>
              ) : null}

              <View style={styles.quantitySummaryHeader}>
                <Text style={styles.quantitySummaryTitle}>Resumen nutricional</Text>
                <Text style={styles.quantitySummarySub}>
                  {product.source === "user_recipe"
                    ? `${Math.round(units * 10) / 10} ración${units === 1 ? "" : "es"}`
                    : useDefaultSummary100g
                      ? "100 g"
                      : tx("{{quantityG}} g equivalentes", { quantityG: Math.round(resolvedQuantityG) })}
                </Text>
              </View>
              {quantityMacroSummary ? (
                <AddQuantityMacroSummary
                  kcal={quantityMacroSummary.kcal}
                  protein={quantityMacroSummary.protein}
                  carbs={quantityMacroSummary.carbs}
                  fats={quantityMacroSummary.fats}
                />
              ) : (
                <Text style={styles.helperText}>Sin datos para este método/cantidad.</Text>
              )}

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
              <SecondaryButton title="Escanear otro" onPress={() => void startBarcodeFlow()} disabled={saving} />
            </View>
          </ScrollView>
        ) : null}

        {mealSourceSheetVisible ? (
          <View style={styles.mealSourceSheetLayer} pointerEvents="box-none">
            <Pressable style={styles.mealSourceSheetBackdrop} onPress={() => closeMealSourceSheet()}>
              <Animated.View style={[styles.mealSourceSheetScrim, { opacity: mealSourceSheetBackdropOpacity }]} />
            </Pressable>
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.mealSourceSheetContainer,
                {
                  opacity: mealSourceSheetAnim,
                  transform: [{ translateY: mealSourceSheetTranslate }, { scale: mealSourceSheetScale }],
                },
              ]}
            >
              <Pressable style={styles.mealSourceSheetCard} onPress={() => {}}>
                <Text style={styles.mealSourceSheetTitle}>Selecciona una opción</Text>
                <View style={styles.mealSourceSheetOptions}>
                  <Pressable
                    style={styles.mealSourceSheetOption}
                    onPress={() =>
                      closeMealSourceSheet(() => {
                        void captureMealPhoto();
                      })
                    }
                  >
                    <View style={styles.mealSourceSheetOptionIconWrap}>
                      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                        <Rect x={3} y={6} width={18} height={13} rx={3} stroke={theme.text} strokeWidth={1.8} />
                        <Circle cx={12} cy={12.5} r={3.2} stroke={theme.text} strokeWidth={1.8} />
                        <Rect x={7.2} y={4.2} width={3.8} height={2.5} rx={1} fill={theme.text} />
                      </Svg>
                    </View>
                    <Text style={styles.mealSourceSheetOptionTitle}>Tomar foto</Text>
                    <Text style={styles.mealSourceSheetOptionSubtitle}>Usar la cámara</Text>
                  </Pressable>

                  <Pressable
                    style={styles.mealSourceSheetOption}
                    onPress={() =>
                      closeMealSourceSheet(() => {
                        void pickMealPhotoFromLibrary();
                      })
                    }
                  >
                    <View style={styles.mealSourceSheetOptionIconWrap}>
                      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                        <Rect x={4} y={5} width={16} height={14} rx={2.5} stroke={theme.text} strokeWidth={1.8} />
                        <Circle cx={9} cy={10} r={1.7} fill={theme.text} />
                        <Path d="M6.5 16l3.4-3.3 2.4 2.2 2.4-2.2 2.8 3.3" stroke={theme.text} strokeWidth={1.8} strokeLinecap="round" />
                      </Svg>
                    </View>
                    <Text style={styles.mealSourceSheetOptionTitle}>Subir imagen</Text>
                    <Text style={styles.mealSourceSheetOptionSubtitle}>Elegir hasta 3 de galería</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Animated.View>
          </View>
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
        <Circle cx={12} cy={5.6} r={3.15} stroke={color} strokeWidth={strokeWidth} />
        <Line x1={12} y1={8.8} x2={12} y2={14.8} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1={12} y1={9.8} x2={7.8} y2={14.2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1={12} y1={9.8} x2={16.2} y2={14.2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1={12} y1={14.8} x2={8.6} y2={20.2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1={12} y1={14.8} x2={15.4} y2={20.2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
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

  if (props.tab === "social") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx={8} cy={9} r={2.7} stroke={color} strokeWidth={strokeWidth} />
        <Circle cx={16} cy={10.2} r={2.2} stroke={color} strokeWidth={strokeWidth} />
        <Path d="M4.8 18.2c.7-2.3 2.5-3.6 5.2-3.6 2.7 0 4.5 1.3 5.2 3.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Path d="M13.6 17.8c.45-1.55 1.68-2.5 3.55-2.5 1.03 0 1.92.28 2.65.83" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
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

function VerifiedTickIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path
        d="M3.35 8.2 6.25 11 12.65 5.05"
        stroke={theme.ok}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
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
  if (props.action === "recipes") {
    return (
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={4} width={16} height={16} rx={3} stroke="#0b1220" strokeWidth={2} />
        <Line x1={8} y1={9} x2={16} y2={9} stroke="#0b1220" strokeWidth={2} strokeLinecap="round" />
        <Line x1={8} y1={13} x2={16} y2={13} stroke="#0b1220" strokeWidth={2} strokeLinecap="round" />
        <Line x1={8} y1={17} x2={13} y2={17} stroke="#0b1220" strokeWidth={2} strokeLinecap="round" />
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
    <Pressable style={styles.quickAddCard} onPress={props.onPress}>
      <View style={[styles.quickAddIconWrap, { backgroundColor: props.accent }]}>
        <QuickAddIcon action={props.action} />
      </View>
      <Text style={styles.quickAddTitle}>{props.title}</Text>
      <Text style={styles.quickAddSubtitle}>{props.subtitle}</Text>
    </Pressable>
  );
}

function MainAppTabs() {
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const isWeb = Platform.OS === "web";
  const router = useWebRouter();
  const initialTab = isWeb ? tabFromAppRoute(router.path) : "dashboard";
  const [tab, setTab] = useState<MainTab>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Record<MainTab, boolean>>({
    dashboard: initialTab === "dashboard",
    body: initialTab === "body",
    add: false,
    social: initialTab === "social",
    history: initialTab === "history",
    settings: initialTab === "settings",
  });
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [hideTabBarForOverlay, setHideTabBarForOverlay] = useState(false);
  const [hideTabBarForScanCamera, setHideTabBarForScanCamera] = useState(false);
  const [hideTabBarForMealQuestions, setHideTabBarForMealQuestions] = useState(false);
  const [transitionFromTab, setTransitionFromTab] = useState<MainTab | null>(null);
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const [launchAction, setLaunchAction] = useState<AddLaunchAction | null>(null);
  const [webAccountMenuOpen, setWebAccountMenuOpen] = useState(false);
  const [webAccountMenuVisible, setWebAccountMenuVisible] = useState(false);
  const [avatarSourceSheetOpen, setAvatarSourceSheetOpen] = useState(false);
  const [avatarSourceSheetVisible, setAvatarSourceSheetVisible] = useState(false);
  const [uploadingWebAvatar, setUploadingWebAvatar] = useState(false);
  const [settingsFocusSection, setSettingsFocusSection] = useState<"profile" | null>(null);
  const quickAddAnim = useRef(new Animated.Value(0)).current;
  const tabBarAnim = useRef(new Animated.Value(1)).current;
  const webAccountMenuAnim = useRef(new Animated.Value(0)).current;
  const avatarSourceSheetAnim = useRef(new Animated.Value(0)).current;
  const sceneOpacityRef = useRef<Record<MainTab, Animated.Value>>({
    dashboard: new Animated.Value(1),
    body: new Animated.Value(0),
    add: new Animated.Value(0),
    social: new Animated.Value(0),
    history: new Animated.Value(0),
    settings: new Animated.Value(0),
  });
  const tabSwitchingRef = useRef(false);
  const activeTabRef = useRef<MainTab>(initialTab);
  const shouldHideAddTrigger = tab === "add" && (hideTabBarForOverlay || hideTabBarForScanCamera || hideTabBarForMealQuestions);
  const shouldHideTabBar = !isWeb && shouldHideAddTrigger;
  const useDesktopLayout = isDesktopWebLayout(width);
  const tabBarInsetStyle = useMemo(() => {
    if (!useDesktopLayout) {
      return undefined;
    }
    return {
      left: 24,
      right: 24,
      bottom: 18,
    };
  }, [useDesktopLayout]);
  const quickAddInsetStyle = useMemo(() => {
    if (isWeb || !useDesktopLayout) {
      return undefined;
    }
    return {
      paddingHorizontal: 24,
      paddingBottom: 112,
    };
  }, [isWeb, useDesktopLayout]);

  const tabs: Array<{ value: MainTab; label: string; center?: boolean }> = [
    { value: "dashboard", label: "Panel" },
    { value: "body", label: "Cuerpo" },
    { value: "add", label: "", center: true },
    { value: "social", label: "Social" },
    { value: "history", label: "Historial" },
    { value: "settings", label: "Ajustes" },
  ];
  const webTabs: Array<{ value: Exclude<MainTab, "add">; label: string }> = [
    { value: "dashboard", label: "Panel" },
    { value: "body", label: "Body" },
    { value: "social", label: "Social" },
    { value: "history", label: "Historial" },
    { value: "settings", label: "Ajustes" },
  ];

  const setSceneVisibilityInstant = useCallback((active: MainTab) => {
    const scenes = sceneOpacityRef.current;
    (Object.keys(scenes) as MainTab[]).forEach((key) => {
      scenes[key].setValue(key === active ? 1 : 0);
    });
  }, []);

  const setTabWithFade = useCallback(
    (nextTab: MainTab) => {
      const currentTab = activeTabRef.current;
      if (nextTab === currentTab) {
        return;
      }

      if (tabSwitchingRef.current) {
        return;
      }

      const shouldAnimate = currentTab !== "add" && nextTab !== "add";
      if (!shouldAnimate) {
        setTab(nextTab);
        activeTabRef.current = nextTab;
        setTransitionFromTab(null);
        setTabTransitioning(false);
        setSceneVisibilityInstant(nextTab);
        return;
      }

      setVisitedTabs((current) => {
        if (current[nextTab]) {
          return current;
        }
        return {
          ...current,
          [nextTab]: true,
        };
      });

      tabSwitchingRef.current = true;
      setTabTransitioning(true);
      setTransitionFromTab(currentTab);
      setTab(nextTab);

      const outgoing = sceneOpacityRef.current[currentTab];
      const incoming = sceneOpacityRef.current[nextTab];
      outgoing.stopAnimation();
      incoming.stopAnimation();
      incoming.setValue(0);

      Animated.parallel([
        Animated.timing(outgoing, {
          toValue: 0,
          duration: 200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(incoming, {
          toValue: 1,
          duration: 200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        activeTabRef.current = nextTab;
        setSceneVisibilityInstant(nextTab);
        setTransitionFromTab(null);
        setTabTransitioning(false);
        tabSwitchingRef.current = false;
      });
    },
    [setSceneVisibilityInstant],
  );

  const navigateToTabRoute = useCallback(
    (nextTab: Exclude<MainTab, "add">, options?: { replace?: boolean }) => {
      if (!isWeb) {
        setTabWithFade(nextTab);
        return;
      }
      const nextPath = appRouteForTab(nextTab);
      if (options?.replace) {
        router.replace(nextPath);
        return;
      }
      router.navigate(nextPath);
    },
    [isWeb, router, setTabWithFade],
  );

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
      setTabWithFade("add");
      setLaunchAction({
        requestId: Date.now(),
        action,
      });
    });
  };

  const toggleQuickAdd = useCallback(() => {
    if (quickAddOpen) {
      closeQuickAdd();
      return;
    }
    openQuickAdd();
  }, [closeQuickAdd, openQuickAdd, quickAddOpen]);

  const openWebAccountMenu = useCallback(() => {
    if (webAccountMenuOpen) {
      return;
    }
    setWebAccountMenuVisible(true);
    setWebAccountMenuOpen(true);
    webAccountMenuAnim.stopAnimation();
    Animated.spring(webAccountMenuAnim, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.95,
      useNativeDriver: true,
    }).start();
  }, [webAccountMenuAnim, webAccountMenuOpen]);

  const closeWebAccountMenu = useCallback(
    (onClosed?: () => void) => {
      if (!webAccountMenuVisible) {
        onClosed?.();
        return;
      }
      setWebAccountMenuOpen(false);
      webAccountMenuAnim.stopAnimation();
      Animated.timing(webAccountMenuAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setWebAccountMenuVisible(false);
        }
        onClosed?.();
      });
    },
    [webAccountMenuAnim, webAccountMenuVisible],
  );

  const toggleWebAccountMenu = useCallback(() => {
    if (webAccountMenuOpen) {
      closeWebAccountMenu();
      return;
    }
    openWebAccountMenu();
  }, [closeWebAccountMenu, openWebAccountMenu, webAccountMenuOpen]);

  const openAvatarSourceSheet = useCallback(() => {
    if (avatarSourceSheetOpen) {
      return;
    }
    setAvatarSourceSheetVisible(true);
    setAvatarSourceSheetOpen(true);
    avatarSourceSheetAnim.stopAnimation();
    Animated.spring(avatarSourceSheetAnim, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.95,
      useNativeDriver: true,
    }).start();
  }, [avatarSourceSheetAnim, avatarSourceSheetOpen]);

  const closeAvatarSourceSheet = useCallback(
    (onClosed?: () => void) => {
      if (!avatarSourceSheetVisible) {
        onClosed?.();
        return;
      }
      setAvatarSourceSheetOpen(false);
      avatarSourceSheetAnim.stopAnimation();
      Animated.timing(avatarSourceSheetAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setAvatarSourceSheetVisible(false);
        }
        onClosed?.();
      });
    },
    [avatarSourceSheetAnim, avatarSourceSheetVisible],
  );

  const uploadWebAvatarFromAssets = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[]) => {
      const firstAsset = assets[0];
      if (!firstAsset?.uri) {
        return;
      }
      setUploadingWebAvatar(true);
      try {
        const avatarUri = await prepareAvatarUploadUri(firstAsset);
        await auth.uploadProfileAvatar(avatarUri);
        showAlert("Perfil", "Foto de perfil actualizada.");
      } catch (error) {
        showAlert("Perfil", parseApiError(error));
      } finally {
        setUploadingWebAvatar(false);
      }
    },
    [auth],
  );

  const pickWebAvatarFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert("Perfil", "Permite acceso a galería para elegir una foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length) {
      await uploadWebAvatarFromAssets(result.assets);
    }
  }, [uploadWebAvatarFromAssets]);

  const pickWebAvatarFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert("Perfil", "Permite acceso a cámara para sacar la foto.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadWebAvatarFromAssets([result.assets[0]]);
    }
  }, [uploadWebAvatarFromAssets]);

  const webProfileName = auth.user?.username?.trim() || auth.user?.email?.split("@")[0] || "Usuario";
  const webProfileInitial = webProfileName.slice(0, 1).toUpperCase();
  const openMySocialProfile = useCallback(() => {
    const username = auth.user?.username?.trim();
    closeQuickAdd(() => {
      if (isWeb && username) {
        router.navigate(socialProfileRoute(username));
        return;
      }
      navigateToTabRoute("social");
    });
  }, [auth.user?.username, closeQuickAdd, isWeb, navigateToTabRoute, router]);
  const openSettingsHome = useCallback(() => {
    setSettingsFocusSection(null);
    closeQuickAdd(() => navigateToTabRoute("settings"));
  }, [closeQuickAdd, navigateToTabRoute]);
  const openProfileEditor = useCallback(() => {
    setSettingsFocusSection("profile");
    closeQuickAdd(() => navigateToTabRoute("settings"));
  }, [closeQuickAdd, navigateToTabRoute]);

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
  const tabBarTranslateY = tabBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [130, 0],
  });
  const webAccountMenuTranslateY = webAccountMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 0],
  });
  const webAccountMenuScale = webAccountMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const webAccountMenuBackdropOpacity = webAccountMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const avatarSourceSheetTranslate = avatarSourceSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [360, 0],
  });
  const avatarSourceSheetScale = avatarSourceSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const avatarSourceSheetBackdropOpacity = avatarSourceSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  useEffect(() => {
    Animated.timing(tabBarAnim, {
      toValue: shouldHideTabBar ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shouldHideTabBar, tabBarAnim]);

  useEffect(() => {
    setVisitedTabs((current) => {
      if (current[tab]) {
        return current;
      }
      return {
        ...current,
        [tab]: true,
      };
    });
  }, [tab]);

  useEffect(() => {
    if (tab !== "add") {
      setHideTabBarForOverlay(false);
      setHideTabBarForScanCamera(false);
      setHideTabBarForMealQuestions(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const nextTab = tabFromAppRoute(router.path);
    if (nextTab === activeTabRef.current) {
      return;
    }
    setTabWithFade(nextTab);
  }, [isWeb, router.path, setTabWithFade]);

  useEffect(() => {
    if (!isWeb || !quickAddOpen || !webAccountMenuOpen) {
      return;
    }
    closeWebAccountMenu();
  }, [closeWebAccountMenu, isWeb, quickAddOpen, webAccountMenuOpen]);

  useEffect(() => {
    if (!isWeb || !avatarSourceSheetOpen || !webAccountMenuOpen) {
      return;
    }
    closeWebAccountMenu();
  }, [avatarSourceSheetOpen, closeWebAccountMenu, isWeb, webAccountMenuOpen]);

  const tabScenes = (
    <View style={styles.flex1}>
      <Animated.View
        pointerEvents={tab === "dashboard" && !tabTransitioning ? "auto" : "none"}
        style={[
          styles.tabScene,
          isWeb && styles.tabSceneWebOffset,
          {
            opacity: sceneOpacityRef.current.dashboard,
            zIndex: tab === "dashboard" ? 3 : transitionFromTab === "dashboard" ? 2 : 1,
          },
        ]}
      >
        {visitedTabs.dashboard ? <DashboardScreen isActive={tab === "dashboard"} onOpenBodyProgress={() => navigateToTabRoute("body")} /> : null}
      </Animated.View>
      <Animated.View
        pointerEvents={tab === "add" && !tabTransitioning ? "auto" : "none"}
        style={[
          styles.tabScene,
          isWeb && styles.tabSceneWebOffset,
          {
            opacity: sceneOpacityRef.current.add,
            zIndex: tab === "add" ? 3 : transitionFromTab === "add" ? 2 : 1,
          },
        ]}
      >
        {visitedTabs.add ? (
          <AddScreen
            isActive={tab === "add"}
            launchAction={launchAction}
            onLaunchActionHandled={(requestId) => {
              setLaunchAction((current) => {
                if (!current || current.requestId !== requestId) {
                  return current;
                }
                return null;
              });
            }}
            onIntakeSaved={() => navigateToTabRoute("dashboard")}
            onMealSourceSheetVisibilityChange={setHideTabBarForOverlay}
            onScanCameraVisibilityChange={setHideTabBarForScanCamera}
            onMealQuestionsVisibilityChange={setHideTabBarForMealQuestions}
            onBackToPanel={() => navigateToTabRoute("dashboard")}
          />
        ) : null}
      </Animated.View>
      <Animated.View
        pointerEvents={tab === "body" && !tabTransitioning ? "auto" : "none"}
        style={[
          styles.tabScene,
          isWeb && styles.tabSceneWebOffset,
          {
            opacity: sceneOpacityRef.current.body,
            zIndex: tab === "body" ? 3 : transitionFromTab === "body" ? 2 : 1,
          },
        ]}
      >
        {visitedTabs.body ? <BodyProgressScreen /> : null}
      </Animated.View>
      <Animated.View
        pointerEvents={tab === "history" && !tabTransitioning ? "auto" : "none"}
        style={[
          styles.tabScene,
          isWeb && styles.tabSceneWebOffset,
          {
            opacity: sceneOpacityRef.current.history,
            zIndex: tab === "history" ? 3 : transitionFromTab === "history" ? 2 : 1,
          },
        ]}
      >
        {visitedTabs.history ? <HistoryScreen isActive={tab === "history"} /> : null}
      </Animated.View>
      <Animated.View
        pointerEvents={tab === "social" && !tabTransitioning ? "auto" : "none"}
        style={[
          styles.tabScene,
          isWeb && styles.tabSceneWebOffset,
          {
            opacity: sceneOpacityRef.current.social,
            zIndex: tab === "social" ? 3 : transitionFromTab === "social" ? 2 : 1,
          },
        ]}
      >
        {visitedTabs.social ? <SocialScreen /> : null}
      </Animated.View>
      <Animated.View
        pointerEvents={tab === "settings" && !tabTransitioning ? "auto" : "none"}
        style={[
          styles.tabScene,
          isWeb && styles.tabSceneWebOffset,
          {
            opacity: sceneOpacityRef.current.settings,
            zIndex: tab === "settings" ? 3 : transitionFromTab === "settings" ? 2 : 1,
          },
        ]}
      >
        {visitedTabs.settings ? (
          <SettingsScreen
            isActive={tab === "settings"}
            focusSection={tab === "settings" ? settingsFocusSection : null}
            onFocusSectionHandled={() => setSettingsFocusSection(null)}
          />
        ) : null}
      </Animated.View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      {isWeb ? (
        <AppLayout
          onHome={() => closeQuickAdd(() => navigateToTabRoute("dashboard"))}
          navItems={webTabs.map(({ value, label }) => ({
            key: value,
            label,
            active: tab === value,
            onPress: () => {
              closeQuickAdd(() => navigateToTabRoute(value));
            },
          }))}
          account={{
            avatarUrl: auth.user?.avatar_url,
            avatarInitial: webProfileInitial,
            displayName: webProfileName,
            email: auth.user?.email ?? undefined,
            sections: [
              {
                key: "account",
                title: "Cuenta",
                items: [
                  {
                    key: "profile",
                    label: "Ver perfil",
                    description: "Tu perfil social y actividad",
                    onPress: openMySocialProfile,
                  },
                  {
                    key: "edit-profile",
                    label: "Editar perfil",
                    description: "Peso, objetivo y datos base",
                    onPress: openProfileEditor,
                  },
                  {
                    key: "settings",
                    label: "Ajustes",
                    description: "Preferencias, IA y exportación",
                    onPress: openSettingsHome,
                  },
                ],
              },
              {
                key: "personalization",
                title: "Personalización",
                items: [
                  {
                    key: "change-avatar",
                    label: "Cambiar foto",
                    description: "Actualiza tu avatar",
                    onPress: () => {
                      closeQuickAdd();
                      openAvatarSourceSheet();
                    },
                  },
                ],
              },
              {
                key: "session",
                items: [
                  {
                    key: "logout",
                    label: "Cerrar sesión",
                    description: "Cerrar la sesión actual",
                    onPress: () => void auth.logout(),
                    danger: true,
                  },
                ],
              },
            ],
          }}
        >
          {tabScenes}
        </AppLayout>
      ) : (
        tabScenes
      )}

      {!isWeb ? (
        <Animated.View
          pointerEvents={shouldHideTabBar ? "none" : "auto"}
          style={[styles.tabBar, tabBarInsetStyle, { opacity: tabBarAnim, transform: [{ translateY: tabBarTranslateY }] }]}
        >
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
                  closeQuickAdd(() => setTabWithFade(value));
                }}
                style={[styles.tabItem, isCenter && styles.tabItemCenter, active && !isCenter && styles.tabItemActive]}
              >
                {isCenter ? (
                  <View style={[styles.tabPlusButton, quickAddOpen && styles.tabPlusButtonActive]}>
                    <Animated.View style={[styles.tabPlusGlyph, { transform: [{ rotate: quickAddPlusRotate }] }]}>
                      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
                        <Line x1={13} y1={5} x2={13} y2={21} stroke="#04101f" strokeWidth={3} strokeLinecap="round" />
                        <Line x1={5} y1={13} x2={21} y2={13} stroke="#04101f" strokeWidth={3} strokeLinecap="round" />
                      </Svg>
                    </Animated.View>
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
        </Animated.View>
      ) : null}
      {isWeb && !shouldHideAddTrigger ? (
        <View style={styles.webFloatingAddWrap} pointerEvents="box-none">
          <Pressable
            onPress={toggleQuickAdd}
            style={({ pressed }) => [styles.webFloatingAddButton, quickAddOpen && styles.tabPlusButtonActive, pressed && styles.webFloatingAddButtonPressed]}
          >
            <Animated.View style={[styles.tabPlusGlyph, { transform: [{ rotate: quickAddPlusRotate }] }]}>
              <Svg width={30} height={30} viewBox="0 0 26 26" fill="none">
                <Line x1={13} y1={5} x2={13} y2={21} stroke="#04101f" strokeWidth={3} strokeLinecap="round" />
                <Line x1={5} y1={13} x2={21} y2={13} stroke="#04101f" strokeWidth={3} strokeLinecap="round" />
              </Svg>
            </Animated.View>
          </Pressable>
        </View>
      ) : null}
      {isWeb && webAccountMenuVisible ? (
        <View style={[styles.accountMenuLayer, styles.webAccountMenuLayer]} pointerEvents="box-none">
          <Pressable style={styles.accountMenuBackdrop} onPress={() => closeWebAccountMenu()}>
            <Animated.View style={[styles.accountMenuScrim, { opacity: webAccountMenuBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.accountMenuContainer,
              styles.webAccountMenuContainer,
              {
                opacity: webAccountMenuAnim,
                transform: [{ translateY: webAccountMenuTranslateY }, { scale: webAccountMenuScale }],
              },
            ]}
          >
            <Pressable style={styles.accountMenuCard} onPress={() => {}}>
              <Text style={styles.accountMenuTitle}>Mi cuenta</Text>
              <View style={styles.accountMenuAvatarBlock}>
                <Pressable
                  style={({ pressed }) => [styles.accountMenuAvatarPressable, pressed && styles.accountMenuAvatarPressablePressed]}
                  onPress={() =>
                    closeWebAccountMenu(() => {
                      openAvatarSourceSheet();
                    })
                  }
                >
                  <AvatarCircle letter={webProfileInitial} imageUrl={auth.user?.avatar_url} size={72} />
                </Pressable>
                <View style={styles.accountMenuAvatarCopy}>
                  <Text style={styles.accountMenuAvatarName}>@{auth.user?.username ?? "-"}</Text>
                  <Text style={styles.accountMenuAvatarHint}>Pulsa la foto para cambiarla.</Text>
                </View>
              </View>
              {uploadingWebAvatar ? <ActivityIndicator color={theme.accent} /> : null}
              <StatRow label="Usuario" value={auth.user?.username ?? "-"} />
              <StatRow label="Email" value={auth.user?.email ?? "-"} />
              <StatRow label="Email verificado" value={auth.user?.email_verified ? "Sí" : "No"} />
              <StatRow label="Onboarding" value={auth.user?.onboarding_completed ? "Completado" : "Pendiente"} />
              <SecondaryButton
                title="Cerrar sesión"
                onPress={() =>
                  closeWebAccountMenu(() => {
                    void auth.logout();
                  })
                }
              />
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
      {isWeb && avatarSourceSheetVisible ? (
        <View style={[styles.mealSourceSheetLayer, styles.quickAddLayerWeb]} pointerEvents="box-none">
          <Pressable style={styles.mealSourceSheetBackdrop} onPress={() => closeAvatarSourceSheet()}>
            <Animated.View style={[styles.mealSourceSheetScrim, { opacity: avatarSourceSheetBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.mealSourceSheetContainer,
              {
                opacity: avatarSourceSheetAnim,
                transform: [{ translateY: avatarSourceSheetTranslate }, { scale: avatarSourceSheetScale }],
              },
            ]}
          >
            <Pressable style={styles.mealSourceSheetCard} onPress={() => {}}>
              <Text style={styles.mealSourceSheetTitle}>Cambiar foto de perfil</Text>
              <View style={styles.mealSourceSheetOptions}>
                <Pressable
                  style={styles.mealSourceSheetOption}
                  onPress={() =>
                    closeAvatarSourceSheet(() => {
                      void pickWebAvatarFromCamera();
                    })
                  }
                >
                  <View style={styles.mealSourceSheetOptionIconWrap}>
                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                      <Rect x={3} y={6} width={18} height={13} rx={3} stroke={theme.text} strokeWidth={2} />
                      <Circle cx={12} cy={12.5} r={3.2} stroke={theme.text} strokeWidth={2} />
                      <Rect x={7.2} y={4.2} width={3.8} height={2.5} rx={1} fill={theme.text} />
                    </Svg>
                  </View>
                  <Text style={styles.mealSourceSheetOptionTitle}>Tomar foto</Text>
                  <Text style={styles.mealSourceSheetOptionSubtitle}>Usar la cámara</Text>
                </Pressable>
                <Pressable
                  style={styles.mealSourceSheetOption}
                  onPress={() =>
                    closeAvatarSourceSheet(() => {
                      void pickWebAvatarFromLibrary();
                    })
                  }
                >
                  <View style={styles.mealSourceSheetOptionIconWrap}>
                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                      <Rect x={4} y={5} width={16} height={14} rx={2.5} stroke={theme.text} strokeWidth={1.8} />
                      <Circle cx={9} cy={10} r={1.7} fill={theme.text} />
                      <Path d="M6.5 16l3.4-3.3 2.4 2.2 2.4-2.2 2.8 3.3" stroke={theme.text} strokeWidth={1.8} strokeLinecap="round" />
                    </Svg>
                  </View>
                  <Text style={styles.mealSourceSheetOptionTitle}>Subir imagen</Text>
                  <Text style={styles.mealSourceSheetOptionSubtitle}>Elegir de galería</Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
      {quickAddVisible ? (
        <View style={[styles.quickAddLayer, isWeb && styles.quickAddLayerWeb, quickAddInsetStyle]} pointerEvents="box-none">
          <Pressable style={styles.quickAddBackdrop} onPress={() => closeQuickAdd()}>
            <Animated.View style={[styles.quickAddScrim, { opacity: quickAddBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.quickAddSheetContainer,
              isWeb && styles.quickAddSheetContainerWeb,
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
                  action="recipes"
                  title="Crear recetas"
                  subtitle="Recetas propias manuales o con IA"
                  accent="#ffcf6b"
                  onPress={() => runQuickAction("recipes")}
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
  const isWeb = Platform.OS === "web";
  const router = useWebRouter();
  const initialAuthenticatedEntryHandledRef = useRef(false);

  useEffect(() => {
    if (!auth.user || !auth.user.email_verified || !auth.user.onboarding_completed) {
      initialAuthenticatedEntryHandledRef.current = false;
    }
  }, [auth.user]);

  useEffect(() => {
    if (!isWeb || auth.loading) {
      return;
    }
    const currentPath = normalizeWebPath(router.path);

    if (!auth.user && !auth.pendingVerificationEmail) {
      if (currentPath === "/login" || currentPath === "/register" || currentPath === "/") {
        return;
      }
      router.replace("/");
      return;
    }

    if ((auth.user && !auth.user.email_verified) || auth.pendingVerificationEmail) {
      if (currentPath !== "/verify") {
        router.replace("/verify");
      }
      return;
    }

    if (auth.user && auth.user.email_verified && !auth.user.onboarding_completed) {
      if (currentPath !== "/onboarding") {
        router.replace("/onboarding");
      }
      return;
    }

    if (!initialAuthenticatedEntryHandledRef.current) {
      initialAuthenticatedEntryHandledRef.current = true;
      if (currentPath === "/" && shouldRedirectAuthenticatedRootToApp()) {
        router.replace("/app/dashboard");
        return;
      }
    }

    if (!isAppRoute(currentPath) && currentPath !== "/") {
      router.replace("/app/dashboard");
    }
  }, [auth.loading, auth.pendingVerificationEmail, auth.user, isWeb, router]);

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

  if (isWeb && normalizeWebPath(router.path) === "/") {
    return (
      <WelcomeScreen
        onCreate={() => router.navigate("/app/dashboard")}
        onLogin={() => router.navigate("/app/social")}
        onHome={() => router.navigate("/app/dashboard")}
        createLabel="Ir al panel"
        loginLabel="Ir a Social"
        topbarNavItems={[
          { key: "dashboard", label: "Panel", active: false, onPress: () => router.navigate("/app/dashboard") },
          { key: "body", label: "Cuerpo", active: false, onPress: () => router.navigate("/app/body") },
          { key: "social", label: "Social", active: false, onPress: () => router.navigate("/app/social") },
          { key: "history", label: "Historial", active: false, onPress: () => router.navigate("/app/history") },
          { key: "settings", label: "Ajustes", active: false, onPress: () => router.navigate("/app/settings") },
        ]}
        topbarAccount={{
          avatarUrl: auth.user?.avatar_url,
          avatarInitial: auth.user?.username?.slice(0, 1).toUpperCase() || "N",
          displayName: auth.user?.username?.trim() || auth.user?.email?.split("@")[0] || "Usuario",
          email: auth.user?.email ?? undefined,
          sections: [
            {
              key: "account",
              title: "Cuenta",
              items: [
                {
                  key: "profile",
                  label: "Ver perfil",
                  description: "Tu perfil social y actividad",
                  onPress: () => {
                    const username = auth.user?.username?.trim();
                    if (username) {
                      router.navigate(socialProfileRoute(username));
                      return;
                    }
                    router.navigate("/app/social");
                  },
                },
                {
                  key: "edit-profile",
                  label: "Editar perfil",
                  description: "Peso, objetivo y datos base",
                  onPress: () => router.navigate("/app/settings"),
                },
                {
                  key: "settings",
                  label: "Ajustes",
                  description: "Preferencias, IA y exportación",
                  onPress: () => router.navigate("/app/settings"),
                },
              ],
            },
            {
              key: "session",
              items: [
                {
                  key: "logout",
                  label: "Cerrar sesión",
                  description: "Cerrar la sesión actual",
                  onPress: () => void auth.logout(),
                  danger: true,
                },
              ],
            },
          ],
        }}
      />
    );
  }

  return <MainAppTabs />;
}

export default function App() {
  return (
    <I18nProvider>
      <WebRouterProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
          <InAppAlertHost />
        </AuthProvider>
      </WebRouterProvider>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  tabScene: {
    ...StyleSheet.absoluteFillObject,
  },
  tabSceneWebOffset: {
    top: WEB_CHROME_TOTAL_HEIGHT,
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
  skeletonLineLg: {
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    width: "68%",
    marginBottom: 10,
  },
  skeletonLineMd: {
    height: 16,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.075)",
    width: "52%",
    marginBottom: 10,
  },
  skeletonLineSm: {
    height: 13,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.065)",
    width: "100%",
    marginBottom: 8,
  },
  skeletonBlockTall: {
    height: 110,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    width: "100%",
  },
  skeletonRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  skeletonRing: {
    flex: 1,
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  skeletonTile: {
    flex: 1,
    minHeight: 84,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  headerWrap: {
    gap: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 30,
  },
  headerTopSpacer: {
    width: 76,
    height: 30,
  },
  headerBackButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 30,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  headerBackIcon: {
    color: theme.muted,
    fontSize: 23,
    fontWeight: "800",
  },
  headerRightAction: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 30,
    justifyContent: "center",
  },
  headerRightActionText: {
    color: theme.protein,
    fontSize: 15,
    fontWeight: "600",
  },
  headerTitle: {
    color: theme.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerTitleTablet: {
    fontSize: 36,
    lineHeight: 40,
  },
  headerTitleDesktop: {
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  headerSubtitleTablet: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 760,
  },
  headerSubtitleDesktop: {
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 920,
  },
  authScroll: {
    width: "100%",
    alignSelf: "center",
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: Platform.OS === "web" ? 24 : 20,
    gap: 14,
  },
  authScrollWebOffset: {
    paddingTop: WEB_TOPBAR_HEIGHT + 28,
  },
  authWebTopShell: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
    backgroundColor: "#0d1016",
    borderBottomWidth: 1,
    borderBottomColor: theme.topbarBorder,
  },
  authWebTopBar: {
    height: WEB_TOPBAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: 1520,
    alignSelf: "center",
  },
  authWebTopSpacer: {
    width: 50,
    height: 50,
  },
  authWebTopControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  authWebLanguageSwitch: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#131821",
    padding: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  authWebLanguageOption: {
    minWidth: 72,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
  },
  authWebLanguageOptionActive: {
    backgroundColor: "#1c232d",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.18)",
  },
  authWebLanguageOptionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  authWebLanguageFlag: {
    fontSize: 16,
  },
  authWebLanguageCode: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  authWebLanguageCodeActive: {
    color: theme.text,
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
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldLabelDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  fieldLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    backgroundColor: theme.inputBg,
  },
  inputFocused: {
    borderColor: theme.inputFocusBorder,
  },
  inputInvalid: {
    borderColor: theme.danger,
  },
  fieldHelperText: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  fieldHelperTextInvalid: {
    color: theme.danger,
  },
  webDateFieldWrap: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 14,
    backgroundColor: theme.inputBg,
  },
  webDateNativeInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 14,
    fontWeight: "600",
    minHeight: 46,
  },
  dateFieldButton: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.inputBg,
  },
  dateFieldButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "600",
  },
  birthDatePickerWrap: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 14,
    padding: 8,
    backgroundColor: theme.inputBg,
    gap: 8,
  },
  birthDateCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: theme.panel,
    gap: 10,
  },
  birthDateCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  birthDateCardTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  birthDateCardSubtitle: {
    color: theme.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
    maxWidth: 320,
  },
  birthDateAgePill: {
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.28)",
    backgroundColor: "rgba(45,212,191,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 54,
  },
  birthDateAgeValue: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "800",
  },
  birthDateAgeLabel: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  birthDateSegmentRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  birthDateSegmentCard: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 14,
    backgroundColor: theme.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  birthDateSegmentCardSmall: {
    minWidth: 82,
    flexGrow: 0.9,
  },
  birthDateSegmentCardLarge: {
    minWidth: 110,
    flexGrow: 1.1,
  },
  birthDateSegmentLabel: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  birthDateSegmentInput: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "700",
    paddingVertical: 0,
  },
  googleAuthCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    backgroundColor: theme.panel,
    padding: 18,
    gap: 10,
  },
  googleAuthCardDisabled: {
    opacity: 0.65,
  },
  googleAuthTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  googleAuthSubtitle: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  googleAuthButtonHost: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  googleAuthInlineWrap: {
    width: "100%",
    alignItems: "center",
    gap: 12,
  },
  googleAuthInlineMissing: {
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.24)",
    borderRadius: 16,
    backgroundColor: "rgba(251,191,36,0.08)",
    padding: 14,
    gap: 6,
  },
  googleAuthInlineMissingTitle: {
    color: "#fbbf24",
    fontSize: 14,
    fontWeight: "700",
  },
  googleAuthInlineMissingText: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  googleAuthInlineHelper: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 420,
  },
  googleAuthButtonHostInline: {
    width: "100%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  webLandingScreen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  webLandingScroll: {
    flexGrow: 1,
    paddingTop: WEB_TOPBAR_HEIGHT + 42,
    paddingBottom: 72,
    paddingHorizontal: 34,
    gap: 52,
  },
  webLandingHeroSection: {
    position: "relative",
    width: "100%",
    maxWidth: 1500,
    alignSelf: "center",
    gap: 24,
  },
  webLandingHeroSectionDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 48,
  },
  webLandingHeroAmbientLeft: {
    position: "absolute",
    width: 520,
    height: 160,
    borderRadius: 56,
    top: -14,
    left: -120,
    backgroundColor: "rgba(45,212,191,0.06)",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.08)",
    transform: [{ rotate: "-12deg" }],
  },
  webLandingHeroAmbientRight: {
    position: "absolute",
    width: 620,
    height: 190,
    borderRadius: 64,
    right: -160,
    top: 84,
    backgroundColor: "rgba(96,165,250,0.06)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.08)",
    transform: [{ rotate: "14deg" }],
  },
  webLandingHeroCopy: {
    flex: 1.08,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#11131a",
    paddingHorizontal: 42,
    paddingVertical: 44,
    gap: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.26,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 24 },
  },
  webLandingHeroPreview: {
    flex: 0.95,
    minHeight: 580,
    justifyContent: "center",
  },
  webLandingEyebrow: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  webLandingHeroTitle: {
    color: theme.text,
    fontSize: 60,
    lineHeight: 66,
    fontWeight: "800",
    maxWidth: 760,
  },
  webLandingHeroSubtitle: {
    color: "#b5bac3",
    fontSize: 19,
    lineHeight: 30,
    maxWidth: 680,
  },
  webLandingHeroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingTop: 4,
  },
  webLandingPrimaryCta: {
    minWidth: 176,
  },
  webLandingSecondaryCta: {
    minWidth: 176,
  },
  webLandingHeroSignalRow: {
    gap: 12,
    paddingTop: 12,
  },
  webLandingHeroSignalRowDesktop: {
    flexDirection: "row",
  },
  webLandingHeroSignalCard: {
    flex: 1,
    minWidth: 164,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#151922",
    paddingHorizontal: 18,
    paddingVertical: 15,
    gap: 7,
  },
  webLandingHeroSignalLine: {
    width: 42,
    height: 4,
    borderRadius: 999,
  },
  webLandingHeroSignalLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  webLandingHeroSignalValue: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  webLandingMockupStage: {
    minHeight: 580,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  webLandingMockupGlow: {
    position: "absolute",
    width: "84%",
    height: "78%",
    borderRadius: 72,
    backgroundColor: "rgba(45,212,191,0.12)",
    transform: [{ scale: 1.12 }],
    shadowColor: theme.accent,
    shadowOpacity: 0.3,
    shadowRadius: 56,
    shadowOffset: { width: 0, height: 0 },
  },
  webLandingMockupPrimary: {
    width: "100%",
    maxWidth: 640,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#10141b",
    paddingHorizontal: 30,
    paddingVertical: 30,
    gap: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 26 },
  },
  webLandingMockupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  webLandingMockupHeaderCopy: {
    gap: 4,
    flex: 1,
  },
  webLandingMockupEyebrow: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  webLandingMockupTitle: {
    color: theme.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  webLandingMockupStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.22)",
    backgroundColor: "rgba(45,212,191,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webLandingMockupStatusText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  webLandingMockupHeroMetric: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#151a22",
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  webLandingMockupHeroMetricValue: {
    color: theme.text,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: "800",
  },
  webLandingMockupHeroMetricLabel: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  webLandingMockupMacroGrid: {
    flexDirection: "row",
    gap: 12,
  },
  webLandingMockupMacroCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#12171f",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  webLandingMockupMacroDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  webLandingMockupMacroLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  webLandingMockupMacroValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  webLandingMockupList: {
    gap: 12,
  },
  webLandingMockupListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#12171e",
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  webLandingMockupListAccent: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  webLandingMockupListText: {
    flex: 1,
    color: theme.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  webLandingMockupSecondary: {
    position: "absolute",
    right: 8,
    top: 18,
    width: 220,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#141922",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  webLandingMockupTertiary: {
    position: "absolute",
    left: 8,
    bottom: 12,
    width: 220,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#17131c",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  webLandingMockupMiniEyebrow: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  webLandingMockupMiniTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23,
  },
  webLandingMockupMiniText: {
    color: "#aeb4bf",
    fontSize: 12,
    lineHeight: 19,
  },
  webLandingMockupRecommendation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  webLandingMockupRecommendationStar: {
    color: "#facc15",
    fontSize: 15,
    fontWeight: "900",
  },
  webLandingMockupRecommendationText: {
    flex: 1,
    color: theme.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  webLandingSection: {
    width: "100%",
    maxWidth: 1500,
    alignSelf: "center",
    gap: 22,
  },
  webLandingSectionHeader: {
    gap: 10,
    maxWidth: 820,
  },
  webLandingSectionTitle: {
    color: theme.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
  },
  webLandingSectionSubtitle: {
    color: "#aeb4bf",
    fontSize: 15,
    lineHeight: 24,
  },
  webLandingValueLayout: {
    gap: 18,
  },
  webLandingValueLayoutDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 28,
  },
  webLandingValueLead: {
    flex: 1.15,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#11151c",
    paddingHorizontal: 28,
    paddingVertical: 28,
    gap: 18,
  },
  webLandingValueLeadAccent: {
    width: 68,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  webLandingValueLeadTitle: {
    color: theme.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    maxWidth: 520,
  },
  webLandingValueLeadText: {
    color: "#aeb4bf",
    fontSize: 14,
    lineHeight: 23,
    maxWidth: 620,
  },
  webLandingValueBullets: {
    gap: 12,
    paddingTop: 2,
  },
  webLandingValueBullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  webLandingValueBulletDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  webLandingValueBulletCopy: {
    flex: 1,
    gap: 4,
  },
  webLandingValueBulletTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  webLandingValueBulletText: {
    color: "#aeb4bf",
    fontSize: 13,
    lineHeight: 20,
  },
  webLandingFeatureRail: {
    flex: 0.92,
    gap: 14,
    justifyContent: "space-between",
  },
  webLandingFeatureCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    minHeight: 132,
  },
  webLandingFeatureAccent: {
    width: 44,
    height: 4,
    borderRadius: 999,
  },
  webLandingFeatureTitle: {
    color: theme.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },
  webLandingFeatureText: {
    color: "#aeb4bf",
    fontSize: 13,
    lineHeight: 21,
  },
  webLandingFeatureSummary: {
    paddingTop: 8,
    gap: 8,
  },
  webLandingFeatureSummaryTitle: {
    color: theme.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
  },
  webLandingFeatureSummaryText: {
    color: "#aeb4bf",
    fontSize: 14,
    lineHeight: 23,
  },
  webLandingTimeline: {
    gap: 18,
    position: "relative",
  },
  webLandingTimelineDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 18,
    paddingTop: 18,
  },
  webLandingTimelineStep: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#11151c",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  webLandingTimelineStepDesktop: {
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    paddingRight: 0,
    gap: 16,
  },
  webLandingTimelineHead: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 0,
  },
  webLandingTimelineConnector: {
    flex: 1,
    height: 2,
    backgroundColor: "#1c242f",
    marginLeft: 12,
    borderRadius: 999,
  },
  webLandingTimelineBody: {
    gap: 8,
  },
  webLandingTimelineNode: {
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.38)",
    backgroundColor: "#121a1d",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.accent,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  webLandingTimelineNodeText: {
    color: theme.accent,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  webLandingTimelineTitle: {
    color: theme.text,
    fontSize: 21,
    fontWeight: "800",
  },
  webLandingTimelineText: {
    color: "#b2b7c1",
    fontSize: 15,
    lineHeight: 24,
  },
  webLandingFinalSection: {
    position: "relative",
    width: "100%",
    maxWidth: 1500,
    alignSelf: "center",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#10141b",
    paddingHorizontal: 34,
    paddingVertical: 34,
    marginTop: 6,
    overflow: "hidden",
  },
  webLandingFinalGlow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 999,
    top: -120,
    right: -80,
    backgroundColor: "rgba(45,212,191,0.12)",
  },
  webLandingFinalInner: {
    gap: 18,
  },
  webLandingFinalInnerDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 36,
  },
  webLandingFinalCopy: {
    flex: 1,
    gap: 10,
    maxWidth: 760,
  },
  webLandingFinalTitle: {
    color: theme.text,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "800",
  },
  webLandingFinalSubtitle: {
    color: "#b2b7c1",
    fontSize: 16,
    lineHeight: 25,
  },
  webLandingFinalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 4,
    alignItems: "center",
  },
  webLandingFinalActionsDesktop: {
    justifyContent: "flex-end",
    minWidth: 320,
  },
  webLandingFinalPrimaryCta: {
    minWidth: 196,
    minHeight: 54,
  },
  webLandingFinalSecondaryCta: {
    minWidth: 152,
  },
  webOnboardingScreen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  webOnboardingScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: WEB_TOPBAR_HEIGHT + 28,
    paddingBottom: 42,
    gap: 22,
  },
  webOnboardingCenterWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: WEB_TOPBAR_HEIGHT + 28,
    paddingBottom: 24,
  },
  webOnboardingBrandBlock: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 10,
  },
  webOnboardingBrandEyebrow: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  webOnboardingBrandTitle: {
    color: theme.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
  },
  webOnboardingBrandSubtitle: {
    color: theme.muted,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 560,
  },
  webOnboardingCard: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    backgroundColor: theme.panel,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 6,
    gap: 20,
  },
  webAuthCardCompact: {
    maxWidth: 560,
    paddingHorizontal: 30,
    paddingVertical: 28,
    gap: 22,
  },
  webAuthHeader: {
    gap: 9,
    alignItems: "center",
  },
  webAuthCardTitle: {
    color: theme.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  webAuthCardSubtitle: {
    color: theme.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  webAuthErrorCard: {
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.28)",
    borderRadius: 14,
    backgroundColor: "rgba(248, 113, 113, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  webAuthErrorText: {
    color: "#fda4a4",
    fontSize: 13,
    lineHeight: 19,
  },
  webAuthLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 4,
  },
  webAuthLinkLabel: {
    color: theme.muted,
    fontSize: 13,
  },
  webAuthLinkAction: {
    paddingVertical: 4,
  },
  webAuthLinkActionPressed: {
    opacity: 0.82,
  },
  webAuthLinkActionText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  webOnboardingFinalizeCard: {
    maxWidth: 560,
    alignItems: "center",
  },
  webWizardProgressWrap: {
    marginBottom: 2,
  },
  webWizardProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: theme.panelMuted,
    overflow: "hidden",
  },
  webWizardProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  webOnboardingStepShell: {
    position: "relative",
    minHeight: Platform.OS === "web" ? 470 : 0,
    overflow: "hidden",
  },
  webOnboardingStepPane: {
    width: "100%",
  },
  webOnboardingStepPaneOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  webOnboardingStepPaneContent: {
    gap: 18,
  },
  webOnboardingStepTitle: {
    color: theme.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
  },
  webOnboardingStepSubtitle: {
    color: theme.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: -4,
  },
  webOnboardingStepBody: {
    gap: 16,
  },
  webOnboardingFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  webOnboardingSecondaryBtn: {
    minHeight: 52,
    justifyContent: "center",
    minWidth: 132,
    backgroundColor: theme.secondaryButtonBg,
    borderColor: theme.secondaryButtonBorder,
  },
  webOnboardingSecondaryBtnText: {
    color: theme.text,
  },
  webOnboardingPrimaryBtn: {
    flex: 1,
    minHeight: 52,
    justifyContent: "center",
  },
  webWizardSectionStack: {
    gap: 16,
  },
  webWizardFieldSection: {
    gap: 10,
  },
  webWizardFieldSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  webWizardSectionLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  webWizardSectionHelper: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  webWizardFieldCompact: {
    gap: 6,
  },
  webWizardFieldLabel: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  webWizardFieldInput: {
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    color: theme.text,
    minHeight: 52,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  webWizardInlineNote: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: theme.panelSoft,
    borderWidth: 1,
    borderColor: theme.border,
  },
  webWizardInlineNoteText: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  webWizardOptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  webWizardOptionColumn: {
    gap: 12,
  },
  webWizardOptionCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 8,
  },
  webWizardOptionCardActive: {
    borderColor: "rgba(45,212,191,0.5)",
    backgroundColor: theme.accentSoft,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  webWizardOptionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  webWizardOptionCardTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  webWizardOptionCardTitleActive: {
    color: theme.text,
  },
  webWizardOptionCardSubtitle: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  webWizardOptionCardSubtitleActive: {
    color: theme.text,
  },
  webWizardOptionCardRecommended: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  webWizardChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  webWizardChoiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  webWizardChoiceChipActive: {
    borderColor: "rgba(45,212,191,0.55)",
    backgroundColor: theme.accentSoft,
  },
  webWizardChoiceChipText: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  webWizardChoiceChipTextActive: {
    color: theme.text,
  },
  webWizardBirthRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  webWizardBirthCell: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 16,
    backgroundColor: theme.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  webWizardBirthCellSmall: {
    minWidth: 86,
    flexGrow: 0.8,
  },
  webWizardBirthCellLarge: {
    minWidth: 118,
    flexGrow: 1.1,
  },
  webWizardBirthLabel: {
    color: theme.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  webWizardBirthInput: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    paddingVertical: 2,
  },
  webWizardAgePill: {
    borderRadius: 999,
    backgroundColor: "rgba(45,212,191,0.12)",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  webWizardAgePillText: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  webWizardMetricGrid: {
    gap: 12,
  },
  webWizardImperialHeightRow: {
    flexDirection: "row",
    gap: 12,
  },
  webWizardSummaryStrip: {
    flexDirection: "row",
    gap: 12,
  },
  webWizardSummaryMetric: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  webWizardSummaryMetricLabel: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  webWizardSummaryMetricValue: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
  },
  webWizardCheckboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  webWizardCheckboxBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  webWizardCheckboxBoxChecked: {
    borderColor: theme.accent,
    backgroundColor: theme.accent,
  },
  webWizardCheckboxTick: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  webWizardCheckboxLabel: {
    flex: 1,
    color: theme.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  webWizardDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 6,
  },
  webWizardDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  webWizardDividerText: {
    color: "#95a0ae",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  webOnboardingErrorText: {
    color: theme.danger,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  passwordStrengthWrap: {
    gap: 8,
    marginTop: -2,
    marginBottom: 2,
  },
  passwordStrengthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  passwordStrengthLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  passwordStrengthTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: theme.panelMuted,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
  },
  passwordStrengthFill: {
    height: "100%",
    borderRadius: 999,
  },
  usernameStatusText: {
    fontSize: 12,
    color: theme.muted,
    marginTop: -2,
  },
  usernameStatusTextOk: {
    color: theme.ok,
  },
  usernameStatusTextError: {
    color: theme.danger,
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.panelMuted,
  },
  readOnlyFieldValue: {
    color: theme.text,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: theme.primaryButtonBg,
    borderWidth: 1,
    borderColor: theme.primaryButtonBg,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonHover: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonText: {
    color: theme.primaryButtonText,
    fontSize: 15,
    fontWeight: "700",
  },
  buttonLoadingContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonLoadingText: {
    color: theme.primaryButtonText,
  },
  mealQuestionProgressButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  mealQuestionProgressRingWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  mealQuestionProgressPercent: {
    position: "absolute",
    color: "#050505",
    fontSize: 10,
    fontWeight: "800",
  },
  mealQuestionProgressPhase: {
    color: theme.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.secondaryButtonBorder,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.secondaryButtonBg,
  },
  secondaryButtonHover: {
    backgroundColor: theme.panelMuted,
  },
  secondaryButtonPressed: {
    opacity: 0.92,
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
  appCardTablet: {
    borderRadius: 26,
    padding: 22,
    gap: 16,
  },
  appCardDesktop: {
    borderRadius: 28,
    padding: 26,
    gap: 18,
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
  sectionHeaderTitleTablet: {
    fontSize: 19,
  },
  sectionHeaderTitleDesktop: {
    fontSize: 22,
    letterSpacing: 0.2,
  },
  sectionHeaderSubtitle: {
    color: theme.muted,
    fontSize: 12,
  },
  sectionHeaderSubtitleTablet: {
    fontSize: 13,
  },
  sectionHeaderSubtitleDesktop: {
    fontSize: 14,
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
  settingsInlineActions: {
    gap: 8,
    marginTop: 2,
  },
  profileAvatarSection: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 6,
  },
  profileAvatarActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  settingsCollapsedSummary: {
    gap: 6,
  },
  socialRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  socialRowCopy: {
    flex: 1,
    gap: 4,
  },
  socialUserName: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 15 : 14,
    fontWeight: "700",
  },
  socialActionButton: {
    minWidth: 104,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: theme.accent,
  },
  socialActionButtonDisabled: {
    opacity: 0.6,
  },
  socialActionButtonText: {
    color: theme.primaryButtonText,
    fontSize: 13,
    fontWeight: "800",
  },
  socialMainContent: {
    paddingBottom: Platform.OS === "web" ? 156 : 118,
    gap: 16,
  },
  socialHeroPanel: {
    gap: 12,
  },
  socialHeroShell: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    alignItems: Platform.OS === "web" ? "center" : "stretch",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#262b33",
    backgroundColor: "#10141a",
    padding: Platform.OS === "web" ? 22 : 18,
    gap: 16,
  },
  socialHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  socialHeroEyebrow: {
    color: "#8f98a6",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  socialHeroTitle: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 31 : 25,
    fontWeight: "900",
    letterSpacing: -0.65,
  },
  socialHeroSubtitle: {
    color: "#b7bfcb",
    fontSize: Platform.OS === "web" ? 14 : 14,
    lineHeight: Platform.OS === "web" ? 22 : 21,
    maxWidth: 720,
  },
  socialHeroInlineMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  socialHeroInlineMetaText: {
    color: "#8f98a6",
    fontSize: 12,
    fontWeight: "700",
  },
  socialHeroInlineMetaDot: {
    color: "#55606e",
    fontSize: 11,
    fontWeight: "800",
  },
  socialHeroActions: {
    width: Platform.OS === "web" ? 290 : "100%",
    maxWidth: "100%",
    gap: 10,
  },
  socialHeroPrimaryAction: {
    minHeight: 52,
    paddingHorizontal: 18,
  },
  socialHeroPrimaryActionText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.1,
  },
  socialHeroActionHint: {
    color: "#8f98a6",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 280,
  },
  socialHeroNavWrap: {
    marginTop: 4,
  },
  socialHeroFiltersWrap: {
    marginTop: 8,
  },
  socialCreatePromptCard: {
    gap: 14,
    backgroundColor: "#10151b",
    borderColor: "#222a35",
  },
  socialCreatePromptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  socialCreatePromptIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  socialCreatePromptCopy: {
    flex: 1,
    gap: 4,
  },
  socialCreatePromptTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  socialCreatePromptSubtitle: {
    color: "#aeb7c4",
    fontSize: 13,
    lineHeight: 19,
  },
  socialCreateInlineButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  socialCreateInlineButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  socialCreatePromptInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26303b",
    backgroundColor: "#141922",
    paddingHorizontal: 16,
    paddingVertical: 15,
    minHeight: 54,
    justifyContent: "center",
  },
  socialCreatePromptPlaceholder: {
    color: "#9099a7",
    fontSize: 14,
    lineHeight: 21,
  },
  socialCreateQuickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialCreateQuickChip: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 170 : 148,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#26303b",
    backgroundColor: "#141922",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    minHeight: 72,
    justifyContent: "center",
  },
  socialCreateQuickChipTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  socialCreateQuickChipMeta: {
    color: "#929ba9",
    fontSize: 12,
    lineHeight: 17,
  },
  socialFeedGap: {
    height: 6,
  },
  socialSearchCard: {
    gap: 14,
  },
  socialNetworkSectionCard: {
    gap: 14,
  },
  socialUserCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  socialUserCard: {
    flexBasis: Platform.OS === "web" ? "48%" : "100%",
    gap: 12,
    backgroundColor: "#11151c",
    borderColor: "#242c36",
  },
  socialUserCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  socialUserCardIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  socialUserCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  socialUserCardHandle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  socialUserCardSubtitle: {
    color: "#9aa3b1",
    fontSize: 13,
    lineHeight: 19,
  },
  socialUserCardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginLeft: "auto",
  },
  socialUserCardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  socialInteractivePressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  socialSegmentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 0,
    marginBottom: 0,
  },
  socialFilterBlock: {
    gap: 10,
    marginTop: 2,
    marginBottom: 2,
  },
  socialFilterSection: {
    gap: 8,
  },
  socialFilterLabel: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  socialFilterDropdownRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialFilterSelect: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#262f39",
    backgroundColor: "#10151d",
    paddingHorizontal: 15,
    paddingVertical: 11,
    minHeight: 42,
    justifyContent: "center",
  },
  socialFilterSelectPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  socialFilterSelectValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  socialFilterSelectLabel: {
    color: "#8f98a6",
    fontSize: 12,
    fontWeight: "700",
  },
  socialFilterSelectDivider: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  socialFilterSelectValue: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
  },
  socialFilterSelectChevron: {
    color: "#8f98a6",
    fontSize: 12,
    fontWeight: "800",
  },
  socialFilterModalCard: {
    maxWidth: Platform.OS === "web" ? 460 : 420,
  },
  socialFilterOptionList: {
    gap: 10,
  },
  socialFilterOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  socialFilterOptionActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  socialFilterOptionCopy: {
    flex: 1,
    gap: 4,
  },
  socialFilterOptionTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  socialFilterOptionTitleActive: {
    color: theme.text,
  },
  socialFilterOptionMeta: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  socialFilterOptionCheck: {
    color: theme.accent,
    fontSize: 18,
    fontWeight: "900",
  },
  socialFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  socialFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  socialFilterChipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  socialFilterChipText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  socialFilterChipTextActive: {
    color: theme.text,
  },
  socialSegmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#26303b",
    backgroundColor: "#10151d",
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 42,
  },
  socialSegmentChipActive: {
    borderColor: "rgba(45,212,191,0.34)",
    backgroundColor: "rgba(45,212,191,0.12)",
  },
  socialSegmentChipText: {
    color: "#98a1ae",
    fontSize: 13,
    fontWeight: "800",
  },
  socialSegmentChipTextActive: {
    color: theme.text,
  },
  socialSegmentBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.border,
  },
  socialSegmentBadgeActive: {
    backgroundColor: "rgba(11,11,13,0.34)",
    borderColor: "rgba(45,212,191,0.45)",
  },
  socialSegmentBadgeText: {
    color: theme.text,
    fontSize: 11,
    fontWeight: "800",
  },
  socialStatusCard: {
    gap: 10,
    backgroundColor: "#131922",
    borderColor: "#26303c",
  },
  socialSkeletonList: {
    gap: 12,
  },
  socialPostCard: {
    gap: 14,
    overflow: "hidden",
    backgroundColor: "#10151b",
    borderColor: "#222a35",
  },
  socialPostAccentBar: {
    height: 2,
    borderRadius: 999,
    marginBottom: 0,
  },
  socialSkeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  socialSkeletonAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: theme.panelSoft,
    borderWidth: 1,
    borderColor: theme.border,
  },
  socialSkeletonHeaderCopy: {
    flex: 1,
    gap: 8,
  },
  socialSkeletonMedia: {
    width: "100%",
    height: Platform.OS === "web" ? 320 : 240,
    borderRadius: 18,
    backgroundColor: theme.panelSoft,
    borderWidth: 1,
    borderColor: theme.border,
  },
  socialSkeletonActions: {
    flexDirection: "row",
    gap: 10,
  },
  socialSkeletonActionPill: {
    width: 88,
    height: 38,
    borderRadius: 999,
    backgroundColor: theme.panelSoft,
    borderWidth: 1,
    borderColor: theme.border,
  },
  socialPostHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  socialPostUserWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  socialPostUserCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  socialPostIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  socialPostUserName: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 15 : 15,
    fontWeight: "800",
  },
  socialPostMetaContext: {
    color: "#8ed8cd",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  socialPostMeta: {
    color: "#96a0ad",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  socialPostBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
  },
  socialTypeBadge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
  },
  socialTypeBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  socialPostHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  socialPostManageButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2a313c",
    backgroundColor: "#151a22",
  },
  socialPostManageButtonText: {
    color: theme.text,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: "800",
    marginTop: -4,
  },
  socialMediaCarousel: {
    gap: 8,
  },
  socialMediaImage: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#252d38",
    backgroundColor: "#151922",
  },
  socialCaptionWrap: {
    gap: 8,
  },
  socialCaptionText: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 22,
  },
  socialCaptionToggle: {
    alignSelf: "flex-start",
  },
  socialCaptionToggleText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  socialRecipeCard: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#131821",
    padding: 15,
  },
  socialRecipeHeader: {
    gap: 8,
  },
  socialRecipeTitle: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 18 : 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  socialMiniMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  socialRecipeMetaText: {
    color: "#95a0ae",
    fontSize: 12,
    fontWeight: "700",
  },
  socialRecipeMacroSummary: {
    marginTop: 2,
  },
  socialRecipeListBlock: {
    gap: 6,
  },
  socialRecipeListTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  socialRecipeListText: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 20,
  },
  socialRecipeListMore: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  socialNutritionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  socialNutritionPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  socialNutritionPillKcal: {
    backgroundColor: "rgba(45,212,191,0.12)",
    borderColor: "rgba(45,212,191,0.34)",
  },
  socialNutritionPillProtein: {
    backgroundColor: "rgba(96,165,250,0.12)",
    borderColor: "rgba(96,165,250,0.34)",
  },
  socialNutritionPillCarbs: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.34)",
  },
  socialNutritionPillFat: {
    backgroundColor: "rgba(236,72,153,0.12)",
    borderColor: "rgba(236,72,153,0.34)",
  },
  socialNutritionPillText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
  },
  socialProgressGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialProgressPanel: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#131821",
    padding: 15,
  },
  socialProgressStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  socialProgressStat: {
    minWidth: 120,
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#10151c",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  socialProgressStatLabel: {
    color: "#96a0ad",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  socialProgressStatValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  socialProgressNotes: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    padding: 12,
  },
  socialProgressNotesText: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 19,
  },
  socialActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#252d37",
    backgroundColor: "#121720",
    paddingHorizontal: 13,
    paddingVertical: 10,
    minWidth: 0,
    minHeight: 42,
  },
  socialActionPillActive: {
    borderColor: "rgba(236,72,153,0.38)",
    backgroundColor: "rgba(236,72,153,0.12)",
  },
  socialActionPillLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "900",
  },
  socialActionPillLabelActive: {
    color: theme.fats,
  },
  socialActionPillText: {
    color: "#aab2bf",
    fontSize: 12,
    fontWeight: "700",
  },
  socialActionPillTextActive: {
    color: theme.text,
  },
  socialDirectoryList: {
    gap: 4,
  },
  socialDirectoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  socialDirectoryUserPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  socialDirectoryCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  socialDirectoryRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 96,
  },
  socialRequestCard: {
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  socialRequestActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialProfileHero: {
    gap: 16,
    backgroundColor: "#11151c",
    borderColor: "#252d38",
    overflow: "hidden",
  },
  socialProfileCoverGlow: {
    position: "absolute",
    top: -80,
    right: -20,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(45,212,191,0.08)",
  },
  socialProfileTopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  socialProfileIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  socialProfileIdentityCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  socialProfileHandle: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 22 : 19,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  socialProfileEmail: {
    color: "#a8b1be",
    fontSize: 13,
    lineHeight: 19,
  },
  socialProfileMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  socialProfileActions: {
    alignItems: "flex-end",
    marginLeft: "auto",
  },
  socialProfileStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialProfileSectionHeader: {
    gap: 4,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  socialProfileSectionTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.25,
  },
  socialProfileSectionSubtitle: {
    color: "#9aa3b1",
    fontSize: 13,
    lineHeight: 19,
  },
  socialModalLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: Platform.OS === "web" ? 28 : 14,
    paddingVertical: 20,
  },
  socialModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  socialModalKeyboardWrap: {
    flex: 1,
    justifyContent: "center",
  },
  socialComposerScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  socialModalCard: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 820 : 680,
    alignSelf: "center",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#29313b",
    backgroundColor: "#10141b",
    padding: 20,
    gap: 18,
  },
  socialCommentsModalCard: {
    maxWidth: Platform.OS === "web" ? 700 : 640,
  },
  socialComposerModalCard: {
    maxWidth: Platform.OS === "web" ? 860 : 720,
  },
  socialModalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },
  socialModalHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  socialModalEyebrow: {
    color: "#8f98a6",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  socialModalTitle: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 22 : 18,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  socialModalSubtitle: {
    color: "#a4adba",
    fontSize: 13,
    lineHeight: 20,
  },
  socialModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#29313b",
    backgroundColor: "#141922",
  },
  socialModalCloseButtonText: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: -2,
  },
  socialComposerConfigGrid: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    flexWrap: "wrap",
    gap: 10,
  },
  socialComposerSection: {
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#262d37",
    backgroundColor: "#131821",
    padding: 16,
  },
  socialComposerSectionHead: {
    gap: 4,
  },
  socialComposerSectionTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  socialComposerSectionMeta: {
    color: "#9aa3b1",
    fontSize: 12,
    lineHeight: 18,
  },
  socialComposerTextarea: {
    minHeight: 110,
    paddingTop: 12,
  },
  socialPhotoControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  socialComposerUtilityButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  socialComposerUtilityButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  socialComposerPhotoStrip: {
    gap: 10,
    paddingTop: 4,
  },
  socialComposerPlaceholder: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27303b",
    backgroundColor: "#10151d",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  socialComposerPlaceholderText: {
    color: "#9aa3b1",
    fontSize: 12,
    lineHeight: 18,
  },
  socialComposerPhotoItem: {
    position: "relative",
  },
  socialComposerPhotoThumb: {
    width: 88,
    height: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
  },
  socialComposerPhotoRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  socialComposerPhotoRemoveText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 14,
  },
  socialRecipeComposerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialEditableList: {
    gap: 10,
  },
  socialEditableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  socialEditableInput: {
    flex: 1,
  },
  socialInlineAddBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  socialInlineAddText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  socialInlineRemoveBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  socialInlineRemoveText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  socialComposerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
    paddingTop: 2,
  },
  socialComposerFooterSecondaryButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 15,
  },
  socialComposerFooterSecondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  socialComposerFooterPrimaryButton: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 15,
  },
  socialComposerFooterPrimaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  socialListFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  socialCommentsList: {
    maxHeight: 340,
  },
  socialCommentsListContent: {
    gap: 12,
    paddingVertical: 6,
  },
  socialCommentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  socialCommentBubble: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#272f39",
    backgroundColor: "#131821",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  socialCommentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  socialCommentCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  socialCommentAuthor: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  socialCommentMeta: {
    color: "#98a1af",
    fontSize: 12,
    fontWeight: "600",
  },
  socialCommentText: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 20,
  },
  socialCommentComposer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 4,
  },
  socialCommentInput: {
    flex: 1,
    minWidth: 220,
  },
  socialCommentSubmitButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  socialCommentSubmitButtonText: {
    fontSize: 13,
    fontWeight: "800",
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
  webTopShell: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    backgroundColor: theme.topbarBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.topbarBorder,
  },
  webTopBar: {
    height: WEB_TOPBAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    borderBottomColor: theme.topbarBorder,
  },
  webBrandButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  webBrandButtonPressed: {
    opacity: 0.82,
  },
  webBrandText: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.15,
    textShadowColor: "rgba(255,255,255,0.06)",
    textShadowRadius: 10,
  },
  webProfileButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: 0,
  },
  webProfileButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  webProfileAvatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: theme.panelMuted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  webProfileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  webProfileAvatarText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
  webNavBar: {
    height: WEB_NAVBAR_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: theme.topbarBg,
  },
  webNavTabsRow: {
    width: "100%",
    maxWidth: 1400,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  webNavTab: {
    borderWidth: 0,
    borderBottomWidth: 2,
    borderColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingVertical: 12,
    backgroundColor: "transparent",
  },
  webNavTabActive: {
    borderBottomColor: theme.kcal,
  },
  webNavTabHover: {
    borderBottomColor: "rgba(45, 212, 191, 0.36)",
  },
  webNavTabPressed: {
    opacity: 0.85,
  },
  webNavTabText: {
    color: theme.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  webNavTabTextHover: {
    color: "#c7c7d0",
  },
  webNavTabTextActive: {
    color: theme.text,
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
  webAccountMenuLayer: {
    paddingTop: WEB_CHROME_TOTAL_HEIGHT + 12,
    paddingHorizontal: 24,
  },
  webAccountMenuContainer: {
    width: "100%",
    maxWidth: 380,
  },
  authWebMenuLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: WEB_TOPBAR_HEIGHT + 12,
    paddingHorizontal: 24,
    alignItems: "flex-end",
    zIndex: 95,
  },
  authWebMenuContainer: {
    width: 240,
  },
  authWebMenuCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    backgroundColor: "#12161d",
    padding: 14,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  authWebAccountMenuActions: {
    gap: 10,
  },
  authWebAccountMenuButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.inputBg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  authWebAccountMenuButtonPrimary: {
    backgroundColor: theme.text,
    borderColor: theme.text,
  },
  authWebAccountMenuButtonPressed: {
    opacity: 0.92,
  },
  authWebAccountMenuButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  authWebAccountMenuButtonTextPrimary: {
    color: theme.bg,
  },
  bodyActionMenuContainerWeb: {
    width: "100%",
    maxWidth: 300,
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
  accountMenuAvatarBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 4,
  },
  accountMenuAvatarPressable: {
    borderRadius: 999,
  },
  accountMenuAvatarPressablePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  accountMenuAvatarCopy: {
    flex: 1,
    gap: 4,
  },
  accountMenuAvatarName: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  accountMenuAvatarHint: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  bodyFormModalLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  bodyFormModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bodyFormModalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  bodyFormModalContainer: {
    width: "100%",
    maxWidth: 460,
  },
  bodyFormModalCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    backgroundColor: "#15181f",
    padding: 16,
    gap: 10,
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
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 16,
    paddingHorizontal: Platform.OS === "web" ? 18 : 16,
    gap: Platform.OS === "web" ? 18 : 14,
    paddingBottom: Platform.OS === "web" ? 120 : 90,
  },
  desktopSectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-start",
  },
  desktopSectionGridWide: {
    gap: 18,
  },
  desktopSectionGridItem: {
    flexBasis: "48.8%",
    flexGrow: 1,
    minWidth: Platform.OS === "web" ? 320 : 0,
  },
  desktopSectionGridItemWide: {
    flexBasis: "31.8%",
    minWidth: Platform.OS === "web" ? 300 : 0,
  },
  desktopSectionGridFull: {
    flexBasis: "100%",
    width: "100%",
  },
  desktopSectionGridHero: {
    flexBasis: "60%",
    minWidth: Platform.OS === "web" ? 460 : 0,
  },
  settingsHeroDesktop: {
    flexBasis: "48.8%",
    minWidth: Platform.OS === "web" ? 360 : 0,
  },
  settingsHeroDesktopWide: {
    flexBasis: "31.8%",
    minWidth: Platform.OS === "web" ? 320 : 0,
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
    marginLeft: Platform.OS === "web" ? "auto" : 0,
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
  dashboardHeroDesktop: {
    width: "100%",
  },
  dashboardDesktopMainGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 18,
  },
  dashboardDesktopMainGridWide: {
    gap: 20,
  },
  dashboardDesktopLeftColumn: {
    flexBasis: "62%",
    flexGrow: 1,
    minWidth: 0,
    gap: 16,
  },
  dashboardDesktopRightColumn: {
    flexBasis: "38%",
    flexGrow: 0,
    minWidth: 0,
    gap: 16,
  },
  dashboardRingsShowcaseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: 12,
  },
  dashboardDesktopFullRow: {
    marginTop: 16,
  },
  dashboardDesktopInsightsCard: {
    marginTop: 16,
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
  heroRemainingValueTablet: {
    fontSize: 58,
    lineHeight: 62,
  },
  heroRemainingValueDesktop: {
    fontSize: 70,
    lineHeight: 74,
    letterSpacing: -0.8,
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
  dashboardQuickActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  dashboardQuickActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    backgroundColor: theme.panelSoft,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
  },
  dashboardQuickActionTitle: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 14,
  },
  dashboardQuickActionSub: {
    color: theme.muted,
    fontSize: 12,
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
  metricTileTablet: {
    minWidth: 124,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  metricTileDesktop: {
    minWidth: 156,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  metricTileLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  metricTileLabelTablet: {
    fontSize: 12,
  },
  metricTileLabelDesktop: {
    fontSize: 13,
  },
  metricTileValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  metricTileValueTablet: {
    fontSize: 20,
    lineHeight: 22,
  },
  metricTileValueDesktop: {
    fontSize: 24,
    lineHeight: 28,
  },
  metricTileSubtitle: {
    color: theme.muted,
    fontSize: 11,
  },
  metricTileSubtitleTablet: {
    fontSize: 12,
  },
  metricTileSubtitleDesktop: {
    fontSize: 13,
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
  ringCardHero: {
    width: "48.5%",
    minWidth: 224,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  ringCenter: {
    position: "absolute",
    top: 38,
    alignItems: "center",
    width: "100%",
  },
  ringCenterHero: {
    top: 45,
  },
  ringLabel: {
    color: theme.muted,
    fontSize: 12,
  },
  ringLabelHero: {
    fontSize: 13,
  },
  ringValue: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "700",
  },
  ringValueHero: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "800",
  },
  ringUnit: {
    color: theme.muted,
    fontSize: 11,
  },
  ringUnitHero: {
    fontSize: 12,
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
    minWidth: 0,
  },
  intakeNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  intakeName: {
    color: theme.text,
    fontWeight: "600",
    fontSize: 14,
    flexShrink: 1,
    minWidth: 0,
  },
  intakeAIBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.warning,
    backgroundColor: "rgba(241,208,142,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  intakeAIBadgeText: {
    color: theme.warning,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.25,
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
    gap: 14,
  },
  historyDesktopSplit: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-start",
  },
  historyDesktopSplitWide: {
    gap: 18,
  },
  historyDesktopCalendarPane: {
    flexBasis: "43%",
    flexGrow: 1,
    minWidth: Platform.OS === "web" ? 420 : 0,
  },
  historyDesktopDetailPane: {
    flexBasis: "53%",
    flexGrow: 1,
    minWidth: Platform.OS === "web" ? 420 : 0,
  },
  historyCalendarTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2,
  },
  historyCalendarTitleWrap: {
    flex: 1,
    gap: 2,
  },
  historyCalendarTitle: {
    color: theme.text,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  historyCalendarSubtitle: {
    color: "#8b8b93",
    fontSize: 12,
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
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  historyCalendarMonthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 4,
  },
  historyCalendarArrowTouch: {
    width: 42,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCalendarArrowIcon: {
    color: theme.text,
    fontSize: 28,
    fontWeight: "500",
    lineHeight: 28,
    marginTop: -2,
  },
  historyCalendarArrowTouchPressed: {
    opacity: 0.58,
    transform: [{ scale: 0.97 }],
  },
  historyCalendarLoadingRow: {
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCalendarStreakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  historyCalendarStreakBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  historyCalendarStreakBadgeIdle: {
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  historyCalendarStreakFlameWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 4,
  },
  historyCalendarStreakTextWrap: {
    flex: 1,
    gap: 2,
  },
  historyCalendarStreakTitle: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
  },
  historyCalendarStreakSubtitle: {
    color: "#9a9aa2",
    fontSize: 11,
    fontWeight: "600",
  },
  historyCalendarStreakMetric: {
    minWidth: 64,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  historyCalendarStreakMetricActive: {
    backgroundColor: "rgba(237, 141, 95, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(237, 141, 95, 0.35)",
  },
  historyCalendarStreakMetricIdle: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  historyCalendarStreakDays: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 18,
  },
  historyCalendarStreakDaysLabel: {
    color: "#a5a5ae",
    fontSize: 10,
    fontWeight: "700",
  },
  historyWeekDaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    marginTop: 2,
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
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    textTransform: "capitalize",
  },
  historyCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.035)",
    backgroundColor: "#101010",
    paddingHorizontal: 6,
    paddingVertical: 5,
    justifyContent: "space-between",
  },
  historyCalendarCellPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  historyCalendarCellFilled: {
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#141414",
  },
  historyCalendarCellHasWeight: {
    backgroundColor: "#13171c",
  },
  historyCalendarCellToday: {
    borderColor: "rgba(255,255,255,0.22)",
  },
  historyCalendarCellActive: {
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "#1a1a1a",
    shadowColor: "#ffffff",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  historyCalendarDayText: {
    color: "#d9d9de",
    fontSize: 12,
    fontWeight: "600",
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
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#ededf0",
  },
  historyCalendarWeightDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.kcal,
    backgroundColor: "transparent",
  },
  historyLegendRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 8,
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
  historyDayHeadLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    flexShrink: 1,
    minWidth: 0,
  },
  historyValue: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
    flexShrink: 0,
    minWidth: 54,
    textAlign: "right",
  },
  historyAIBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.warning,
    backgroundColor: "rgba(241,208,142,0.1)",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  historyAIBadgeText: {
    color: theme.warning,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.25,
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
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: Platform.OS === "web" ? 18 : 16,
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
  webBarcodeFallbackCard: {
    width: "100%",
    maxWidth: 420,
    gap: 10,
    marginTop: 6,
  },
  webScanToolsRow: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    zIndex: 6,
  },
  webScanToolChip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    backgroundColor: "rgba(7,10,16,0.75)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  webScanToolChipPressed: {
    backgroundColor: "rgba(12,18,30,0.92)",
    borderColor: "rgba(255,255,255,0.56)",
  },
  webScanToolChipText: {
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
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
  mealPhotoCountBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    backgroundColor: "rgba(8,8,8,0.82)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mealPhotoCountBadgeText: {
    color: theme.text,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  mealPhotoThumbStrip: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row",
    gap: 8,
  },
  mealPhotoThumb: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: "#0f0f0f",
  },
  mealPhotoThumbPrimary: {
    borderColor: theme.accent,
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
  mealPhotoGuideCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  mealPhotoGuideIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  mealPhotoGuideTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  mealPhotoGuideText: {
    color: theme.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 260,
  },
  mealPhotoPressablePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
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
  mealPrecisionCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  mealPrecisionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  mealPrecisionLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  mealPrecisionValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  mealPrecisionValue: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  mealPrecisionMetaText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  mealPrecisionTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.border,
    overflow: "hidden",
  },
  mealPrecisionFill: {
    height: "100%",
    borderRadius: 999,
  },
  mealEditableGrid: {
    gap: 8,
  },
  mealSourceSheetLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  mealSourceSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  mealSourceSheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  mealSourceSheetContainer: {
    width: "100%",
  },
  mealSourceSheetCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    backgroundColor: "#16181f",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  mealSourceSheetTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  mealSourceSheetOptions: {
    flexDirection: "row",
    gap: 10,
  },
  mealSourceSheetOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2e323c",
    borderRadius: 14,
    backgroundColor: "#232732",
    minHeight: 138,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 8,
  },
  mealSourceSheetOptionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#2b2f3a",
    alignItems: "center",
    justifyContent: "center",
  },
  mealSourceSheetOptionTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  mealSourceSheetOptionSubtitle: {
    color: theme.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
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
  recipePreviewList: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 2,
  },
  recipePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.panelSoft,
  },
  recipePreviewImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#0b0b0b",
  },
  recipePreviewImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  recipePreviewImagePlaceholderText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  recipePreviewTextWrap: {
    flex: 1,
    gap: 3,
  },
  recipePreviewTitle: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 14,
  },
  recipePreviewSubtitle: {
    color: theme.muted,
    fontSize: 12,
  },
  recipePreviewMacroLine: {
    color: theme.muted,
    fontSize: 11,
  },
  recipeChoiceGrid: {
    gap: 12,
    flexDirection: Platform.OS === "web" ? "row" : "column",
    flexWrap: "wrap",
  },
  recipeChoiceCard: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 240 : undefined,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  recipeChoiceTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  recipeChoiceText: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  recipeBulletList: {
    gap: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recipeFeedbackCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  recipeAiScreen: {
    gap: 14,
  },
  recipeAiHeroCard: {
    gap: 10,
    backgroundColor: "#101115",
    borderColor: "#242730",
  },
  recipeAiEyebrow: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  recipeAiHeroTitle: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 28 : 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: Platform.OS === "web" ? 32 : 27,
  },
  recipeAiHeroText: {
    color: theme.muted,
    fontSize: Platform.OS === "web" ? 14 : 13,
    lineHeight: Platform.OS === "web" ? 21 : 20,
    maxWidth: 780,
  },
  recipeAiLoadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 120,
  },
  recipeAiUnavailableCard: {
    gap: 10,
  },
  recipeAiLayout: {
    gap: 14,
  },
  recipeAiLayoutDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 18,
  },
  recipeAiMainColumn: {
    flex: 1,
    gap: 14,
  },
  recipeAiSidebar: {
    width: 340,
    maxWidth: 340,
  },
  recipeAiSectionCard: {
    gap: 16,
  },
  recipeAiSectionHeader: {
    gap: 6,
  },
  recipeAiSectionTitle: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 18 : 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  recipeAiSectionHelper: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  recipeAiChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recipeAiChip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.panelSoft,
  },
  recipeAiChipHover: {
    borderColor: "#3a3d46",
    backgroundColor: "#20222a",
  },
  recipeAiChipActive: {
    borderColor: "rgba(45,212,191,0.42)",
    backgroundColor: "rgba(45,212,191,0.12)",
    shadowColor: "#2dd4bf",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  recipeAiChipPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  recipeAiChipDisabled: {
    opacity: 0.56,
  },
  recipeAiChipText: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  recipeAiChipTextActive: {
    color: theme.text,
  },
  recipeAiMacroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  recipeAiMacroCard: {
    flexBasis: Platform.OS === "web" ? 240 : undefined,
    flexGrow: 1,
    minWidth: Platform.OS === "web" ? 220 : undefined,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  recipeAiMacroCardBar: {
    height: 3,
    width: "100%",
  },
  recipeAiMacroFieldWrap: {
    padding: 14,
    gap: 8,
  },
  recipeAiMacroInput: {
    backgroundColor: "rgba(10,10,12,0.18)",
  },
  recipeAiInlineSection: {
    gap: 10,
  },
  recipeAiInlineLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  recipeAiTextFieldGrid: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 12,
  },
  recipeAiTextField: {
    flex: 1,
  },
  recipeAiIngredientEmptyState: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  recipeAiIngredientEmptyTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
  recipeAiIngredientEmptyText: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  recipeAiIngredientList: {
    gap: 12,
  },
  recipeAiIngredientCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: theme.panelSoft,
    padding: 14,
    gap: 12,
  },
  recipeAiIngredientCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  recipeAiIngredientIndex: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  recipeAiIngredientRemove: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  recipeAiIngredientRemoveHover: {
    backgroundColor: "#1c1f26",
    borderColor: "#3a3d46",
  },
  recipeAiIngredientRemovePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  recipeAiIngredientRemoveText: {
    color: theme.text,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: "800",
    marginTop: -2,
  },
  recipeAiIngredientRow: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    alignItems: Platform.OS === "web" ? "flex-start" : "stretch",
    gap: 12,
  },
  recipeAiIngredientNameField: {
    flex: 1.45,
  },
  recipeAiIngredientMetaFields: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  recipeAiIngredientCompactField: {
    flex: 1,
  },
  recipeAiIngredientActions: {
    gap: 10,
    alignItems: "flex-start",
  },
  recipeAiSectionFootnote: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  recipeAiCtaCard: {
    gap: 14,
  },
  recipeAiCtaCopy: {
    gap: 6,
  },
  recipeAiPrimaryButton: {
    minHeight: 56,
    borderRadius: 18,
  },
  recipeAiPrimaryButtonText: {
    fontSize: 16,
    fontWeight: "800",
  },
  recipeAiSummaryCard: {
    gap: 16,
  },
  recipeAiOptionsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  recipeAiOptionsHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  recipeAiOptionsSkeletonList: {
    gap: 12,
  },
  recipeAiOptionsList: {
    gap: 12,
  },
  recipeAiOptionCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    backgroundColor: theme.panelSoft,
    padding: 16,
    gap: 12,
  },
  recipeAiOptionCardRecommended: {
    borderColor: "rgba(45,212,191,0.38)",
    backgroundColor: "#171b1f",
    shadowColor: "#2dd4bf",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  recipeAiOptionCardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
  },
  recipeAiOptionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  recipeAiOptionHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  recipeAiOptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  recipeAiOptionTitle: {
    color: theme.text,
    fontSize: Platform.OS === "web" ? 19 : 17,
    fontWeight: "800",
    letterSpacing: -0.25,
    flexShrink: 1,
  },
  recipeAiOptionMeta: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  recipeAiRecommendedStar: {
    color: "#facc15",
    fontSize: 17,
    fontWeight: "900",
  },
  recipeAiComplexityChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recipeAiComplexityChipLow: {
    borderColor: "rgba(52,211,153,0.34)",
    backgroundColor: "rgba(52,211,153,0.12)",
  },
  recipeAiComplexityChipMedium: {
    borderColor: "rgba(251,191,36,0.34)",
    backgroundColor: "rgba(251,191,36,0.12)",
  },
  recipeAiComplexityChipHigh: {
    borderColor: "rgba(248,113,113,0.34)",
    backgroundColor: "rgba(248,113,113,0.12)",
  },
  recipeAiComplexityChipText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
  },
  recipeAiRecommendedCallout: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.28)",
    backgroundColor: "rgba(45,212,191,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  recipeAiRecommendedCalloutText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  recipeAiOptionSummary: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 21,
  },
  recipeAiOptionMacroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recipeAiOptionMacroPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recipeAiOptionMacroLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  recipeAiOptionMacroValue: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
  },
  recipeAiOptionHighlightList: {
    gap: 5,
  },
  recipeAiOptionHighlightText: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  recipeAiOptionButton: {
    marginTop: 2,
  },
  recipeAiDetailSkeleton: {
    gap: 12,
  },
  recipeAiDetailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  recipeAiDetailHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  recipeAiDetailReason: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  recipeAiSummaryEyebrow: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  recipeAiSummaryTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  recipeAiSummaryBlock: {
    gap: 10,
  },
  recipeAiSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  recipeAiSummaryLabel: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  recipeAiSummaryValue: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
  recipeAiSummaryMacroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recipeAiSummaryMacroCard: {
    width: "47%",
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  recipeAiSummaryMacroLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  recipeAiSummaryMacroValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "900",
  },
  recipeAiSummaryRestrictionBlock: {
    gap: 10,
  },
  recipeAiSummarySubheading: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  recipeAiSummaryRestrictionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recipeAiSummaryRestrictionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recipeAiSummaryRestrictionText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  recipeEditorGrid: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    flexWrap: "wrap",
    gap: 12,
  },
  recipeEditorRow: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    alignItems: Platform.OS === "web" ? "flex-end" : "stretch",
    gap: 10,
  },
  recipeStepRow: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    alignItems: Platform.OS === "web" ? "flex-end" : "stretch",
    gap: 10,
  },
  recipeEditorPrimaryField: {
    flex: 1.6,
  },
  recipeEditorCompactField: {
    flex: 0.8,
    minWidth: Platform.OS === "web" ? 110 : undefined,
  },
  recipeRowRemove: {
    alignSelf: Platform.OS === "web" ? "center" : "flex-start",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    backgroundColor: theme.panelMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: Platform.OS === "web" ? 10 : 0,
  },
  recipeRowRemoveText: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
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
  searchVerifiedIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(52, 211, 153, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.34)",
  },
  searchVerifiedIcon: {
    color: theme.ok,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 15,
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
  inlineRowChevron: {
    color: theme.muted,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 22,
  },
  productImage: {
    width: "100%",
    height: 180,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: "#090d16",
  },
  quantitySummaryHeader: {
    gap: 2,
    marginTop: 4,
  },
  quantitySummaryTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  quantitySummarySub: {
    color: theme.muted,
    fontSize: 12,
  },
  addMacroSummaryWrap: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.panelSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addMacroRingWrap: {
    width: 126,
    height: 126,
    alignItems: "center",
    justifyContent: "center",
  },
  addMacroRingCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  addMacroRingValue: {
    color: theme.text,
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 34,
  },
  addMacroRingUnit: {
    color: theme.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  addMacroMetricsWrap: {
    flex: 1,
    gap: 9,
  },
  addMacroMetricItem: {
    gap: 1,
  },
  addMacroMetricPercent: {
    fontSize: 15,
    fontWeight: "700",
  },
  addMacroMetricValue: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
  },
  addMacroMetricLabel: {
    color: theme.muted,
    fontSize: 12,
  },
  correctionCallout: {
    borderWidth: 1,
    borderColor: "#3a4b68",
    borderRadius: 14,
    backgroundColor: "#131924",
    padding: 12,
    gap: 10,
  },
  correctionCalloutHeader: {
    gap: 3,
  },
  correctionCalloutTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  correctionCalloutText: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
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
  inAppAlertLayer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  inAppAlertBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  inAppAlertCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  inAppAlertTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
  },
  inAppAlertMessage: {
    color: theme.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  inAppAlertButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 2,
  },
  inAppAlertButton: {
    minWidth: 92,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  inAppAlertButtonPrimary: {
    borderColor: theme.accent,
    backgroundColor: theme.accent,
  },
  inAppAlertButtonSecondary: {
    borderColor: theme.border,
    backgroundColor: theme.panelSoft,
  },
  inAppAlertButtonDanger: {
    borderColor: theme.danger,
    backgroundColor: "rgba(244,143,143,0.14)",
  },
  inAppAlertButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  inAppAlertButtonTextPrimary: {
    color: "#080808",
  },
  inAppAlertButtonTextSecondary: {
    color: theme.text,
  },
  inAppAlertButtonTextDanger: {
    color: theme.danger,
  },
  quickAddLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 40,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 94,
  },
  quickAddLayerWeb: {
    alignItems: "center",
    paddingHorizontal: 0,
    paddingBottom: 118,
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
  quickAddSheetContainerWeb: {
    width: "52%",
    maxWidth: 740,
    minWidth: 360,
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
    left: 16,
    right: 16,
    bottom: 14,
    zIndex: 40,
    elevation: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 0,
  },
  webFloatingAddWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: "center",
    zIndex: 74,
    elevation: 24,
    pointerEvents: "box-none",
  },
  webFloatingAddButton: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f6ed3",
    backgroundColor: "#4da3ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f58ad",
    shadowOpacity: 0.38,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  webFloatingAddButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  tabItem: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tabItemCenter: {
    justifyContent: "center",
  },
  tabItemActive: {
    backgroundColor: "#252525",
  },
  tabPlusButton: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f6ed3",
    backgroundColor: "#4da3ff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
    shadowColor: "#0f58ad",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  tabPlusButtonActive: {
    backgroundColor: "#63afff",
    borderColor: "#2d7fe2",
  },
  tabPlusGlyph: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    color: theme.muted,
    fontWeight: "700",
    fontSize: 11,
  },
  tabTextActive: {
    color: theme.text,
  },
});
