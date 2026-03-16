import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n } from "../../i18n";
import { themeForPlatform } from "../../theme/colors";

const theme = themeForPlatform(Platform.OS);

export function WebLanguageSwitch() {
  const { language, setLanguage } = useI18n();
  const options = [
    { value: "es" as const, flag: "🇪🇸", label: "ES" },
    { value: "en" as const, flag: "🇬🇧", label: "EN" },
  ];

  return (
    <View style={styles.switchWrap}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => {
            void setLanguage(option.value);
          }}
          style={({ pressed }) => [
            styles.option,
            language === option.value && styles.optionActive,
            pressed && styles.optionPressed,
          ]}
        >
          <Text style={styles.flag}>{option.flag}</Text>
          <Text style={[styles.code, language === option.value && styles.codeActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  switchWrap: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 5,
    borderRadius: 999,
    backgroundColor: "#131821",
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  option: {
    minWidth: 72,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    justifyContent: "center",
  },
  optionActive: {
    backgroundColor: "#1c232d",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.18)",
  },
  optionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  flag: {
    fontSize: 16,
  },
  code: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  codeActive: {
    color: theme.text,
  },
});
