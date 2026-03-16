import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";

import { SocialHeader } from "../components/SocialHeader";
import { SocialUserCard } from "../components/UserCard";
import type { SocialOverview, SocialPostType, SocialSearchItem, SocialUser } from "../types";
import type { SocialUiBridge } from "../ui";

export function FriendsView(props: {
  ui: SocialUiBridge;
  webMainScrollStyle: any;
  socialSearch: string;
  socialResults: SocialSearchItem[];
  searchingSocial: boolean;
  socialOverview: SocialOverview;
  loadingOverview: boolean;
  overviewLoaded: boolean;
  sendingFriendUserId: number | null;
  respondingFriendRequestId: number | null;
  segmentsNode: import("react").ReactNode;
  onCreate: (type?: SocialPostType) => void;
  onChangeSearch: (value: string) => void;
  onOpenProfile: (user: SocialUser) => void;
  onSendFriendRequest: (userId: number) => void;
  onAcceptRequest: (requestId: number) => void;
}) {
  const { styles, theme, AppCard, SectionHeader, TagChip, InputField } = props.ui;

  const renderSearchAction = (item: SocialSearchItem) => {
    if (item.friendship_status === "none") {
      return (
        <Pressable
          onPress={() => props.onSendFriendRequest(item.id)}
          style={[styles.socialActionButton, props.sendingFriendUserId === item.id && styles.socialActionButtonDisabled] as any}
          disabled={props.sendingFriendUserId === item.id}
        >
          <Text style={styles.socialActionButtonText as any}>{props.sendingFriendUserId === item.id ? "Enviando..." : "Añadir"}</Text>
        </Pressable>
      );
    }
    if (item.friendship_status === "incoming_pending" && item.friendship_id) {
      return (
        <Pressable
          onPress={() => props.onAcceptRequest(item.friendship_id as number)}
          style={[styles.socialActionButton, props.respondingFriendRequestId === item.friendship_id && styles.socialActionButtonDisabled] as any}
          disabled={props.respondingFriendRequestId === item.friendship_id}
        >
          <Text style={styles.socialActionButtonText as any}>Aceptar</Text>
        </Pressable>
      );
    }
    return (
      <TagChip
        label={
          item.friendship_status === "friends"
            ? "Amigos"
            : item.friendship_status === "outgoing_pending"
              ? "Pendiente"
              : "Solicitud recibida"
        }
        tone={item.friendship_status === "friends" ? "accent" : "default"}
      />
    );
  };

  return (
    <SafeAreaView style={styles.screen as any}>
      <ScrollView contentContainerStyle={[styles.mainScroll, props.webMainScrollStyle, styles.socialMainContent] as any}>
        <SocialHeader
          ui={props.ui}
          title="Tu red en NutrIA"
          subtitle="Encuentra perfiles útiles, sigue su actividad y mantén las relaciones sociales dentro del mismo flujo de nutrición."
          segmentsNode={props.segmentsNode}
          onCreate={props.onCreate}
        />

        <AppCard style={styles.socialSearchCard as any}>
          <SectionHeader title="Buscar usuarios" subtitle="Por username o email" />
          <InputField
            label="Buscar perfiles"
            value={props.socialSearch}
            onChangeText={props.onChangeSearch}
            autoCapitalize="none"
            placeholder="Ej: dani o dani@email.com"
          />
          {props.searchingSocial ? <ActivityIndicator color={theme.accent} /> : null}
          {props.socialSearch.trim().length >= 1 ? (
            props.socialResults.length ? (
              <View style={styles.socialUserCardGrid as any}>
                {props.socialResults.map((item) => (
                  <SocialUserCard
                    key={`search-${item.id}`}
                    ui={props.ui}
                    user={item}
                    subtitle={item.email}
                    meta={<TagChip label="Resultado" tone="default" />}
                    actions={renderSearchAction(item)}
                    onOpenProfile={props.onOpenProfile}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.helperText as any}>No hay usuarios que coincidan.</Text>
            )
          ) : (
            <Text style={styles.helperText as any}>Busca perfiles para ampliar tu red o revisar su actividad.</Text>
          )}
        </AppCard>

        <AppCard style={styles.socialNetworkSectionCard as any}>
          <SectionHeader title="Tus amigos" subtitle="Perfiles con los que compartes actividad" />
          {props.loadingOverview && !props.overviewLoaded ? <ActivityIndicator color={theme.accent} /> : null}
          {props.socialOverview.friends.length ? (
            <View style={styles.socialUserCardGrid as any}>
              {props.socialOverview.friends.map((friend) => (
                <SocialUserCard
                  key={`friend-${friend.id}`}
                  ui={props.ui}
                  user={friend}
                  subtitle={friend.email}
                  meta={<TagChip label="Amigo" tone="accent" />}
                  onOpenProfile={props.onOpenProfile}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.helperText as any}>Todavía no tienes amigos añadidos.</Text>
          )}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}
