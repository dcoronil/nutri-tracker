import { Pressable, Text, View } from "react-native";

import type { SocialPostType } from "../types";
import type { SocialUiBridge } from "../ui";

export function SocialHeader(props: {
  ui: SocialUiBridge;
  title: string;
  subtitle: string;
  segmentsNode: import("react").ReactNode;
  filtersNode?: import("react").ReactNode;
  onCreate: (type?: SocialPostType) => void;
  createLabel?: string;
}) {
  const { styles, PrimaryButton } = props.ui;

  return (
    <View style={styles.socialHeroPanel as any}>
      <View style={styles.socialHeroShell as any}>
        <View style={styles.socialHeroCopy as any}>
          <Text style={styles.socialHeroEyebrow as any}>NutrIA Social</Text>
          <Text style={styles.socialHeroTitle as any}>{props.title}</Text>
          <Text style={styles.socialHeroSubtitle as any}>{props.subtitle}</Text>
          <View style={styles.socialHeroInlineMeta as any}>
            <Text style={styles.socialHeroInlineMetaText as any}>Fotos</Text>
            <Text style={styles.socialHeroInlineMetaDot as any}>•</Text>
            <Text style={styles.socialHeroInlineMetaText as any}>Recetas</Text>
            <Text style={styles.socialHeroInlineMetaDot as any}>•</Text>
            <Text style={styles.socialHeroInlineMetaText as any}>Progreso</Text>
          </View>
        </View>

        <View style={styles.socialHeroActions as any}>
          <PrimaryButton
            title={props.createLabel ?? "Crear publicación"}
            onPress={() => props.onCreate("photo")}
            style={styles.socialHeroPrimaryAction as any}
            textStyle={styles.socialHeroPrimaryActionText as any}
          />
          <Text style={styles.socialHeroActionHint as any}>Comparte una foto, una receta o una actualización sin salir del flujo.</Text>
        </View>
      </View>

      <View style={styles.socialHeroNavWrap as any}>{props.segmentsNode}</View>
      {props.filtersNode ? <View style={styles.socialHeroFiltersWrap as any}>{props.filtersNode}</View> : null}
    </View>
  );
}
