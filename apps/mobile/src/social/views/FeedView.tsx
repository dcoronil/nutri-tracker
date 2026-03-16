import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, Text, View } from "react-native";

import { SocialFeedSkeleton } from "../components/FeedSkeleton";
import { SocialHeader } from "../components/SocialHeader";
import { socialScopeCopy } from "../presentation";
import type { SocialFeedState, SocialPost, SocialPostType, SocialUser } from "../types";
import type { SocialUiBridge } from "../ui";

export function FeedView(props: {
  scope: "feed" | "explore";
  state: SocialFeedState;
  ui: SocialUiBridge;
  webMainScrollStyle: any;
  authUserId?: number | null;
  segmentsNode: import("react").ReactNode;
  filtersNode: import("react").ReactNode;
  onCreate: (type?: SocialPostType) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenProfile: (user: SocialUser) => void;
  onToggleLike: (post: SocialPost) => void;
  onOpenComments: (post: SocialPost) => void;
  onShare: (post: SocialPost) => void;
  onManagePost: (post: SocialPost) => void;
}) {
  const { styles, theme, AppCard, EmptyState, SocialPostCard, SecondaryButton, AvatarCircle } = props.ui;
  const state = props.state;
  const copy = socialScopeCopy(props.scope);

  const headerNode = (
    <View>
      <SocialHeader
        ui={props.ui}
        title={copy.title}
        subtitle={copy.subtitle}
        segmentsNode={props.segmentsNode}
        filtersNode={props.filtersNode}
        onCreate={props.onCreate}
      />

      <AppCard style={styles.socialCreatePromptCard as any}>
        <View style={styles.socialCreatePromptRow as any}>
          <View style={styles.socialCreatePromptIdentity as any}>
            <AvatarCircle letter="N" size={44} />
            <View style={styles.socialCreatePromptCopy as any}>
              <Text style={styles.socialCreatePromptTitle as any}>¿Qué quieres compartir hoy?</Text>
              <Text style={styles.socialCreatePromptSubtitle as any}>
                Abre el composer con el tipo que te encaje y publica sin perder tiempo.
              </Text>
            </View>
          </View>
          <SecondaryButton
            title="Crear publicación"
            onPress={() => props.onCreate("photo")}
            style={styles.socialCreateInlineButton as any}
            textStyle={styles.socialCreateInlineButtonText as any}
          />
        </View>

        <Pressable style={({ pressed }) => [styles.socialCreatePromptInput as any, pressed && styles.socialInteractivePressed as any]} onPress={() => props.onCreate("photo")}>
          <Text style={styles.socialCreatePromptPlaceholder as any}>Escribe una idea, añade fotos o comparte una receta con macros…</Text>
        </Pressable>

        <View style={styles.socialCreateQuickRow as any}>
          <Pressable style={({ pressed }) => [styles.socialCreateQuickChip as any, pressed && styles.socialInteractivePressed as any]} onPress={() => props.onCreate("photo")}>
            <Text style={styles.socialCreateQuickChipTitle as any}>Foto</Text>
            <Text style={styles.socialCreateQuickChipMeta as any}>Comida, compra o momento</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.socialCreateQuickChip as any, pressed && styles.socialInteractivePressed as any]} onPress={() => props.onCreate("recipe")}>
            <Text style={styles.socialCreateQuickChipTitle as any}>Receta</Text>
            <Text style={styles.socialCreateQuickChipMeta as any}>Ingredientes y macros</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.socialCreateQuickChip as any, pressed && styles.socialInteractivePressed as any]} onPress={() => props.onCreate("progress")}>
            <Text style={styles.socialCreateQuickChipTitle as any}>Progreso</Text>
            <Text style={styles.socialCreateQuickChipMeta as any}>Peso y evolución</Text>
          </Pressable>
        </View>
      </AppCard>

      {state.error ? (
        <AppCard style={styles.socialStatusCard as any}>
          <Text style={styles.emptyStateTitle as any}>No se pudo cargar el feed</Text>
          <Text style={styles.emptyStateSubtitle as any}>{state.error}</Text>
          <SecondaryButton title="Reintentar" onPress={props.onRetry} />
        </AppCard>
      ) : null}
    </View>
  );

  if (state.loading && !state.items.length) {
    return (
      <SafeAreaView style={styles.screen as any}>
        <View style={[styles.mainScroll, props.webMainScrollStyle, styles.socialMainContent] as any}>
          {headerNode}
          <SocialFeedSkeleton ui={props.ui} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen as any}>
      <FlatList
        data={state.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.mainScroll, props.webMainScrollStyle, styles.socialMainContent] as any}
        refreshControl={<RefreshControl tintColor={theme.accent} refreshing={state.refreshing} onRefresh={props.onRefresh} />}
        ListHeaderComponent={headerNode}
        ListEmptyComponent={
          <EmptyState
            title={props.scope === "feed" ? "Todavía no hay actividad relevante" : "Explorar aún está vacío"}
            subtitle={
              props.scope === "feed"
                ? "Sigue a más gente o comparte tu primera publicación para empezar a mover el feed."
                : "Cuando haya publicaciones públicas recientes aparecerán aquí con prioridad para lo más útil."
            }
          />
        }
        renderItem={({ item }) => (
          <SocialPostCard
            ui={props.ui}
            post={item}
            onOpenProfile={props.onOpenProfile}
            onToggleLike={props.onToggleLike}
            onOpenComments={props.onOpenComments}
            onShare={props.onShare}
            canManage={item.user.id === props.authUserId}
            onManagePost={props.onManagePost}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.socialFeedGap as any} />}
        ListFooterComponent={
          state.loadingMore ? (
            <View style={styles.socialListFooter as any}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null
        }
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (state.nextCursor) {
            props.onLoadMore();
          }
        }}
      />
    </SafeAreaView>
  );
}
