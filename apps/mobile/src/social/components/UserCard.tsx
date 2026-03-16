import { Pressable, Text, View } from "react-native";

import type { SocialUser } from "../types";
import type { SocialUiBridge } from "../ui";

export function SocialUserCard(props: {
  ui: SocialUiBridge;
  user: SocialUser;
  subtitle?: string;
  meta?: import("react").ReactNode;
  actions?: import("react").ReactNode;
  onOpenProfile: (user: SocialUser) => void;
}) {
  const { styles, AppCard, AvatarCircle } = props.ui;

  return (
    <AppCard style={styles.socialUserCard as any}>
      <View style={styles.socialUserCardRow as any}>
        <Pressable style={({ pressed }) => [styles.socialUserCardIdentity as any, pressed && styles.socialInteractivePressed as any]} onPress={() => props.onOpenProfile(props.user)}>
          <AvatarCircle letter={props.user.username} imageUrl={props.user.avatar_url} size={48} />
          <View style={styles.socialUserCardCopy as any}>
            <Text style={styles.socialUserCardHandle as any}>@{props.user.username}</Text>
            <Text style={styles.socialUserCardSubtitle as any}>{props.subtitle ?? props.user.email}</Text>
          </View>
        </Pressable>
        {props.actions ? <View style={styles.socialUserCardActions as any}>{props.actions}</View> : null}
      </View>
      {props.meta ? <View style={styles.socialUserCardMeta as any}>{props.meta}</View> : null}
    </AppCard>
  );
}
