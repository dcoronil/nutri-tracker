import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, G } from "react-native-svg";

type NutritionBasis = "per_100g" | "per_100ml" | "per_serving";
type LookupSource = "local" | "openfoodfacts_imported" | "openfoodfacts_incomplete" | "not_found";
type IntakeMethod = "grams" | "percent_pack" | "units";
type ApiHealthStatus = "idle" | "checking" | "online" | "offline";
type AppTab = "scan" | "dashboard" | "profile" | "settings";
type AuthStage = "login" | "register" | "verify";
type Sex = "male" | "female" | "other";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "athlete";
type GoalType = "lose" | "maintain" | "gain";

type Product = {
  id: number;
  barcode: string | null;
  name: string;
  brand: string | null;
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
  data_confidence: string;
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

type LookupResponse = {
  source: LookupSource;
  product: Product | null;
  missing_fields: string[];
  message: string | null;
};

type LabelResponse = {
  created: boolean;
  product: Product | null;
  missing_fields: string[];
  questions: string[];
};

type IntakeItem = {
  id: number;
  product_id: number;
  product_name: string | null;
  method: IntakeMethod;
  quantity_g: number | null;
  quantity_units: number | null;
  percent_pack: number | null;
  created_at: string;
  nutrients: Nutrients;
};

type Goal = {
  kcal_goal: number;
  protein_goal: number;
  fat_goal: number;
  carbs_goal: number;
};

type GoalFeedback = {
  realistic: boolean;
  notes: string[];
};

type DaySummary = {
  date: string;
  goal: Goal | null;
  consumed: Nutrients;
  remaining: Nutrients | null;
  intakes: IntakeItem[];
};

type ProfileRead = {
  weight_kg: number;
  height_cm: number;
  age: number;
  sex: Sex;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  waist_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  bmi: number;
  bmi_category: string;
  bmi_color: string;
  body_fat_percent: number | null;
  body_fat_category: string;
  body_fat_color: string;
};

type AnalysisResponse = {
  profile: ProfileRead;
  recommended_goal: Goal;
  goal_feedback_today: GoalFeedback | null;
};

type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user: {
    id: number;
    email: string;
    is_verified: boolean;
  };
  profile: ProfileRead;
};

