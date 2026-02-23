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

type NutritionBasis = "per_100g" | "per_100ml" | "per_serving";
type LookupSource = "local" | "openfoodfacts_imported" | "openfoodfacts_incomplete" | "not_found";
type IntakeMethod = "grams" | "percent_pack" | "units";
type AppTab = "scan" | "intake" | "dashboard" | "settings";
type ApiHealthStatus = "idle" | "checking" | "online" | "offline";

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

type DaySummary = {
  date: string;
  goal: Goal | null;
  consumed: Nutrients;
  remaining: Nutrients | null;
  intakes: IntakeItem[];
};

function formatDateLocal(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function basisLabel(basis: NutritionBasis): string {
  if (basis === "per_100g") {
    return "por 100 g";
  }
  if (basis === "per_100ml") {
    return "por 100 ml";
  }
  return "por porción";
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
  const normalizedCurrent = normalizeBaseUrl(current);
  if (normalizedCurrent) {
    candidates.add(normalizedCurrent);
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
  const fallback = "Error inesperado de red";
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message || fallback;
  if (message.includes("Network request failed")) {
    return `No se pudo conectar con la API (${baseUrl}). Revisa la URL en Ajustes y que API esté arriba.`;
  }

  return message;
}

export default function App() {
  const today = useMemo(() => formatDateLocal(new Date()), []);

  const [tab, setTab] = useState<AppTab>("scan");
  const [apiBaseUrl, setApiBaseUrl] = useState(inferDefaultApiBaseUrl());
  const [apiDraftUrl, setApiDraftUrl] = useState(inferDefaultApiBaseUrl());
  const [apiStatus, setApiStatus] = useState<ApiHealthStatus>("idle");
  const [statusText, setStatusText] = useState("");

  const [barcode, setBarcode] = useState("");
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);

  const [labelName, setLabelName] = useState("");
  const [labelBrand, setLabelBrand] = useState("");
  const [labelText, setLabelText] = useState("");
  const [labelPhotos, setLabelPhotos] = useState<string[]>([]);
  const [labelQuestions, setLabelQuestions] = useState<string[]>([]);
  const [uploadingLabel, setUploadingLabel] = useState(false);

  const [method, setMethod] = useState<IntakeMethod>("grams");
  const [grams, setGrams] = useState(100);
  const [percentPack, setPercentPack] = useState(25);
  const [units, setUnits] = useState(1);
  const [postingIntake, setPostingIntake] = useState(false);

  const [goalKcal, setGoalKcal] = useState("2000");
  const [goalProtein, setGoalProtein] = useState("130");
  const [goalFat, setGoalFat] = useState("70");
  const [goalCarbs, setGoalCarbs] = useState("220");
  const [savingGoals, setSavingGoals] = useState(false);

  const [summary, setSummary] = useState<DaySummary | null>(null);

  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const endpoint = (path: string, baseUrlOverride?: string): string => {
    const base = normalizeBaseUrl(baseUrlOverride ?? apiBaseUrl);
    return `${base}${path}`;
  };

  const requestJson = async <T,>(
    path: string,
    init?: RequestInit,
    baseUrlOverride?: string,
  ): Promise<T> => {
    const response = await fetch(endpoint(path, baseUrlOverride), init);
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

  const checkHealthAt = async (baseUrl: string): Promise<boolean> => {
    try {
      await requestJson<{ status: string }>("/health", undefined, baseUrl);
      return true;
    } catch {
      return false;
    }
  };

  const checkCurrentApi = async (showSuccessMessage = true) => {
    const normalized = normalizeBaseUrl(apiBaseUrl);
    if (!normalized) {
      setApiStatus("offline");
      setStatusText("Define una URL de API válida en Ajustes.");
      return false;
    }

    setApiStatus("checking");
    const ok = await checkHealthAt(normalized);
    if (ok) {
      setApiStatus("online");
      if (showSuccessMessage) {
        setStatusText("API conectada correctamente.");
      }
      return true;
    }

    setApiStatus("offline");
    setStatusText(`No hay conexión con API (${normalized}).`);
    return false;
  };

  const loadSummary = async (baseUrlOverride?: string) => {
    try {
      const data = await requestJson<DaySummary>(`/days/${today}/summary`, undefined, baseUrlOverride);
      setSummary(data);
      if (data.goal) {
        setGoalKcal(String(data.goal.kcal_goal));
        setGoalProtein(String(data.goal.protein_goal));
        setGoalFat(String(data.goal.fat_goal));
        setGoalCarbs(String(data.goal.carbs_goal));
      }
    } catch (error) {
      setStatusText(parseError(error, normalizeBaseUrl(baseUrlOverride ?? apiBaseUrl)));
    }
  };

  const applyApiUrl = async () => {
    const normalized = normalizeBaseUrl(apiDraftUrl);
    if (!normalized) {
      Alert.alert("URL inválida", "Ingresa una URL válida como http://192.168.1.50:8000");
      return;
    }

    setApiBaseUrl(normalized);
    setApiDraftUrl(normalized);

    setApiStatus("checking");
    const ok = await checkHealthAt(normalized);
    if (!ok) {
      setApiStatus("offline");
      setStatusText(`No se pudo conectar a ${normalized}.`);
      return;
    }

    setApiStatus("online");
    setStatusText("API conectada. Dashboard actualizado.");
    await loadSummary(normalized);
  };

  const autoDetectApi = async () => {
    setApiStatus("checking");
    const candidates = buildApiCandidates(apiDraftUrl);

    for (const candidate of candidates) {
      // Stop at first healthy endpoint.
      if (await checkHealthAt(candidate)) {
        setApiBaseUrl(candidate);
        setApiDraftUrl(candidate);
        setApiStatus("online");
        setStatusText(`API detectada automáticamente en ${candidate}`);
        await loadSummary(candidate);
        return;
      }
    }

    setApiStatus("offline");
    setStatusText("No encontré API activa. Revisa IP local, puerto 8000 y que la API esté levantada.");
  };

  useEffect(() => {
    void (async () => {
      const ok = await checkCurrentApi(false);
      if (ok) {
        await loadSummary();
      }
    })();
  }, []);

  const searchBarcode = async (eanValue: string) => {
    if (!eanValue.trim()) {
      Alert.alert("Barcode requerido", "Ingresa o escanea un EAN/UPC.");
      return;
    }

    setLoadingLookup(true);
    setLookup(null);
    setLabelQuestions([]);

    try {
      const data = await requestJson<LookupResponse>(
        `/products/by_barcode/${encodeURIComponent(eanValue.trim())}`,
      );

      setLookup(data);
      if (data.product) {
        setProduct(data.product);
        setLabelName(data.product.name);
        setLabelBrand(data.product.brand ?? "");
        setTab("intake");
      } else {
        setProduct(null);
      }

      setStatusText(data.message ?? "Búsqueda completada.");
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setLoadingLookup(false);
    }
  };

  const openScanner = async () => {
    const granted = cameraPermission?.granted ?? false;
    if (!granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert("Permiso denegado", "Activa permisos de cámara para escanear barcodes.");
        return;
      }
    }
    setScanLocked(false);
    setScannerVisible(true);
  };

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanLocked) {
      return;
    }
    setScanLocked(true);
    setScannerVisible(false);
    setBarcode(result.data);
    void searchBarcode(result.data);
  };

  const captureLabelPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso denegado", "Activa permisos de cámara para capturar etiqueta.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });

    const firstAsset = result.canceled ? undefined : result.assets[0];
    if (!firstAsset?.uri) {
      return;
    }

    setLabelPhotos((current) => [...current, firstAsset.uri]);
  };

  const sendLabelToApi = async () => {
    if (!labelName.trim()) {
      Alert.alert("Nombre requerido", "Completa el nombre del producto.");
      return;
    }

    setUploadingLabel(true);

    try {
      const formData = new FormData();
      if (barcode.trim()) {
        formData.append("barcode", barcode.trim());
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

      const response = await fetch(endpoint("/products/from_label_photo"), {
        method: "POST",
        body: formData,
      });

      const rawBody = await response.text();
      let data: LabelResponse | null = null;
      if (rawBody) {
        try {
          data = JSON.parse(rawBody) as LabelResponse;
        } catch {
          throw new Error("La API devolvió una respuesta inválida al procesar etiqueta.");
        }
      }

      if (!response.ok) {
        throw new Error(`Error al subir etiqueta (${response.status})`);
      }
      if (!data) {
        throw new Error("La API devolvió una respuesta vacía al procesar etiqueta.");
      }

      setLabelQuestions(data.questions ?? []);
      if (data.created && data.product) {
        setProduct(data.product);
        setLookup({
          source: "local",
          product: data.product,
          missing_fields: [],
          message: "Producto creado desde etiqueta",
        });
        setStatusText("Producto guardado en base local.");
        setTab("intake");
      } else {
        setStatusText("Faltan datos críticos. Responde preguntas y vuelve a enviar.");
      }
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setUploadingLabel(false);
    }
  };

  const saveIntake = async () => {
    if (!product) {
      Alert.alert("Sin producto", "Busca o crea un producto antes de registrar consumo.");
      return;
    }

    const payload: Record<string, number | string> = {
      product_id: product.id,
      method,
    };

    if (method === "grams") {
      payload.quantity_g = grams;
    }
    if (method === "percent_pack") {
      payload.percent_pack = percentPack;
    }
    if (method === "units") {
      payload.quantity_units = units;
    }

    setPostingIntake(true);

    try {
      await requestJson<IntakeItem>("/intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setStatusText("Intake guardado correctamente.");
      await loadSummary();
      setTab("dashboard");
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setPostingIntake(false);
    }
  };

  const saveGoal = async () => {
    setSavingGoals(true);
    try {
      await requestJson<Goal>(`/goals/${today}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kcal_goal: Number(goalKcal),
          protein_goal: Number(goalProtein),
          fat_goal: Number(goalFat),
          carbs_goal: Number(goalCarbs),
        }),
      });

      setStatusText("Objetivos guardados.");
      await loadSummary();
    } catch (error) {
      setStatusText(parseError(error, apiBaseUrl));
    } finally {
      setSavingGoals(false);
    }
  };

  const needsLabelFlow =
    lookup?.source === "openfoodfacts_incomplete" ||
    lookup?.source === "not_found" ||
    (lookup?.missing_fields?.length ?? 0) > 0;

  const renderApiStatus = () => {
    if (apiStatus === "checking") {
      return <Text style={[styles.badge, styles.badgeChecking]}>Comprobando API...</Text>;
    }
    if (apiStatus === "online") {
      return <Text style={[styles.badge, styles.badgeOnline]}>API online</Text>;
    }
    if (apiStatus === "offline") {
      return <Text style={[styles.badge, styles.badgeOffline]}>API offline</Text>;
    }
    return <Text style={[styles.badge, styles.badgeIdle]}>Sin comprobar</Text>;
  };

  const renderScanTab = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Escanear o buscar producto</Text>
        <TextInput
          style={styles.input}
          value={barcode}
          onChangeText={setBarcode}
          keyboardType="number-pad"
          placeholder="EAN/UPC"
          placeholderTextColor="#6a7a99"
        />
        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => void searchBarcode(barcode)}>
            <Text style={styles.primaryButtonText}>Buscar</Text>
          </Pressable>
          <Pressable style={styles.outlineButton} onPress={() => void openScanner()}>
            <Text style={styles.outlineButtonText}>Escanear</Text>
          </Pressable>
        </View>
        {loadingLookup && <ActivityIndicator color="#27f5c8" style={styles.loader} />}
        {lookup && (
          <Text style={styles.helperText}>
            Fuente: {lookup.source} {lookup.message ? `| ${lookup.message}` : ""}
          </Text>
        )}
        {lookup?.missing_fields?.length ? (
          <Text style={styles.warningText}>Faltan: {lookup.missing_fields.join(", ")}</Text>
        ) : null}
      </View>

      {product && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Producto seleccionado</Text>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.helperText}>{product.brand ?? "Sin marca"}</Text>
          <Text style={styles.helperText}>Base: {basisLabel(product.nutrition_basis)}</Text>
          <Text style={styles.helperText}>
            {product.kcal} kcal | P {product.protein_g} g | G {product.fat_g} g | C {product.carbs_g} g
          </Text>
        </View>
      )}

      {needsLabelFlow && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Crear desde etiqueta</Text>
          <TextInput
            style={styles.input}
            value={labelName}
            onChangeText={setLabelName}
            placeholder="Nombre del producto"
            placeholderTextColor="#6a7a99"
          />
          <TextInput
            style={styles.input}
            value={labelBrand}
            onChangeText={setLabelBrand}
            placeholder="Marca (opcional)"
            placeholderTextColor="#6a7a99"
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={labelText}
            onChangeText={setLabelText}
            multiline
            placeholder="Pega texto de la etiqueta para extraer macros"
            placeholderTextColor="#6a7a99"
          />
          <View style={styles.row}>
            <Pressable style={styles.outlineButton} onPress={() => void captureLabelPhoto()}>
              <Text style={styles.outlineButtonText}>Foto etiqueta</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => void sendLabelToApi()}>
              <Text style={styles.primaryButtonText}>Guardar producto</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>Fotos cargadas: {labelPhotos.length}</Text>
          {uploadingLabel && <ActivityIndicator color="#27f5c8" style={styles.loader} />}
          {labelQuestions.map((question) => (
            <Text key={question} style={styles.warningText}>
              - {question}
            </Text>
          ))}
        </View>
      )}
    </>
  );

  const renderIntakeTab = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Registrar consumo</Text>
        {!product ? (
          <Text style={styles.warningText}>
            Aún no hay producto activo. Ve a Escanear y selecciona un producto.
          </Text>
        ) : (
          <>
            <Text style={styles.helperText}>Producto: {product.name}</Text>
            <View style={styles.rowWrap}>
              {([
                { key: "grams", label: "Gramos" },
                { key: "percent_pack", label: "% paquete" },
                { key: "units", label: "Unidades" },
              ] as { key: IntakeMethod; label: string }[]).map((option) => (
                <Pressable
                  key={option.key}
                  style={[styles.pill, method === option.key && styles.pillActive]}
                  onPress={() => setMethod(option.key)}
                >
                  <Text style={[styles.pillText, method === option.key && styles.pillTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {method === "grams" && (
              <>
                <Text style={styles.helperText}>{Math.round(grams)} g</Text>
                <Slider
                  minimumValue={10}
                  maximumValue={500}
                  step={5}
                  value={grams}
                  minimumTrackTintColor="#27f5c8"
                  maximumTrackTintColor="#2f3d5c"
                  onValueChange={setGrams}
                />
              </>
            )}

            {method === "percent_pack" && (
              <>
                <Text style={styles.helperText}>{Math.round(percentPack)} % del paquete</Text>
                <Slider
                  minimumValue={1}
                  maximumValue={100}
                  step={1}
                  value={percentPack}
                  minimumTrackTintColor="#27f5c8"
                  maximumTrackTintColor="#2f3d5c"
                  onValueChange={setPercentPack}
                />
              </>
            )}

            {method === "units" && (
              <>
                <Text style={styles.helperText}>{units.toFixed(1)} unidades</Text>
                <Slider
                  minimumValue={0.5}
                  maximumValue={6}
                  step={0.5}
                  value={units}
                  minimumTrackTintColor="#27f5c8"
                  maximumTrackTintColor="#2f3d5c"
                  onValueChange={setUnits}
                />
              </>
            )}

            <Pressable style={styles.primaryButton} onPress={() => void saveIntake()}>
              <Text style={styles.primaryButtonText}>Guardar intake</Text>
            </Pressable>
            {postingIntake && <ActivityIndicator color="#27f5c8" style={styles.loader} />}
          </>
        )}
      </View>
    </>
  );

  const renderDashboardTab = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Resumen del día ({today})</Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Kcal</Text>
            <Text style={styles.metricValue}>{summary?.consumed.kcal ?? 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Prote</Text>
            <Text style={styles.metricValue}>{summary?.consumed.protein_g ?? 0} g</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Grasa</Text>
            <Text style={styles.metricValue}>{summary?.consumed.fat_g ?? 0} g</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Carb</Text>
            <Text style={styles.metricValue}>{summary?.consumed.carbs_g ?? 0} g</Text>
          </View>
        </View>

        <Text style={styles.subTitle}>Objetivos</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            value={goalKcal}
            onChangeText={setGoalKcal}
            keyboardType="numeric"
            placeholder="kcal"
            placeholderTextColor="#6a7a99"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            value={goalProtein}
            onChangeText={setGoalProtein}
            keyboardType="numeric"
            placeholder="protein g"
            placeholderTextColor="#6a7a99"
          />
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            value={goalFat}
            onChangeText={setGoalFat}
            keyboardType="numeric"
            placeholder="fat g"
            placeholderTextColor="#6a7a99"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            value={goalCarbs}
            onChangeText={setGoalCarbs}
            keyboardType="numeric"
            placeholder="carbs g"
            placeholderTextColor="#6a7a99"
          />
        </View>

        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => void saveGoal()}>
            <Text style={styles.primaryButtonText}>Guardar objetivos</Text>
          </Pressable>
          <Pressable style={styles.outlineButton} onPress={() => void loadSummary()}>
            <Text style={styles.outlineButtonText}>Actualizar</Text>
          </Pressable>
        </View>
        {savingGoals && <ActivityIndicator color="#27f5c8" style={styles.loader} />}

        <Text style={styles.subTitle}>Restante</Text>
        <Text style={styles.helperText}>
          {summary?.remaining
            ? `${summary.remaining.kcal} kcal | P ${summary.remaining.protein_g} | G ${summary.remaining.fat_g} | C ${summary.remaining.carbs_g}`
            : "Define objetivos para calcular restante."}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Intakes del día</Text>
        {!summary || summary.intakes.length === 0 ? (
          <Text style={styles.helperText}>Aún no hay intakes hoy.</Text>
        ) : (
          summary.intakes.map((item) => (
            <View key={item.id} style={styles.intakeRow}>
              <Text style={styles.intakeTitle}>
                #{item.id} - {item.quantity_g?.toFixed(1) ?? "0"} g ({item.method})
              </Text>
              <Text style={styles.helperText}>
                {item.nutrients.kcal} kcal | P {item.nutrients.protein_g} | G {item.nutrients.fat_g} | C {item.nutrients.carbs_g}
              </Text>
            </View>
          ))
        )}
      </View>
    </>
  );

  const renderSettingsTab = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Conexión API</Text>
        <Text style={styles.helperText}>Usa IP local en móvil físico, no localhost.</Text>
        <TextInput
          style={styles.input}
          value={apiDraftUrl}
          onChangeText={setApiDraftUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://192.168.1.50:8000"
          placeholderTextColor="#6a7a99"
        />
        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => void applyApiUrl()}>
            <Text style={styles.primaryButtonText}>Aplicar URL</Text>
          </Pressable>
          <Pressable style={styles.outlineButton} onPress={() => void checkCurrentApi()}>
            <Text style={styles.outlineButtonText}>Probar API</Text>
          </Pressable>
        </View>
        <Pressable style={styles.ghostButton} onPress={() => void autoDetectApi()}>
          <Text style={styles.ghostButtonText}>Autodetectar URL de API</Text>
        </Pressable>
        <Text style={styles.helperText}>URL activa: {normalizeBaseUrl(apiBaseUrl)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Guía rápida</Text>
        <Text style={styles.helperText}>1. En PC: `make api-dev`.</Text>
        <Text style={styles.helperText}>2. Móvil y PC en la misma WiFi.</Text>
        <Text style={styles.helperText}>3. Probar API con botón "Probar API".</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Nutri Tracker</Text>
          <Text style={styles.subtitle}>MVP personal de nutrición</Text>
        </View>
        {renderApiStatus()}
      </View>

      <View style={styles.tabBar}>
        {([
          { key: "scan", label: "Escanear" },
          { key: "intake", label: "Consumo" },
          { key: "dashboard", label: "Dashboard" },
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
        {tab === "scan" && renderScanTab()}
        {tab === "intake" && renderIntakeTab()}
        {tab === "dashboard" && renderDashboardTab()}
        {tab === "settings" && renderSettingsTab()}
      </ScrollView>

      <Modal visible={scannerVisible} animationType="slide">
        <SafeAreaView style={styles.scannerContainer}>
          <Text style={styles.scannerTitle}>Escanea EAN/UPC</Text>
          <CameraView
            style={styles.scannerCamera}
            facing="back"
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
            }}
          />
          <Pressable style={styles.primaryButton} onPress={() => setScannerVisible(false)}>
            <Text style={styles.primaryButtonText}>Cerrar</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#070b14",
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
    color: "#ecf2ff",
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: "#7f91b5",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  badgeIdle: {
    backgroundColor: "#1a2438",
    color: "#8ba0c9",
  },
  badgeChecking: {
    backgroundColor: "#2b2c1e",
    color: "#ffd166",
  },
  badgeOnline: {
    backgroundColor: "#153b30",
    color: "#6cfcc7",
  },
  badgeOffline: {
    backgroundColor: "#452029",
    color: "#ff9bb2",
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
    borderColor: "#27f5c8",
  },
  tabButtonText: {
    color: "#8ba0c9",
    fontSize: 13,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#e8f7ff",
  },
  status: {
    color: "#f5bd5e",
    fontSize: 13,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: "#111a2b",
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#1f2c46",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#e6eeff",
  },
  subTitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
    color: "#dce5fa",
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f5f8ff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#283756",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#0c1424",
    color: "#e9f2ff",
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
    backgroundColor: "#23d4ab",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#042019",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.2,
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
    color: "#c8d7f4",
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
    borderColor: "#2de4bf",
  },
  pillText: {
    color: "#9fb4d8",
    fontWeight: "700",
  },
  pillTextActive: {
    color: "#dbfff2",
  },
  helperText: {
    color: "#93a8cd",
    fontSize: 13,
  },
  warningText: {
    color: "#ffb96d",
    fontSize: 13,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
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
    color: "#86a0ca",
    fontSize: 12,
  },
  metricValue: {
    color: "#e5f0ff",
    marginTop: 4,
    fontSize: 18,
    fontWeight: "800",
  },
  intakeRow: {
    borderTopWidth: 1,
    borderTopColor: "#243554",
    paddingTop: 8,
    marginTop: 4,
  },
  intakeTitle: {
    color: "#dce8ff",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 3,
  },
  loader: {
    marginTop: 6,
  },
  scannerContainer: {
    flex: 1,
    padding: 16,
    gap: 10,
    backgroundColor: "#080d17",
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#e5ecff",
  },
  scannerCamera: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
});
