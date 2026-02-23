import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";

type NutritionBasis = "per_100g" | "per_100ml" | "per_serving";
type LookupSource = "local" | "openfoodfacts_imported" | "openfoodfacts_incomplete" | "not_found";
type IntakeMethod = "grams" | "percent_pack" | "units";

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

const DEFAULT_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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

export default function App() {
  const today = useMemo(() => formatDateLocal(new Date()), []);

  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
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
  const [statusText, setStatusText] = useState("");

  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const endpoint = (path: string): string => `${apiBaseUrl.replace(/\/+$/, "")}${path}`;

  const loadSummary = async () => {
    try {
      const response = await fetch(endpoint(`/days/${today}/summary`));
      if (!response.ok) {
        throw new Error(`No se pudo cargar summary (${response.status})`);
      }
      const data = (await response.json()) as DaySummary;
      setSummary(data);
      if (data.goal) {
        setGoalKcal(String(data.goal.kcal_goal));
        setGoalProtein(String(data.goal.protein_goal));
        setGoalFat(String(data.goal.fat_goal));
        setGoalCarbs(String(data.goal.carbs_goal));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setStatusText(message);
    }
  };

  useEffect(() => {
    void loadSummary();
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
      const response = await fetch(endpoint(`/products/by_barcode/${encodeURIComponent(eanValue.trim())}`));
      const data = (await response.json()) as LookupResponse;
      if (!response.ok) {
        throw new Error(data.message ?? `Error ${response.status}`);
      }

      setLookup(data);
      if (data.product) {
        setProduct(data.product);
        setLabelName(data.product.name);
        setLabelBrand(data.product.brand ?? "");
      } else {
        setProduct(null);
      }
      if (data.message) {
        setStatusText(data.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al buscar barcode";
      setStatusText(message);
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

      const data = (await response.json()) as LabelResponse;
      if (!response.ok) {
        throw new Error(`Error al subir etiqueta (${response.status})`);
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
        setStatusText("Producto guardado en la base local.");
      } else {
        setStatusText("Faltan datos críticos. Responde las preguntas y vuelve a enviar.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error subiendo etiqueta";
      setStatusText(message);
    } finally {
      setUploadingLabel(false);
    }
  };

  const saveIntake = async () => {
    if (!product) {
      Alert.alert("Sin producto", "Primero busca o crea un producto.");
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
      const response = await fetch(endpoint("/intakes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? `Error ${response.status}`);
      }

      setStatusText("Intake guardado.");
      await loadSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar intake";
      setStatusText(message);
    } finally {
      setPostingIntake(false);
    }
  };

  const saveGoal = async () => {
    setSavingGoals(true);
    try {
      const payload = {
        kcal_goal: Number(goalKcal),
        protein_goal: Number(goalProtein),
        fat_goal: Number(goalFat),
        carbs_goal: Number(goalCarbs),
      };

      const response = await fetch(endpoint(`/goals/${today}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`No se pudo guardar objetivo (${response.status})`);
      }

      setStatusText("Objetivos del día guardados.");
      await loadSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando objetivos";
      setStatusText(message);
    } finally {
      setSavingGoals(false);
    }
  };

  const needsLabelFlow =
    lookup?.source === "openfoodfacts_incomplete" ||
    lookup?.source === "not_found" ||
    (lookup?.missing_fields?.length ?? 0) > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Nutri Tracker MVP</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>API</Text>
          <TextInput
            style={styles.input}
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://localhost:8000"
          />
          <Pressable style={styles.secondaryButton} onPress={() => void loadSummary()}>
            <Text style={styles.secondaryButtonText}>Recargar dashboard</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1) Barcode</Text>
          <TextInput
            style={styles.input}
            value={barcode}
            onChangeText={setBarcode}
            keyboardType="number-pad"
            placeholder="EAN/UPC"
          />
          <View style={styles.row}>
            <Pressable style={styles.primaryButton} onPress={() => void searchBarcode(barcode)}>
              <Text style={styles.primaryButtonText}>Buscar</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void openScanner()}>
              <Text style={styles.secondaryButtonText}>Escanear</Text>
            </Pressable>
          </View>
          {loadingLookup && <ActivityIndicator style={styles.loader} />}
          {lookup && (
            <Text style={styles.helperText}>
              Fuente: {lookup.source} {lookup.message ? `| ${lookup.message}` : ""}
            </Text>
          )}
          {lookup?.missing_fields?.length ? (
            <Text style={styles.helperText}>Campos faltantes: {lookup.missing_fields.join(", ")}</Text>
          ) : null}
        </View>

        {product && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Producto seleccionado</Text>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.helperText}>{product.brand ?? "Sin marca"}</Text>
            <Text style={styles.helperText}>Base nutricional: {basisLabel(product.nutrition_basis)}</Text>
            <Text style={styles.helperText}>
              {product.kcal} kcal | P {product.protein_g} g | G {product.fat_g} g | C {product.carbs_g} g
            </Text>
          </View>
        )}

        {needsLabelFlow && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>2) Foto de etiqueta</Text>
            <TextInput
              style={styles.input}
              value={labelName}
              onChangeText={setLabelName}
              placeholder="Nombre del producto"
            />
            <TextInput
              style={styles.input}
              value={labelBrand}
              onChangeText={setLabelBrand}
              placeholder="Marca (opcional)"
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={labelText}
              onChangeText={setLabelText}
              multiline
              placeholder="Texto OCR/manual de la etiqueta (opcional, recomendado)"
            />
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => void captureLabelPhoto()}>
                <Text style={styles.secondaryButtonText}>Capturar etiqueta</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void sendLabelToApi()}>
                <Text style={styles.primaryButtonText}>Enviar</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>Fotos capturadas: {labelPhotos.length}</Text>
            {uploadingLabel && <ActivityIndicator style={styles.loader} />}
            {labelQuestions.map((question) => (
              <Text key={question} style={styles.questionText}>
                - {question}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4) Registrar consumo</Text>
          <View style={styles.rowWrap}>
            {(["grams", "percent_pack", "units"] as IntakeMethod[]).map((option) => (
              <Pressable
                key={option}
                style={[styles.pill, method === option && styles.pillActive]}
                onPress={() => setMethod(option)}
              >
                <Text style={[styles.pillText, method === option && styles.pillTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>

          {method === "grams" && (
            <>
              <Text style={styles.helperText}>{Math.round(grams)} g</Text>
              <Slider minimumValue={10} maximumValue={500} step={5} value={grams} onValueChange={setGrams} />
            </>
          )}

          {method === "percent_pack" && (
            <>
              <Text style={styles.helperText}>{Math.round(percentPack)} % paquete</Text>
              <Slider
                minimumValue={1}
                maximumValue={100}
                step={1}
                value={percentPack}
                onValueChange={setPercentPack}
              />
            </>
          )}

          {method === "units" && (
            <>
              <Text style={styles.helperText}>{units.toFixed(1)} unidades</Text>
              <Slider minimumValue={0.5} maximumValue={6} step={0.5} value={units} onValueChange={setUnits} />
            </>
          )}

          <Pressable style={styles.primaryButton} onPress={() => void saveIntake()}>
            <Text style={styles.primaryButtonText}>Guardar intake</Text>
          </Pressable>
          {postingIntake && <ActivityIndicator style={styles.loader} />}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5) Dashboard ({today})</Text>
          <Text style={styles.helperText}>Objetivos diarios</Text>
          <TextInput style={styles.input} value={goalKcal} onChangeText={setGoalKcal} keyboardType="numeric" placeholder="kcal" />
          <TextInput
            style={styles.input}
            value={goalProtein}
            onChangeText={setGoalProtein}
            keyboardType="numeric"
            placeholder="protein g"
          />
          <TextInput style={styles.input} value={goalFat} onChangeText={setGoalFat} keyboardType="numeric" placeholder="fat g" />
          <TextInput
            style={styles.input}
            value={goalCarbs}
            onChangeText={setGoalCarbs}
            keyboardType="numeric"
            placeholder="carbs g"
          />
          <Pressable style={styles.primaryButton} onPress={() => void saveGoal()}>
            <Text style={styles.primaryButtonText}>Guardar objetivos</Text>
          </Pressable>
          {savingGoals && <ActivityIndicator style={styles.loader} />}

          {summary && (
            <>
              <Text style={styles.subTitle}>Consumido</Text>
              <Text style={styles.helperText}>
                {summary.consumed.kcal} kcal | P {summary.consumed.protein_g} | G {summary.consumed.fat_g} | C {summary.consumed.carbs_g}
              </Text>

              <Text style={styles.subTitle}>Restante</Text>
              <Text style={styles.helperText}>
                {summary.remaining ? `${summary.remaining.kcal} kcal | P ${summary.remaining.protein_g} | G ${summary.remaining.fat_g} | C ${summary.remaining.carbs_g}` : "Define objetivo para ver restante"}
              </Text>

              <Text style={styles.subTitle}>Intakes del día</Text>
              {summary.intakes.length === 0 && <Text style={styles.helperText}>Sin intakes registrados.</Text>}
              {summary.intakes.map((item) => (
                <View key={item.id} style={styles.intakeRow}>
                  <Text style={styles.helperText}>#{item.id} - {item.quantity_g?.toFixed(1) ?? "0"} g</Text>
                  <Text style={styles.helperText}>
                    {item.nutrients.kcal} kcal | P {item.nutrients.protein_g} | G {item.nutrients.fat_g} | C {item.nutrients.carbs_g}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        {!!statusText && <Text style={styles.status}>{statusText}</Text>}
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
    backgroundColor: "#f6f8fb",
  },
  container: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: "#111827",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
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
    gap: 8,
    flexWrap: "wrap",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#0f766e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  pill: {
    backgroundColor: "#e5e7eb",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: "#0f766e",
  },
  pillText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffffff",
  },
  helperText: {
    color: "#4b5563",
    fontSize: 13,
  },
  questionText: {
    color: "#92400e",
    fontSize: 13,
  },
  status: {
    color: "#0f172a",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
  },
  loader: {
    marginTop: 6,
  },
  intakeRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    marginTop: 4,
  },
  scannerContainer: {
    flex: 1,
    padding: 16,
    gap: 10,
    backgroundColor: "#f8fafc",
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  scannerCamera: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
});
