import { Platform } from "react-native";

export function guessImageMimeType(nameOrUri: string): string {
  const normalized = nameOrUri.toLowerCase();
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalized.endsWith(".heic") || normalized.endsWith(".heif")) {
    return "image/heic";
  }
  return "image/jpeg";
}

export async function appendImageUriToFormData(form: FormData, field: string, uri: string, fallbackName: string): Promise<void> {
  const sanitizedName = fallbackName.replace(/\?.*$/, "");
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    form.append(field, blob, sanitizedName);
    return;
  }
  form.append(
    field,
    {
      uri,
      name: sanitizedName,
      type: guessImageMimeType(sanitizedName || uri),
    } as unknown as Blob,
  );
}