type RegisterResponse = {
  user_id: number;
  email: string;
  verification_required: boolean;
  message: string;
  debug_verification_code: string | null;
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

type RegisterFormState = {
  email: string;
  password: string;
  weightKg: string;
  heightCm: string;
  age: string;
  sex: Sex;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  waistCm: string;
  neckCm: string;
  hipCm: string;
  chestCm: string;
  armCm: string;
  thighCm: string;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

const COLORS = {
  bg: "#070b14",
  card: "#111a2b",
  border: "#1f2c46",
  input: "#0c1424",
  text: "#eaf2ff",
  muted: "#93a8cd",
  accent: "#27f5c8",
  accentDark: "#0f5548",
  warning: "#ffb96d",
  danger: "#ff95a8",
};

function formatDateLocal(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonth(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
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
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra
      ?.expoClient?.hostUri;

  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(":")[0]?.trim();
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return null;
  }

  return host;
}

function inferDefaultApiBaseUrl(): string {
  const envValue = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
  if (envValue && !envValue.includes("localhost")) {
    return envValue;
  }

  const expoHostIp = getExpoHostIp();
  if (expoHostIp) {
    return `http://${expoHostIp}:8000`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }

  return envValue || "http://localhost:8000";
}

function buildApiCandidates(current: string): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeBaseUrl(current);
  if (normalized) {
    candidates.add(normalized);
  }

  const expoHostIp = getExpoHostIp();
  if (expoHostIp) {
    candidates.add(`http://${expoHostIp}:8000`);
  }

  if (Platform.OS === "android") {
    candidates.add("http://10.0.2.2:8000");
  }

  candidates.add("http://localhost:8000");
  return [...candidates];
}

function parseError(error: unknown, baseUrl: string): string {
  if (!(error instanceof Error)) {
    return "Error inesperado";
  }

  if (error.message.includes("Network request failed")) {
    return `No hay conexión con ${baseUrl}. Ve a Ajustes y ajusta la URL de API.`;
  }

  return error.message;
}

function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function monthDateFromKey(key: string): Date {
  const parts = key.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(year, month - 1, 1);
}

function nextMonth(key: string, delta: number): string {
  const base = monthDateFromKey(key);
  base.setMonth(base.getMonth() + delta);
  return formatMonth(base);
}

function calendarCells(monthKey: string, records: Map<number, CalendarDayEntry>): Array<number | null> {
  const base = monthDateFromKey(monthKey);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const jsWeekday = firstDay.getDay();
  const mondayFirst = jsWeekday === 0 ? 6 : jsWeekday - 1;

  const daysInMonth = lastDay.getDate();
  const cells: Array<number | null> = [];

  for (let i = 0; i < mondayFirst; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells.map((day) => {
    if (day === null) {
      return null;
    }

    return records.has(day) ? day : day;
  });
}

function MacroDonut({ segments, centerText }: { segments: DonutSegment[]; centerText: string }) {
  const size = 200;
  const stroke = 24;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((acc, segment) => acc + Math.max(segment.value, 0), 0);

  if (total <= 0) {
    return (
      <View style={styles.donutEmpty}>
        <Text style={styles.helperText}>Sin datos de macros para representar</Text>
      </View>
    );
  }

  let offset = 0;

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {segments.map((segment) => {
            const value = Math.max(segment.value, 0);
            const length = (value / total) * circumference;
            const element = (
              <Circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return element;
          })}
        </G>
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutCenterText}>{centerText}</Text>
      </View>
      <View style={styles.legendWrap}>
        {segments.map((segment) => (
          <View key={segment.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
            <Text style={styles.legendText}>
              {segment.label}: {Math.round(segment.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const today = useMemo(() => formatDateLocal(new Date()), []);

  const [tab, setTab] = useState<AppTab>("scan");
  const [apiBaseUrl, setApiBaseUrl] = useState(inferDefaultApiBaseUrl());
  const [apiDraftUrl, setApiDraftUrl] = useState(inferDefaultApiBaseUrl());
  const [apiStatus, setApiStatus] = useState<ApiHealthStatus>("idle");
  const [statusText, setStatusText] = useState("");

  const [authStage, setAuthStage] = useState<AuthStage>("login");
  const [token, setToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    email: "",
    password: "",
    weightKg: "75",
    heightCm: "175",
    age: "30",
    sex: "other",
    activityLevel: "moderate",
    goalType: "maintain",
    waistCm: "",
    neckCm: "",
    hipCm: "",
    chestCm: "",
    armCm: "",
    thighCm: "",
  });

  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(formatMonth(new Date()));
  const [calendarData, setCalendarData] = useState<CalendarDayEntry[]>([]);

  const [goalKcal, setGoalKcal] = useState("2000");
  const [goalProtein, setGoalProtein] = useState("130");
  const [goalFat, setGoalFat] = useState("70");
  const [goalCarbs, setGoalCarbs] = useState("220");
  const [goalFeedback, setGoalFeedback] = useState<GoalFeedback | null>(null);
  const [savingGoals, setSavingGoals] = useState(false);

  const [loadingScan, setLoadingScan] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [lastBarcode, setLastBarcode] = useState("");

  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [product, setProduct] = useState<Product | null>(null);

  const [labelName, setLabelName] = useState("");
  const [labelBrand, setLabelBrand] = useState("");
  const [labelText, setLabelText] = useState("");
  const [labelPhotos, setLabelPhotos] = useState<string[]>([]);
  const [labelQuestions, setLabelQuestions] = useState<string[]>([]);
  const [uploadingLabel, setUploadingLabel] = useState(false);

  const [quantityModalVisible, setQuantityModalVisible] = useState(false);
  const [quantityMethod, setQuantityMethod] = useState<IntakeMethod>("grams");
  const [quantityGrams, setQuantityGrams] = useState(120);
  const [quantityPercent, setQuantityPercent] = useState(25);
  const [quantityUnits, setQuantityUnits] = useState(1);
  const [savingIntake, setSavingIntake] = useState(false);

  const endpoint = (path: string, baseUrlOverride?: string): string => {
    const base = normalizeBaseUrl(baseUrlOverride ?? apiBaseUrl);
    return `${base}${path}`;
  };

  const request = async <T,>(
    path: string,
    init?: RequestInit,
    authRequired = false,
    baseUrlOverride?: string,
  ): Promise<T> => {
    const headers = new Headers(init?.headers ?? {});

    if (authRequired && token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(endpoint(path, baseUrlOverride), {
      ...init,
      headers,
    });

    const rawBody = await response.text();
    let body: unknown = null;

    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        body = rawBody;
      }
    }

    if (!response.ok) {
      const detail =
        typeof body === "object" && body !== null
          ? ((body as { detail?: string; message?: string }).detail ??
            (body as { detail?: string; message?: string }).message)
          : undefined;
      throw new Error(detail ?? `HTTP ${response.status}`);
    }

    return body as T;
  };

  const checkHealth = async (baseUrl: string): Promise<boolean> => {
    try {
      const response = await request<{ status: string }>("/health", undefined, false, baseUrl);
      return response.status === "ok";
    } catch {
      return false;
    }
  };

  const checkCurrentApi = async (showSuccess = true) => {
    const normalized = normalizeBaseUrl(apiBaseUrl);
    if (!normalized) {
      setApiStatus("offline");
      setStatusText("URL API inválida.");
      return false;
    }

    setApiStatus("checking");
    const ok = await checkHealth(normalized);

    if (!ok) {
      setApiStatus("offline");
      if (showSuccess) {
        setStatusText(`No se pudo conectar con ${normalized}`);
      }
      return false;
    }

    setApiStatus("online");
    if (showSuccess) {
      setStatusText("API conectada.");
    }
    return true;
  };

  const autoDetectApi = async () => {
    setApiStatus("checking");

    for (const candidate of buildApiCandidates(apiDraftUrl)) {
      if (await checkHealth(candidate)) {
        setApiBaseUrl(candidate);
        setApiDraftUrl(candidate);
        setApiStatus("online");
        setStatusText(`API detectada en ${candidate}`);
        return;
      }
    }

    setApiStatus("offline");
    setStatusText("No encontré API activa. Revisa IP local y backend.");
  };

  const applyApiUrl = async () => {
    const normalized = normalizeBaseUrl(apiDraftUrl);
    if (!normalized) {
      Alert.alert("URL inválida", "Usa formato http://IP:8000");
      return;
    }

    setApiBaseUrl(normalized);
    setApiDraftUrl(normalized);

    const ok = await checkHealth(normalized);
    setApiStatus(ok ? "online" : "offline");
    setStatusText(ok ? "API conectada." : `No se pudo conectar con ${normalized}`);
  };

  const loadSummary = async () => {
    if (!token) {
      return;
    }
    try {
      const data = await request<DaySummary>(`/days/${today}/summary`, undefined, true);
      setSummary(data);
      if (data.goal) {
        setGoalKcal(String(data.goal.kcal_goal));
        setGoalProtein(String(data.goal.protein_goal));
        setGoalFat(String(data.goal.fat_goal));
        setGoalCarbs(String(data.goal.carbs_goal));
      }
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    }
  };

  const loadAnalysis = async () => {
    if (!token) {
      return;
    }

    try {
      const data = await request<AnalysisResponse>(`/me/analysis?day=${today}`, undefined, true);
      setAnalysis(data);
      setProfile(data.profile);
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    }
  };

  const loadCalendar = async (month: string) => {
    if (!token) {
      return;
    }

    try {
      const data = await request<CalendarMonthResponse>(`/calendar/${month}`, undefined, true);
      setCalendarData(data.days);
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    }
  };

  const refreshAll = async () => {
    await loadSummary();
    await loadAnalysis();
    await loadCalendar(calendarMonth);
  };

  useEffect(() => {
    void checkCurrentApi(false);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void refreshAll();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadCalendar(calendarMonth);
  }, [calendarMonth]);

  const registerAccount = async () => {
    const email = registerForm.email.trim();
    const password = registerForm.password;

    if (!email || !password) {
      Alert.alert("Faltan campos", "Completa email y contraseña.");
      return;
    }

    const weight = Number(registerForm.weightKg);
    const height = Number(registerForm.heightCm);
    const age = Number(registerForm.age);

    if (!Number.isFinite(weight) || !Number.isFinite(height) || !Number.isFinite(age)) {
      Alert.alert("Datos inválidos", "Peso, altura y edad deben ser números.");
      return;
    }

    setAuthLoading(true);

    try {
      const payload = {
        email,
        password,
        weight_kg: weight,
        height_cm: height,
        age,
        sex: registerForm.sex,
        activity_level: registerForm.activityLevel,
        goal_type: registerForm.goalType,
        waist_cm: toOptionalNumber(registerForm.waistCm),
        neck_cm: toOptionalNumber(registerForm.neckCm),
        hip_cm: toOptionalNumber(registerForm.hipCm),
        chest_cm: toOptionalNumber(registerForm.chestCm),
        arm_cm: toOptionalNumber(registerForm.armCm),
        thigh_cm: toOptionalNumber(registerForm.thighCm),
      };

      const response = await request<RegisterResponse>("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setPendingEmail(response.email);
      setAuthEmail(response.email);
      setDebugCode(response.debug_verification_code);
      setAuthStage("verify");
      setStatusText(response.message);
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setAuthLoading(false);
    }
  };

  const verifyAccount = async () => {
    if (!pendingEmail.trim() || !verificationCode.trim()) {
      Alert.alert("Faltan datos", "Ingresa email y código de verificación.");
      return;
    }

    setAuthLoading(true);

    try {
      const response = await request<AuthResponse>("/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingEmail.trim(),
          code: verificationCode.trim(),
        }),
      });

      setToken(response.access_token);
      setProfile(response.profile);
      setAuthStage("login");
      setStatusText("Cuenta verificada. Sesión iniciada.");
      setTab("dashboard");
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      Alert.alert("Faltan datos", "Ingresa email y contraseña.");
      return;
    }

    setAuthLoading(true);

    try {
      const response = await request<AuthResponse>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });

      setToken(response.access_token);
      setProfile(response.profile);
      setStatusText("Sesión iniciada.");
      setTab("dashboard");
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setProfile(null);
    setSummary(null);
    setAnalysis(null);
    setCalendarData([]);
    setGoalFeedback(null);
    setTab("scan");
    setStatusText("Sesión cerrada.");
  };

  const openScanner = async () => {
    const granted = cameraPermission?.granted ?? false;
    if (!granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert("Permiso denegado", "Activa permisos de cámara para escanear.");
        return;
      }
    }

    setScanLocked(false);
    setScannerVisible(true);
  };

  const openQuantityModalForProduct = (selectedProduct: Product) => {
    setProduct(selectedProduct);

    if (selectedProduct.serving_size_g) {
      setQuantityMethod("units");
      setQuantityUnits(1);
    } else {
      setQuantityMethod("grams");
      setQuantityGrams(120);
    }

    setQuantityModalVisible(true);
  };

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanLocked) {
      return;
    }
    setScanLocked(true);
    setScannerVisible(false);
    setLastBarcode(result.data);
    void searchBarcode(result.data);
  };

  const searchBarcode = async (ean: string) => {
    if (!ean.trim()) {
      return;
    }

    setLoadingScan(true);
    setLookup(null);
    setLabelQuestions([]);

    try {
      const data = await request<LookupResponse>(`/products/by_barcode/${encodeURIComponent(ean.trim())}`);
      setLookup(data);

      if (data.product) {
        setLabelName(data.product.name);
        setLabelBrand(data.product.brand ?? "");
        openQuantityModalForProduct(data.product);
        setStatusText(`Producto listo: ${data.product.name}`);
      } else {
        setProduct(null);
        setStatusText(data.message ?? "No se encontró producto. Crea uno con etiqueta.");
      }
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setLoadingScan(false);
    }
  };

  const captureLabelPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso denegado", "Activa permisos para cámara.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    const firstAsset = result.canceled ? undefined : result.assets[0];

    if (!firstAsset?.uri) {
      return;
    }

    setLabelPhotos((current) => [...current, firstAsset.uri]);
  };

  const createProductFromLabel = async () => {
    if (!labelName.trim()) {
      Alert.alert("Falta nombre", "Indica el nombre del producto.");
      return;
    }

    setUploadingLabel(true);

    try {
      const formData = new FormData();

      if (lastBarcode.trim()) {
        formData.append("barcode", lastBarcode.trim());
      }
      formData.append("name", labelName.trim());
      if (labelBrand.trim()) {
        formData.append("brand", labelBrand.trim());
      }
      if (labelText.trim()) {
        formData.append("label_text", labelText.trim());
      }

      labelPhotos.forEach((uri, index) => {
        formData.append(
          "photos",
          {
            uri,
            name: `label-${index + 1}.jpg`,
            type: "image/jpeg",
          } as unknown as Blob,
        );
      });

      const headers = new Headers();
      const response = await fetch(endpoint("/products/from_label_photo"), {
        method: "POST",
        headers,
        body: formData,
      });

      const rawBody = await response.text();
      let body: LabelResponse | null = null;
      if (rawBody) {
        body = JSON.parse(rawBody) as LabelResponse;
      }

      if (!response.ok || !body) {
        throw new Error(`Error al crear producto (${response.status})`);
      }

      setLabelQuestions(body.questions ?? []);

      if (body.created && body.product) {
        setLookup({
          source: "local",
          product: body.product,
          missing_fields: [],
          message: "Producto creado desde etiqueta",
        });
        openQuantityModalForProduct(body.product);
        setStatusText("Producto creado correctamente.");
      } else {
        setStatusText("Faltan datos críticos de etiqueta.");
      }
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setUploadingLabel(false);
    }
  };

  const saveIntake = async () => {
    if (!token) {
      Alert.alert("Inicia sesión", "Debes iniciar sesión para registrar consumo.");
      return;
    }
    if (!product) {
      Alert.alert("Sin producto", "Escanea un producto primero.");
      return;
    }

    const payload: Record<string, number | string> = {
      product_id: product.id,
      method: quantityMethod,
    };

    if (quantityMethod === "grams") {
      payload.quantity_g = quantityGrams;
    }
    if (quantityMethod === "percent_pack") {
      payload.percent_pack = quantityPercent;
    }
    if (quantityMethod === "units") {
      payload.quantity_units = quantityUnits;
    }

    setSavingIntake(true);

    try {
      await request<IntakeItem>("/intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, true);

      setQuantityModalVisible(false);
      setStatusText("Intake guardado.");
      await loadSummary();
      await loadCalendar(calendarMonth);
      setTab("dashboard");
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setSavingIntake(false);
    }
  };

  const saveGoals = async () => {
    if (!token) {
      Alert.alert("Inicia sesión", "Debes iniciar sesión.");
      return;
    }

    setSavingGoals(true);

    try {
      const response = await request<{ feedback: GoalFeedback }>(
        `/goals/${today}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kcal_goal: Number(goalKcal),
            protein_goal: Number(goalProtein),
            fat_goal: Number(goalFat),
            carbs_goal: Number(goalCarbs),
          }),
        },
        true,
      );

      setGoalFeedback(response.feedback);
      setStatusText("Objetivos guardados.");
      await loadSummary();
      await loadAnalysis();
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setSavingGoals(false);
    }
  };

  const calendarMap = useMemo(() => {
    const map = new Map<number, CalendarDayEntry>();
    calendarData.forEach((entry) => {
      const day = Number(entry.date.split("-")[2]);
      map.set(day, entry);
    });
    return map;
  }, [calendarData]);

  const calendarGrid = useMemo(() => calendarCells(calendarMonth, calendarMap), [calendarMap, calendarMonth]);

  const donutSegments: DonutSegment[] = useMemo(() => {
    const remaining = summary?.remaining;
    if (!remaining) {
      return [
        { label: "Proteína", value: summary?.consumed.protein_g ?? 0, color: "#27f5c8" },
        { label: "Grasa", value: summary?.consumed.fat_g ?? 0, color: "#ffb96d" },
        { label: "Carb", value: summary?.consumed.carbs_g ?? 0, color: "#7db4ff" },
      ];
    }

    return [
      { label: "Proteína", value: Math.max(remaining.protein_g, 0), color: "#27f5c8" },
      { label: "Grasa", value: Math.max(remaining.fat_g, 0), color: "#ffb96d" },
      { label: "Carb", value: Math.max(remaining.carbs_g, 0), color: "#7db4ff" },
    ];
  }, [summary]);

  const needsLabelFlow =
    lookup?.source === "openfoodfacts_incomplete" ||
    lookup?.source === "not_found" ||
    (lookup?.missing_fields?.length ?? 0) > 0;

  if (!token) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Nutri Tracker</Text>
          <Text style={styles.subtitle}>Crea tu cuenta y verifica tu email para empezar.</Text>

          <View style={styles.card}>
            <View style={styles.rowWrap}>
              {([
                { key: "login", label: "Login" },
                { key: "register", label: "Registro" },
                { key: "verify", label: "Verificar" },
              ] as { key: AuthStage; label: string }[]).map((item) => (
                <Pressable
                  key={item.key}
                  style={[styles.pill, authStage === item.key && styles.pillActive]}
                  onPress={() => setAuthStage(item.key)}
                >
                  <Text style={[styles.pillText, authStage === item.key && styles.pillTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {authStage === "login" && (
              <>
                <TextInput
                  style={styles.input}
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  autoCapitalize="none"
                  placeholder="email"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={styles.input}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  secureTextEntry
                  placeholder="contraseña"
                  placeholderTextColor={COLORS.muted}
                />
                <Pressable style={styles.primaryButton} onPress={() => void login()}>
                  <Text style={styles.primaryButtonText}>Entrar</Text>
                </Pressable>
              </>
            )}

            {authStage === "register" && (
              <>
                <TextInput
                  style={styles.input}
                  value={registerForm.email}
                  onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, email: value }))}
                  autoCapitalize="none"
                  placeholder="email"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={styles.input}
                  value={registerForm.password}
                  onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, password: value }))}
                  secureTextEntry
                  placeholder="contraseña"
                  placeholderTextColor={COLORS.muted}
                />
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.weightKg}
                    onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, weightKg: value }))}
                    keyboardType="numeric"
                    placeholder="peso kg"
                    placeholderTextColor={COLORS.muted}
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.heightCm}
                    onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, heightCm: value }))}
                    keyboardType="numeric"
                    placeholder="altura cm"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.age}
                    onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, age: value }))}
                    keyboardType="numeric"
                    placeholder="edad"
                    placeholderTextColor={COLORS.muted}
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.sex}
                    onChangeText={(value) =>
                      setRegisterForm((prev) => ({ ...prev, sex: (value as Sex) || "other" }))
                    }
                    placeholder="sex: male/female/other"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <TextInput
                  style={styles.input}
                  value={registerForm.activityLevel}
                  onChangeText={(value) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      activityLevel: (value as ActivityLevel) || "moderate",
                    }))
                  }
                  placeholder="actividad: sedentary/light/moderate/active/athlete"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={styles.input}
                  value={registerForm.goalType}
                  onChangeText={(value) =>
                    setRegisterForm((prev) => ({ ...prev, goalType: (value as GoalType) || "maintain" }))
                  }
                  placeholder="objetivo: lose/maintain/gain"
                  placeholderTextColor={COLORS.muted}
                />
                <Text style={styles.helperText}>Medidas opcionales (más precisión en % grasa)</Text>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.waistCm}
                    onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, waistCm: value }))}
                    keyboardType="numeric"
                    placeholder="cintura cm"
                    placeholderTextColor={COLORS.muted}
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.neckCm}
                    onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, neckCm: value }))}
                    keyboardType="numeric"
                    placeholder="cuello cm"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.hipCm}
                    onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, hipCm: value }))}
                    keyboardType="numeric"
                    placeholder="cadera cm"
                    placeholderTextColor={COLORS.muted}
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput]}
                    value={registerForm.chestCm}
                    onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, chestCm: value }))}
                    keyboardType="numeric"
                    placeholder="pecho cm"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <Pressable style={styles.primaryButton} onPress={() => void registerAccount()}>
                  <Text style={styles.primaryButtonText}>Crear cuenta</Text>
                </Pressable>
              </>
            )}

            {authStage === "verify" && (
              <>
                <TextInput
                  style={styles.input}
                  value={pendingEmail}
                  onChangeText={setPendingEmail}
                  autoCapitalize="none"
                  placeholder="email"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={styles.input}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  keyboardType="number-pad"
                  placeholder="código de verificación"
                  placeholderTextColor={COLORS.muted}
                />
                {debugCode ? (
                  <Text style={styles.warningText}>Código dev (si no hay SMTP): {debugCode}</Text>
                ) : null}
                <Pressable style={styles.primaryButton} onPress={() => void verifyAccount()}>
                  <Text style={styles.primaryButtonText}>Verificar y entrar</Text>
                </Pressable>
              </>
            )}

            <View style={styles.row}>
              <Pressable style={styles.outlineButton} onPress={() => void autoDetectApi()}>
                <Text style={styles.outlineButtonText}>Autodetectar API</Text>
              </Pressable>
              <Pressable style={styles.outlineButton} onPress={() => void checkCurrentApi()}>
                <Text style={styles.outlineButtonText}>Probar API</Text>
              </Pressable>
            </View>

            {authLoading && <ActivityIndicator color={COLORS.accent} style={styles.loader} />}
          </View>

          {!!statusText && <Text style={styles.status}>{statusText}</Text>}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Nutri Tracker</Text>
          <Text style={styles.subtitle}>Dark personal nutrition tracker</Text>
        </View>
        <Text
          style={[
            styles.badge,
            apiStatus === "online"
              ? styles.badgeOnline
              : apiStatus === "offline"
                ? styles.badgeOffline
                : styles.badgeIdle,
          ]}
        >
          {apiStatus === "online" ? "API online" : apiStatus === "offline" ? "API offline" : "API"}
        </Text>
      </View>

      <View style={styles.tabBar}>
        {([
          { key: "scan", label: "Escanear" },
          { key: "dashboard", label: "Dashboard" },
          { key: "profile", label: "Perfil" },
          { key: "settings", label: "Ajustes" },
        ] as { key: AppTab; label: string }[]).map((item) => (
          <Pressable
            key={item.key}
            style={[styles.tabButton, tab === item.key && styles.tabButtonActive]}
            onPress={() => setTab(item.key)}
          >
            <Text style={[styles.tabButtonText, tab === item.key && styles.tabButtonTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!!statusText && <Text style={styles.status}>{statusText}</Text>}

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {tab === "scan" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Escaneo con cámara</Text>
              <Text style={styles.helperText}>No hay entrada manual. Escanea el barcode directamente.</Text>
              <Pressable style={styles.primaryButton} onPress={() => void openScanner()}>
                <Text style={styles.primaryButtonText}>Abrir escáner</Text>
              </Pressable>
              {loadingScan && <ActivityIndicator color={COLORS.accent} style={styles.loader} />}
              {lastBarcode ? <Text style={styles.helperText}>Último barcode: {lastBarcode}</Text> : null}
              {lookup?.message ? <Text style={styles.helperText}>{lookup.message}</Text> : null}
            </View>

            {product ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Producto actual</Text>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.helperText}>{product.brand ?? "Sin marca"}</Text>
                <Text style={styles.helperText}>
                  {product.kcal} kcal | P {product.protein_g} g | G {product.fat_g} g | C {product.carbs_g} g
                </Text>
                <Pressable style={styles.outlineButton} onPress={() => openQuantityModalForProduct(product)}>
                  <Text style={styles.outlineButtonText}>Registrar consumo</Text>
                </Pressable>
              </View>
            ) : null}

            {needsLabelFlow && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Crear producto desde etiqueta</Text>
                <TextInput
                  style={styles.input}
                  value={labelName}
                  onChangeText={setLabelName}
                  placeholder="Nombre del producto"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={styles.input}
                  value={labelBrand}
                  onChangeText={setLabelBrand}
                  placeholder="Marca"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={labelText}
                  onChangeText={setLabelText}
                  multiline
                  placeholder="Texto de etiqueta (OCR o manual)"
                  placeholderTextColor={COLORS.muted}
                />
                <View style={styles.row}>
                  <Pressable style={styles.outlineButton} onPress={() => void captureLabelPhoto()}>
                    <Text style={styles.outlineButtonText}>Foto etiqueta</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={() => void createProductFromLabel()}>
                    <Text style={styles.primaryButtonText}>Crear producto</Text>
                  </Pressable>
                </View>
                <Text style={styles.helperText}>Fotos: {labelPhotos.length}</Text>
                {uploadingLabel && <ActivityIndicator color={COLORS.accent} style={styles.loader} />}
                {labelQuestions.map((question) => (
                  <Text key={question} style={styles.warningText}>
                    - {question}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}

        {tab === "dashboard" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Resumen del día ({today})</Text>
              <MacroDonut
                segments={donutSegments}
                centerText={summary?.remaining ? `${Math.round(summary.remaining.kcal)} kcal` : "sin objetivo"}
              />

              <View style={styles.metricsRow}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Consumido</Text>
                  <Text style={styles.metricValue}>{Math.round(summary?.consumed.kcal ?? 0)} kcal</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Restante</Text>
                  <Text style={styles.metricValue}>
                    {summary?.remaining ? `${Math.round(summary.remaining.kcal)} kcal` : "-"}
                  </Text>
                </View>
              </View>

              <Text style={styles.subTitle}>Objetivo diario</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  value={goalKcal}
                  onChangeText={setGoalKcal}
                  keyboardType="numeric"
                  placeholder="kcal"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  value={goalProtein}
                  onChangeText={setGoalProtein}
                  keyboardType="numeric"
                  placeholder="protein"
                  placeholderTextColor={COLORS.muted}
                />
              </View>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  value={goalFat}
                  onChangeText={setGoalFat}
                  keyboardType="numeric"
                  placeholder="fat"
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  value={goalCarbs}
                  onChangeText={setGoalCarbs}
                  keyboardType="numeric"
                  placeholder="carbs"
                  placeholderTextColor={COLORS.muted}
                />
              </View>
              <View style={styles.row}>
                <Pressable style={styles.primaryButton} onPress={() => void saveGoals()}>
                  <Text style={styles.primaryButtonText}>Guardar objetivo</Text>
                </Pressable>
                <Pressable style={styles.outlineButton} onPress={() => void refreshAll()}>
                  <Text style={styles.outlineButtonText}>Actualizar</Text>
                </Pressable>
              </View>
              {savingGoals && <ActivityIndicator color={COLORS.accent} style={styles.loader} />}

              {goalFeedback ? (
                <View style={styles.feedbackCard}>
                  <Text style={styles.feedbackTitle}>
                    {goalFeedback.realistic ? "Objetivo realista" : "Ajusta tu objetivo"}
                  </Text>
                  {goalFeedback.notes.map((note) => (
                    <Text key={note} style={styles.helperText}>
                      - {note}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <View style={styles.calendarHeader}>
                <Text style={styles.sectionTitle}>Calendario de registros</Text>
                <View style={styles.row}>
                  <Pressable
                    style={styles.calendarNavButton}
                    onPress={() => setCalendarMonth((current) => nextMonth(current, -1))}
                  >
                    <Text style={styles.calendarNavText}>{"<"}</Text>
                  </Pressable>
                  <Text style={styles.calendarMonthLabel}>{calendarMonth}</Text>
                  <Pressable
                    style={styles.calendarNavButton}
                    onPress={() => setCalendarMonth((current) => nextMonth(current, 1))}
                  >
                    <Text style={styles.calendarNavText}>{">"}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.weekHeader}>
                {["L", "M", "X", "J", "V", "S", "D"].map((day) => (
                  <Text key={day} style={styles.weekHeaderText}>
                    {day}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {calendarGrid.map((day, index) => {
                  if (!day) {
                    return <View key={`empty-${index}`} style={styles.calendarCellEmpty} />;
                  }

                  const entry = calendarMap.get(day);
                  const active = Boolean(entry);

                  return (
                    <View
                      key={`day-${day}-${index}`}
                      style={[styles.calendarCell, active && styles.calendarCellActive]}
                    >
                      <Text style={[styles.calendarDayText, active && styles.calendarDayTextActive]}>{day}</Text>
                      {active ? (
                        <Text style={styles.calendarMiniText}>{entry?.intake_count} i</Text>
                      ) : (
                        <Text style={styles.calendarMiniText}>-</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {tab === "profile" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Tu composición corporal</Text>
              {profile ? (
                <>
                  <View style={styles.metricsRow}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>IMC</Text>
                      <Text style={[styles.metricValue, { color: profile.bmi_color }]}>{profile.bmi}</Text>
                      <Text style={styles.helperText}>{profile.bmi_category}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>% Grasa</Text>
                      <Text style={[styles.metricValue, { color: profile.body_fat_color }]}>
                        {profile.body_fat_percent ? `${profile.body_fat_percent}%` : "N/D"}
                      </Text>
                      <Text style={styles.helperText}>{profile.body_fat_category}</Text>
                    </View>
                  </View>

                  <Text style={styles.subTitle}>Datos base</Text>
                  <Text style={styles.helperText}>
                    {profile.weight_kg} kg | {profile.height_cm} cm | {profile.age} años | {profile.sex}
                  </Text>
                  <Text style={styles.helperText}>
                    Actividad: {profile.activity_level} | Objetivo: {profile.goal_type}
                  </Text>

                  {analysis ? (
                    <>
                      <Text style={styles.subTitle}>Objetivo recomendado</Text>
                      <Text style={styles.helperText}>
                        {Math.round(analysis.recommended_goal.kcal_goal)} kcal | P {Math.round(analysis.recommended_goal.protein_goal)} g | G {Math.round(analysis.recommended_goal.fat_goal)} g | C {Math.round(analysis.recommended_goal.carbs_goal)} g
                      </Text>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={styles.helperText}>Cargando perfil...</Text>
              )}
            </View>
          </>
        )}

        {tab === "settings" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Conexión</Text>
              <TextInput
                style={styles.input}
                value={apiDraftUrl}
                onChangeText={setApiDraftUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://192.168.1.50:8000"
                placeholderTextColor={COLORS.muted}
              />
              <View style={styles.row}>
                <Pressable style={styles.primaryButton} onPress={() => void applyApiUrl()}>
                  <Text style={styles.primaryButtonText}>Aplicar URL</Text>
                </Pressable>
                <Pressable style={styles.outlineButton} onPress={() => void checkCurrentApi()}>
                  <Text style={styles.outlineButtonText}>Probar</Text>
                </Pressable>
              </View>
              <Pressable style={styles.ghostButton} onPress={() => void autoDetectApi()}>
                <Text style={styles.ghostButtonText}>Autodetectar API</Text>
              </Pressable>
              <Text style={styles.helperText}>URL activa: {normalizeBaseUrl(apiBaseUrl)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Cuenta</Text>
              <Text style={styles.helperText}>Sesión activa con token bearer.</Text>
              <Pressable style={styles.dangerButton} onPress={logout}>
                <Text style={styles.dangerButtonText}>Cerrar sesión</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={scannerVisible} animationType="slide">
        <SafeAreaView style={styles.scannerContainer}>
          <Text style={styles.scannerTitle}>Escanea el código centrado en el recuadro</Text>
          <View style={styles.scannerWrap}>
            <CameraView
              style={styles.scannerCamera}
              facing="back"
              onBarcodeScanned={onBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
              }}
            />
            <View style={styles.scanFrame} />
          </View>
          <Pressable style={styles.primaryButton} onPress={() => setScannerVisible(false)}>
            <Text style={styles.primaryButtonText}>Cerrar</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>

      <Modal visible={quantityModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>¿Cuánto has consumido?</Text>
            <Text style={styles.helperText}>{product?.name ?? "Producto"}</Text>

            <View style={styles.rowWrap}>
              {([
                { key: "grams", label: "Gramos" },
                { key: "percent_pack", label: "% paquete" },
                { key: "units", label: "Unidades" },
              ] as { key: IntakeMethod; label: string }[])
                .filter((item) => {
                  if (item.key === "units") {
                    return Boolean(product?.serving_size_g);
                  }
                  if (item.key === "percent_pack") {
                    return Boolean(product?.net_weight_g);
                  }
                  return true;
                })
                .map((item) => (
                  <Pressable
                    key={item.key}
                    style={[styles.pill, quantityMethod === item.key && styles.pillActive]}
                    onPress={() => setQuantityMethod(item.key)}
                  >
                    <Text style={[styles.pillText, quantityMethod === item.key && styles.pillTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
            </View>

            {quantityMethod === "grams" && (
              <>
                <Text style={styles.helperText}>{Math.round(quantityGrams)} g</Text>
                <Slider
                  minimumValue={10}
                  maximumValue={500}
                  step={5}
                  value={quantityGrams}
                  minimumTrackTintColor={COLORS.accent}
                  maximumTrackTintColor="#2f3d5c"
                  onValueChange={setQuantityGrams}
                />
              </>
            )}

            {quantityMethod === "percent_pack" && (
              <>
                <Text style={styles.helperText}>{Math.round(quantityPercent)}%</Text>
                <Slider
                  minimumValue={1}
                  maximumValue={100}
                  step={1}
                  value={quantityPercent}
                  minimumTrackTintColor={COLORS.accent}
                  maximumTrackTintColor="#2f3d5c"
                  onValueChange={setQuantityPercent}
                />
              </>
            )}

            {quantityMethod === "units" && (
              <>
                <Text style={styles.helperText}>{quantityUnits.toFixed(1)} unidades</Text>
                <Slider
                  minimumValue={0.5}
                  maximumValue={6}
                  step={0.5}
                  value={quantityUnits}
                  minimumTrackTintColor={COLORS.accent}
                  maximumTrackTintColor="#2f3d5c"
                  onValueChange={setQuantityUnits}
                />
              </>
            )}

            <View style={styles.row}>
              <Pressable style={styles.outlineButton} onPress={() => setQuantityModalVisible(false)}>
                <Text style={styles.outlineButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void saveIntake()}>
                <Text style={styles.primaryButtonText}>Guardar</Text>
              </Pressable>
            </View>
            {savingIntake && <ActivityIndicator color={COLORS.accent} style={styles.loader} />}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    padding: 16,
    paddingBottom: 30,
    gap: 12,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.muted,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  badgeIdle: {
    color: COLORS.muted,
    backgroundColor: "#1a2438",
  },
  badgeOnline: {
    color: "#05241d",
    backgroundColor: COLORS.accent,
  },
  badgeOffline: {
    color: COLORS.danger,
    backgroundColor: "#44212a",
  },
  status: {
    color: COLORS.warning,
    fontSize: 13,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "#111a2e",
    borderWidth: 1,
    borderColor: "#1f2b45",
  },
  tabButtonActive: {
    backgroundColor: "#1e2f52",
    borderColor: COLORS.accent,
  },
  tabButtonText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  subTitle: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  warningText: {
    color: COLORS.warning,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: "#283756",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: COLORS.input,
    color: COLORS.text,
  },
  halfInput: {
    flex: 1,
  },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#05241d",
    fontWeight: "800",
    fontSize: 13,
  },
  outlineButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#37608a",
    backgroundColor: "#14233a",
  },
  outlineButtonText: {
    color: "#d2e2ff",
    fontWeight: "700",
    fontSize: 13,
  },
  ghostButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#355a77",
    backgroundColor: "#102030",
    alignItems: "center",
  },
  ghostButtonText: {
    color: "#9fd2ff",
    fontWeight: "700",
  },
  dangerButton: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#8d4252",
    backgroundColor: "#47212a",
  },
  dangerButtonText: {
    color: "#ffc4d1",
    fontWeight: "700",
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1a2942",
    borderWidth: 1,
    borderColor: "#2d4469",
  },
  pillActive: {
    backgroundColor: "#1a473a",
    borderColor: COLORS.accent,
  },
  pillText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  pillTextActive: {
    color: "#dbfff2",
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  loader: {
    marginTop: 6,
  },
  donutWrap: {
    alignItems: "center",
  },
  donutCenter: {
    position: "absolute",
    top: 78,
    alignSelf: "center",
    paddingHorizontal: 8,
  },
  donutCenterText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 16,
  },
  donutEmpty: {
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: "center",
    backgroundColor: "#0e1526",
  },
  legendWrap: {
    marginTop: 8,
    width: "100%",
    gap: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  legendText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    width: "48%",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#0d1525",
    borderWidth: 1,
    borderColor: "#26385a",
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 12,
  },
  metricValue: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  feedbackCard: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#36506f",
    backgroundColor: "#0f1f31",
    padding: 10,
    gap: 4,
  },
  feedbackTitle: {
    fontWeight: "700",
    color: "#9fd2ff",
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calendarNavButton: {
    borderWidth: 1,
    borderColor: "#314f73",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  calendarNavText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  calendarMonthLabel: {
    color: COLORS.text,
    fontWeight: "700",
    marginHorizontal: 8,
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  weekHeaderText: {
    width: "14%",
    textAlign: "center",
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 4,
  },
  calendarCell: {
    width: "13.4%",
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2b3f61",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0d1424",
  },
  calendarCellActive: {
    backgroundColor: "#18324f",
    borderColor: "#57a3ff",
  },
  calendarCellEmpty: {
    width: "13.4%",
    minHeight: 48,
  },
  calendarDayText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
  calendarDayTextActive: {
    color: "#ffffff",
  },
  calendarMiniText: {
    color: COLORS.muted,
    fontSize: 10,
  },
  scannerContainer: {
    flex: 1,
    padding: 16,
    gap: 10,
    backgroundColor: "#080d17",
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  scannerWrap: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#26435f",
  },
  scannerCamera: {
    flex: 1,
  },
  scanFrame: {
    position: "absolute",
    top: "40%",
    left: "10%",
    width: "80%",
    height: 90,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,8,20,0.76)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 8,
  },
});
