import { View } from "react-native";

import type { SocialUiBridge } from "../ui";

export function SocialFeedSkeleton(props: { ui: SocialUiBridge; count?: number }) {
  const { styles, AppCard } = props.ui;
  const rows = Array.from({ length: props.count ?? 3 }, (_, index) => index);

  return (
    <View style={styles.socialSkeletonList as any}>
      {rows.map((row) => (
        <AppCard key={`social-skeleton-${row}`} style={styles.socialPostCard as any}>
          <View style={styles.socialSkeletonHeader as any}>
            <View style={styles.socialSkeletonAvatar as any} />
            <View style={styles.socialSkeletonHeaderCopy as any}>
              <View style={styles.skeletonLineMd as any} />
              <View style={styles.skeletonLineSm as any} />
            </View>
          </View>
          <View style={styles.socialSkeletonMedia as any} />
          <View style={styles.skeletonLineLg as any} />
          <View style={styles.skeletonLineMd as any} />
          <View style={styles.socialSkeletonActions as any}>
            <View style={styles.socialSkeletonActionPill as any} />
            <View style={styles.socialSkeletonActionPill as any} />
            <View style={styles.socialSkeletonActionPill as any} />
          </View>
        </AppCard>
      ))}
    </View>
  );
}
