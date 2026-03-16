import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";

import { SocialFeedSkeleton } from "../components/FeedSkeleton";
import { socialVisibilityLabel } from "../presentation";
import type { SocialOverview, SocialPost, SocialProfileState, SocialUser } from "../types";
import type { SocialUiBridge } from "../ui";

export function ProfileView(props: {
  ui: SocialUiBridge;
  webMainScrollStyle: any;
  profileState: SocialProfileState;
  selectedProfile: SocialUser;
  socialOverview: SocialOverview;
  authUserId?: number | null;
  sendingFriendUserId: number | null;
  respondingFriendRequestId: number | null;
  onBack: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onOpenProfile: (user: SocialUser) => void;
  onToggleLike: (post: SocialPost) => void;
  onOpenComments: (post: SocialPost) => void;
  onShare: (post: SocialPost) => void;
  onManagePost: (post: SocialPost) => void;
  onSendFriendRequest: (userId: number) => void;
  onAcceptRequest: (requestId: number) => void;
}) {
  const { styles, theme, AppHeader, AppCard, EmptyState, SocialPostCard, TagChip, AvatarCircle, MetricCard } = props.ui;
  const state = props.profileState;
  const user = state.user ?? props.selectedProfile;

  const relationshipAction = state.is_me ? (
    <TagChip label="Tu perfil" tone="default" />
  ) : state.is_friend ? (
    <TagChip label="Amigos" tone="accent" />
  ) : state.outgoing_request_pending ? (
    <TagChip label="Solicitud enviada" tone="default" />
  ) : state.incoming_request_pending ? (
    <Pressable
      style={[styles.socialActionButton, props.respondingFriendRequestId != null && styles.socialActionButtonDisabled] as any}
      onPress={() => {
        const requestId = props.socialOverview.incoming_requests.find((item) => item.user.id === props.selectedProfile.id)?.id;
        if (requestId) {
          props.onAcceptRequest(requestId);
        }
      }}
    >
      <Text style={styles.socialActionButtonText as any}>Aceptar amistad</Text>
    </Pressable>
  ) : (
    <Pressable
      style={[styles.socialActionButton, props.sendingFriendUserId === props.selectedProfile.id && styles.socialActionButtonDisabled] as any}
      onPress={() => props.onSendFriendRequest(props.selectedProfile.id)}
      disabled={props.sendingFriendUserId === props.selectedProfile.id}
    >
      <Text style={styles.socialActionButtonText as any}>
        {props.sendingFriendUserId === props.selectedProfile.id ? "Enviando..." : "Añadir amigo"}
      </Text>
    </Pressable>
  );

  const headerNode = (
    <View>
      <AppHeader title={`@${user.username}`} subtitle="Perfil social" onBack={props.onBack} />
      <AppCard style={styles.socialProfileHero as any}>
        <View style={styles.socialProfileCoverGlow as any} />
        <View style={styles.socialProfileTopRow as any}>
          <View style={styles.socialProfileIdentity as any}>
            <AvatarCircle letter={user.username} imageUrl={user.avatar_url} size={76} />
            <View style={styles.socialProfileIdentityCopy as any}>
              <Text style={styles.socialProfileHandle as any}>@{user.username}</Text>
              <Text style={styles.socialProfileEmail as any}>{user.email}</Text>
              <View style={styles.socialProfileMetaRow as any}>
                <TagChip label={state.is_me ? "Tu espacio" : state.is_friend ? "Conectados" : "Perfil"} tone="default" />
                <TagChip label={socialVisibilityLabel(state.is_me ? "friends" : "public")} tone="default" />
              </View>
            </View>
          </View>
          <View style={styles.socialProfileActions as any}>{relationshipAction}</View>
        </View>
        <View style={styles.socialProfileStatsRow as any}>
          <MetricCard label="Publicaciones" value={String(state.posts_count)} />
          <MetricCard label="Amigos" value={String(state.friends_count)} />
          <MetricCard label="Acceso" value={state.is_me ? "Completo" : state.is_friend ? "Amigos" : "Público"} />
        </View>
      </AppCard>
      <View style={styles.socialProfileSectionHeader as any}>
        <Text style={styles.socialProfileSectionTitle as any}>Publicaciones</Text>
        <Text style={styles.socialProfileSectionSubtitle as any}>Actividad visible de este perfil dentro de NutrIA.</Text>
      </View>
      {state.error ? (
        <AppCard style={styles.socialStatusCard as any}>
          <Text style={styles.emptyStateTitle as any}>No se pudo cargar el perfil</Text>
          <Text style={styles.emptyStateSubtitle as any}>{state.error}</Text>
        </AppCard>
      ) : null}
    </View>
  );

  if (state.loading && !state.items.length) {
    return (
      <SafeAreaView style={styles.screen as any}>
        <ScrollView contentContainerStyle={[styles.mainScroll, props.webMainScrollStyle, styles.socialMainContent] as any}>
          {headerNode}
          <SocialFeedSkeleton ui={props.ui} count={2} />
        </ScrollView>
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
        ListEmptyComponent={<EmptyState title="Sin publicaciones" subtitle="Este perfil todavía no ha compartido nada que puedas ver." />}
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
          if (state.next_cursor) {
            props.onLoadMore();
          }
        }}
      />
    </SafeAreaView>
  );
}
