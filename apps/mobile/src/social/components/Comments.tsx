import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { formatRelativeTime } from "../presentation";
import type { SocialComment } from "../types";
import type { SocialUiBridge } from "../ui";

export function Comments(props: {
  ui: SocialUiBridge;
  visible: boolean;
  loading: boolean;
  items: SocialComment[];
  draft: string;
  sending: boolean;
  onClose: () => void;
  onChangeDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  const { styles, theme, AvatarCircle, PrimaryButton, TextInput } = props.ui;

  if (!props.visible) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={props.onClose}>
      <View style={styles.socialModalLayer as any}>
        <Pressable style={styles.socialModalBackdrop as any} onPress={props.onClose} />
        <KeyboardAvoidingView behavior="padding" style={styles.socialModalKeyboardWrap as any}>
          <View style={[styles.socialModalCard, styles.socialCommentsModalCard] as any}>
            <View style={styles.socialModalHeaderRow as any}>
              <View style={styles.socialModalHeaderCopy as any}>
                <Text style={styles.socialModalEyebrow as any}>Conversación</Text>
                <Text style={styles.socialModalTitle as any}>Comentarios</Text>
                <Text style={styles.socialModalSubtitle as any}>Responde sin salir del contexto de la publicación.</Text>
              </View>
              <Pressable style={styles.socialModalCloseButton as any} onPress={props.onClose}>
                <Text style={styles.socialModalCloseButtonText as any}>×</Text>
              </Pressable>
            </View>

            {props.loading ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <ScrollView style={styles.socialCommentsList as any} contentContainerStyle={styles.socialCommentsListContent as any}>
                {props.items.length ? (
                  props.items.map((comment) => (
                    <View key={`comment-${comment.id}`} style={styles.socialCommentRow as any}>
                      <AvatarCircle letter={comment.user.username} imageUrl={comment.user.avatar_url} />
                      <View style={styles.socialCommentBubble as any}>
                        <View style={styles.socialCommentHeader as any}>
                          <Text style={styles.socialCommentAuthor as any}>@{comment.user.username}</Text>
                          <Text style={styles.socialCommentMeta as any}>{formatRelativeTime(comment.created_at)}</Text>
                        </View>
                        <Text style={styles.socialCommentText as any}>{comment.text}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.helperText as any}>Todavía no hay comentarios.</Text>
                )}
              </ScrollView>
            )}
            <View style={styles.socialCommentComposer as any}>
              <TextInput
                value={props.draft}
                onChangeText={props.onChangeDraft}
                placeholder="Escribe un comentario"
                style={[styles.input, styles.socialCommentInput] as any}
              />
              <PrimaryButton
                title={props.sending ? "Enviando..." : "Enviar"}
                onPress={props.onSubmit}
                disabled={!props.draft.trim() || props.sending}
                style={styles.socialCommentSubmitButton as any}
                textStyle={styles.socialCommentSubmitButtonText as any}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
