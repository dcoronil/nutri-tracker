import { Platform } from "react-native";

const memoryStorage = new Map<string, string>();

let secureStoreModulePromise: Promise<typeof import("expo-secure-store")> | null = null;

async function getSecureStoreModule(): Promise<typeof import("expo-secure-store")> {
  if (!secureStoreModulePromise) {
    secureStoreModulePromise = import("expo-secure-store");
  }
  return await secureStoreModulePromise;
}

function readBrowserStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // localStorage can be blocked by browser privacy policies
  }
  return null;
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    const storage = readBrowserStorage();
    if (!storage) {
      return memoryStorage.get(key) ?? null;
    }
    return storage.getItem(key);
  }

  const secureStore = await getSecureStoreModule();
  return await secureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    const storage = readBrowserStorage();
    if (!storage) {
      memoryStorage.set(key, value);
      return;
    }
    storage.setItem(key, value);
    return;
  }

  const secureStore = await getSecureStoreModule();
  await secureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    const storage = readBrowserStorage();
    if (!storage) {
      memoryStorage.delete(key);
      return;
    }
    storage.removeItem(key);
    return;
  }

  const secureStore = await getSecureStoreModule();
  await secureStore.deleteItemAsync(key);
}

