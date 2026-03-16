import { Image, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from "react-native";

import type { SocialPostType, SocialVisibility } from "../types";
import type { SocialUiBridge } from "../ui";

export function Composer(props: {
  ui: SocialUiBridge;
  visible: boolean;
  publishing: boolean;
  composerType: SocialPostType;
  composerVisibility: SocialVisibility;
  composerCaption: string;
  composerPhotos: string[];
  composerRecipeTitle: string;
  composerRecipeServings: string;
  composerRecipePrepTime: string;
  composerRecipeIngredients: string[];
  composerRecipeSteps: string[];
  composerRecipeTags: string;
  composerRecipeKcal: string;
  composerRecipeProtein: string;
  composerRecipeCarbs: string;
  composerRecipeFat: string;
  composerProgressWeight: string;
  composerProgressBodyFat: string;
  composerProgressBmi: string;
  composerProgressNotes: string;
  onClose: () => void;
  onPublish: () => void;
  onSetType: (value: SocialPostType) => void;
  onSetVisibility: (value: SocialVisibility) => void;
  onSetCaption: (value: string) => void;
  onPickLibrary: () => void;
  onPickCamera: () => void;
  onRemovePhoto: (index: number) => void;
  onSetRecipeTitle: (value: string) => void;
  onSetRecipeServings: (value: string) => void;
  onSetRecipePrepTime: (value: string) => void;
  onSetRecipeIngredients: (items: string[]) => void;
  onSetRecipeSteps: (items: string[]) => void;
  onSetRecipeTags: (value: string) => void;
  onSetRecipeKcal: (value: string) => void;
  onSetRecipeProtein: (value: string) => void;
  onSetRecipeCarbs: (value: string) => void;
  onSetRecipeFat: (value: string) => void;
  onSetProgressWeight: (value: string) => void;
  onSetProgressBodyFat: (value: string) => void;
  onSetProgressBmi: (value: string) => void;
  onSetProgressNotes: (value: string) => void;
}) {
  const { styles, ChoiceRow, InputField, TextInput, EditableStringListField, PrimaryButton, SecondaryButton } = props.ui;

  if (!props.visible) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={props.onClose}>
      <View style={styles.socialModalLayer as any}>
        <Pressable style={styles.socialModalBackdrop as any} onPress={props.onClose} />
        <KeyboardAvoidingView behavior="padding" style={styles.socialModalKeyboardWrap as any}>
          <ScrollView contentContainerStyle={styles.socialComposerScrollContent as any}>
            <View style={[styles.socialModalCard, styles.socialComposerModalCard] as any}>
              <View style={styles.socialModalHeaderRow as any}>
                <View style={styles.socialModalHeaderCopy as any}>
                  <Text style={styles.socialModalEyebrow as any}>Nueva publicación</Text>
                  <Text style={styles.socialModalTitle as any}>Comparte algo que aporte valor</Text>
                  <Text style={styles.socialModalSubtitle as any}>Fotos, recetas y progreso con el mismo criterio visual del resto de la app.</Text>
                </View>
                <Pressable style={styles.socialModalCloseButton as any} onPress={props.onClose}>
                  <Text style={styles.socialModalCloseButtonText as any}>×</Text>
                </Pressable>
              </View>

              <View style={styles.socialComposerConfigGrid as any}>
                <ChoiceRow
                  label="Tipo"
                  value={props.composerType}
                  onChange={(value: SocialPostType) => {
                    props.onSetType(value);
                    if (value === "progress") {
                      props.onSetVisibility("friends");
                    }
                  }}
                  options={[
                    { label: "Foto", value: "photo" },
                    { label: "Receta", value: "recipe" },
                    { label: "Progreso", value: "progress" },
                  ]}
                />
                <ChoiceRow
                  label="Visibilidad"
                  value={props.composerVisibility}
                  onChange={props.onSetVisibility}
                  options={[
                    { label: "Amigos", value: "friends" },
                    { label: "Pública", value: "public" },
                    { label: "Privada", value: "private" },
                  ]}
                />
              </View>

              <View style={styles.fieldWrap as any}>
                <Text style={styles.fieldLabel as any}>Texto</Text>
                <TextInput
                  value={props.composerCaption}
                  onChangeText={props.onSetCaption}
                  placeholder="Cuenta qué estás compartiendo y por qué merece la pena verlo"
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, styles.socialComposerTextarea] as any}
                />
              </View>

              <View style={styles.socialComposerSection as any}>
                <View style={styles.socialComposerSectionHead as any}>
                  <Text style={styles.socialComposerSectionTitle as any}>Fotos</Text>
                  <Text style={styles.socialComposerSectionMeta as any}>Hasta 3 imágenes por publicación.</Text>
                </View>
                <View style={styles.socialPhotoControls as any}>
                  <SecondaryButton
                    title="Galería"
                    onPress={props.onPickLibrary}
                    style={styles.socialComposerUtilityButton as any}
                    textStyle={styles.socialComposerUtilityButtonText as any}
                  />
                  <SecondaryButton
                    title="Cámara"
                    onPress={props.onPickCamera}
                    style={styles.socialComposerUtilityButton as any}
                    textStyle={styles.socialComposerUtilityButtonText as any}
                  />
                </View>
                {props.composerPhotos.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.socialComposerPhotoStrip as any}>
                    {props.composerPhotos.map((uri, index) => (
                      <View key={`composer-photo-${index}`} style={styles.socialComposerPhotoItem as any}>
                        <Image source={{ uri }} style={styles.socialComposerPhotoThumb as any} />
                        <Pressable style={styles.socialComposerPhotoRemove as any} onPress={() => props.onRemovePhoto(index)}>
                          <Text style={styles.socialComposerPhotoRemoveText as any}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.socialComposerPlaceholder as any}>
                    <Text style={styles.socialComposerPlaceholderText as any}>Añade al menos una imagen si vas a publicar una foto o una receta.</Text>
                  </View>
                )}
              </View>

              {props.composerType === "recipe" ? (
                <View style={styles.socialComposerSection as any}>
                  <View style={styles.socialComposerSectionHead as any}>
                    <Text style={styles.socialComposerSectionTitle as any}>Datos de la receta</Text>
                    <Text style={styles.socialComposerSectionMeta as any}>Ingredientes, pasos y macros para que la publicación sea útil.</Text>
                  </View>
                  <InputField label="Título" value={props.composerRecipeTitle} onChangeText={props.onSetRecipeTitle} placeholder="Bowl post-entreno" />
                  <View style={styles.socialRecipeComposerGrid as any}>
                    <InputField label="Raciones" value={props.composerRecipeServings} onChangeText={props.onSetRecipeServings} keyboardType="numeric" placeholder="2" />
                    <InputField label="Tiempo (min)" value={props.composerRecipePrepTime} onChangeText={props.onSetRecipePrepTime} keyboardType="numeric" placeholder="15" />
                  </View>
                  <EditableStringListField
                    ui={props.ui}
                    label="Ingredientes"
                    items={props.composerRecipeIngredients}
                    placeholder="200 g yogur, 30 g avena..."
                    addLabel="Añadir ingrediente"
                    onChange={props.onSetRecipeIngredients}
                  />
                  <EditableStringListField
                    ui={props.ui}
                    label="Pasos"
                    items={props.composerRecipeSteps}
                    placeholder="Mezcla, hornea, sirve..."
                    addLabel="Añadir paso"
                    onChange={props.onSetRecipeSteps}
                  />
                  <InputField label="Tags" value={props.composerRecipeTags} onChangeText={props.onSetRecipeTags} placeholder="high_protein, easy, breakfast" />
                  <View style={styles.socialRecipeComposerGrid as any}>
                    <InputField label="Kcal" value={props.composerRecipeKcal} onChangeText={props.onSetRecipeKcal} keyboardType="numeric" placeholder="520" />
                    <InputField label="Proteína" value={props.composerRecipeProtein} onChangeText={props.onSetRecipeProtein} keyboardType="numeric" placeholder="38" />
                    <InputField label="Carbs" value={props.composerRecipeCarbs} onChangeText={props.onSetRecipeCarbs} keyboardType="numeric" placeholder="44" />
                    <InputField label="Grasas" value={props.composerRecipeFat} onChangeText={props.onSetRecipeFat} keyboardType="numeric" placeholder="16" />
                  </View>
                </View>
              ) : null}

              {props.composerType === "progress" ? (
                <View style={styles.socialComposerSection as any}>
                  <View style={styles.socialComposerSectionHead as any}>
                    <Text style={styles.socialComposerSectionTitle as any}>Datos de progreso</Text>
                    <Text style={styles.socialComposerSectionMeta as any}>Actualiza métricas rápidas y añade contexto si hace falta.</Text>
                  </View>
                  <View style={styles.socialRecipeComposerGrid as any}>
                    <InputField label="Peso actual" value={props.composerProgressWeight} onChangeText={props.onSetProgressWeight} keyboardType="numeric" placeholder="78.5" />
                    <InputField label="% grasa" value={props.composerProgressBodyFat} onChangeText={props.onSetProgressBodyFat} keyboardType="numeric" placeholder="14.2" />
                    <InputField label="IMC" value={props.composerProgressBmi} onChangeText={props.onSetProgressBmi} keyboardType="numeric" placeholder="24.1" />
                  </View>
                  <View style={styles.fieldWrap as any}>
                    <Text style={styles.fieldLabel as any}>Notas</Text>
                    <TextInput
                      value={props.composerProgressNotes}
                      onChangeText={props.onSetProgressNotes}
                      placeholder="Qué ha cambiado esta semana"
                      multiline
                      textAlignVertical="top"
                      style={[styles.input, styles.socialComposerTextarea] as any}
                    />
                  </View>
                </View>
              ) : null}

              <View style={styles.socialComposerActions as any}>
                <SecondaryButton
                  title="Cancelar"
                  onPress={props.onClose}
                  style={styles.socialComposerFooterSecondaryButton as any}
                  textStyle={styles.socialComposerFooterSecondaryButtonText as any}
                />
                <PrimaryButton
                  title={props.publishing ? "Publicando..." : "Publicar"}
                  onPress={props.onPublish}
                  loading={props.publishing}
                  style={styles.socialComposerFooterPrimaryButton as any}
                  textStyle={styles.socialComposerFooterPrimaryButtonText as any}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
