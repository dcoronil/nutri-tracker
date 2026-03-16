export type FriendshipStatus = "none" | "incoming_pending" | "outgoing_pending" | "friends";
export type SocialPostType = "photo" | "recipe" | "progress";
export type SocialVisibility = "public" | "friends" | "private";
export type SocialFeedSort = "relevance" | "recent";
export type SocialFeedTypeFilter = "all" | SocialPostType;
export type SocialSegmentTab = "feed" | "explore" | "friends" | "requests";

export type SocialUser = {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
};

export type SocialSearchItem = SocialUser & {
  friendship_status: FriendshipStatus;
  friendship_id: number | null;
};

export type SocialSearchResponse = {
  items: SocialSearchItem[];
};

export type SocialFriendRequest = {
  id: number;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  responded_at: string | null;
  user: SocialUser;
};

export type SocialOverview = {
  friends: SocialUser[];
  incoming_requests: SocialFriendRequest[];
  outgoing_requests: SocialFriendRequest[];
};

export type SocialPostMedia = {
  id: number;
  media_url: string;
  width: number | null;
  height: number | null;
  order_index: number;
};

export type SocialRecipePayload = {
  title: string;
  servings: number | null;
  prep_time_min: number | null;
  ingredients: string[];
  steps: string[];
  nutrition_kcal: number | null;
  nutrition_protein_g: number | null;
  nutrition_carbs_g: number | null;
  nutrition_fat_g: number | null;
  tags: string[];
};

export type SocialProgressPayload = {
  weight_kg: number | null;
  body_fat_pct: number | null;
  bmi: number | null;
  notes: string | null;
};

export type SocialPost = {
  id: string;
  type: SocialPostType;
  caption: string | null;
  visibility: SocialVisibility;
  created_at: string;
  updated_at: string;
  user: SocialUser;
  media: SocialPostMedia[];
  recipe: SocialRecipePayload | null;
  progress: SocialProgressPayload | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  source: "friends" | "explore" | "self";
};

export type SocialFeedResponse = {
  items: SocialPost[];
  next_cursor: string | null;
};

export type SocialProfileResponse = {
  user: SocialUser;
  is_me: boolean;
  is_friend: boolean;
  outgoing_request_pending: boolean;
  incoming_request_pending: boolean;
  posts_count: number;
  friends_count: number;
  items: SocialPost[];
  next_cursor: string | null;
};

export type SocialLikeToggleResponse = {
  liked: boolean;
  like_count: number;
};

export type SocialComment = {
  id: number;
  text: string;
  created_at: string;
  user: SocialUser;
};

export type SocialFeedState = {
  items: SocialPost[];
  nextCursor: string | null;
  loading: boolean;
  loaded: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
};

export type SocialProfileState = {
  user: SocialUser | null;
  is_me: boolean;
  is_friend: boolean;
  outgoing_request_pending: boolean;
  incoming_request_pending: boolean;
  posts_count: number;
  friends_count: number;
  items: SocialPost[];
  next_cursor: string | null;
  loading: boolean;
  loaded: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
};
