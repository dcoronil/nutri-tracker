import { Image, Pressable, StyleSheet, View } from "react-native";

const WORDMARK_ASSET = require("../../../assets/branding/nutria-wordmark.png");
const WORDMARK_ASPECT_RATIO = 1470 / 386;

export function BrandWordmark(props: {
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="NutrIA"
      style={({ pressed }) => [styles.brandButton, pressed && styles.brandButtonPressed]}
      onPress={props.onPress}
    >
      <View style={[styles.wordmarkFrame, props.compact && styles.wordmarkFrameCompact]}>
        <Image source={WORDMARK_ASSET} resizeMode="contain" style={styles.wordmarkImage} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandButton: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    alignSelf: "flex-start",
  },
  brandButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  wordmarkFrame: {
    height: 38,
    aspectRatio: WORDMARK_ASPECT_RATIO,
    justifyContent: "center",
  },
  wordmarkFrameCompact: {
    height: 34,
  },
  wordmarkImage: {
    width: "100%",
    height: "100%",
  },
});
