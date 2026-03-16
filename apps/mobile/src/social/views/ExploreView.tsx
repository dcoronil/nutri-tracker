import { FeedView } from "./FeedView";
import type { SocialFeedState, SocialPost, SocialPostType, SocialUser } from "../types";
import type { SocialUiBridge } from "../ui";

export function ExploreView(props: {
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
  return <FeedView {...props} scope="explore" />;
}
