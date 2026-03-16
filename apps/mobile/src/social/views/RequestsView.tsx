import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";

import { SocialHeader } from "../components/SocialHeader";
import { SocialUserCard } from "../components/UserCard";
import type { SocialOverview, SocialPostType, SocialUser } from "../types";
import type { SocialUiBridge } from "../ui";

export function RequestsView(props: {
  ui: SocialUiBridge;
  webMainScrollStyle: any;
  socialOverview: SocialOverview;
  loadingOverview: boolean;
  overviewLoaded: boolean;
  respondingFriendRequestId: number | null;
  segmentsNode: import("react").ReactNode;
  onCreate: (type?: SocialPostType) => void;
  onOpenProfile: (user: SocialUser) => void;
  onAcceptRequest: (requestId: number) => void;
  onRejectRequest: (requestId: number) => void;
}) {
  const { styles, theme, AppCard, SectionHeader, SecondaryButton, TagChip } = props.ui;

  return (
    <SafeAreaView style={styles.screen as any}>
      <ScrollView contentContainerStyle={[styles.mainScroll, props.webMainScrollStyle, styles.socialMainContent] as any}>
        <SocialHeader
          ui={props.ui}
          title="Solicitudes pendientes"
          subtitle="Gestiona nuevas conexiones sin perder el contexto de tu red ni del contenido que compartes."
          segmentsNode={props.segmentsNode}
          onCreate={props.onCreate}
        />

        <AppCard style={styles.socialNetworkSectionCard as any}>
          <SectionHeader title="Solicitudes recibidas" subtitle="Acepta o rechaza desde un panel limpio" />
          {props.loadingOverview && !props.overviewLoaded ? <ActivityIndicator color={theme.accent} /> : null}
          {props.socialOverview.incoming_requests.length ? (
            <View style={styles.socialUserCardGrid as any}>
              {props.socialOverview.incoming_requests.map((requestItem) => (
                <SocialUserCard
                  key={`incoming-${requestItem.id}`}
                  ui={props.ui}
                  user={requestItem.user}
                  subtitle={requestItem.user.email}
                  meta={<TagChip label="Solicitud recibida" tone="warning" />}
                  actions={
                    <View style={styles.socialRequestActions as any}>
                      <Pressable
                        style={[
                          styles.socialActionButton,
                          props.respondingFriendRequestId === requestItem.id && styles.socialActionButtonDisabled,
                        ] as any}
                        onPress={() => props.onAcceptRequest(requestItem.id)}
                        disabled={props.respondingFriendRequestId === requestItem.id}
                      >
                        <Text style={styles.socialActionButtonText as any}>Aceptar</Text>
                      </Pressable>
                      <SecondaryButton
                        title="Rechazar"
                        onPress={() => props.onRejectRequest(requestItem.id)}
                        disabled={props.respondingFriendRequestId === requestItem.id}
                      />
                    </View>
                  }
                  onOpenProfile={props.onOpenProfile}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.helperText as any}>No tienes solicitudes pendientes.</Text>
          )}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}
