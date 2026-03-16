import { appendImageUriToFormData } from "../platform/upload";
import type {
  SocialComment,
  SocialFeedResponse,
  SocialFeedSort,
  SocialFeedTypeFilter,
  SocialFriendRequest,
  SocialLikeToggleResponse,
  SocialOverview,
  SocialPost,
  SocialPostType,
  SocialProfileResponse,
  SocialProgressPayload,
  SocialRecipePayload,
  SocialSearchItem,
  SocialSearchResponse,
  SocialVisibility,
} from "./types";

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export function createSocialApi(request: ApiRequest) {
  return {
    searchSocialUsers: async (query: string, limit = 12): Promise<SocialSearchItem[]> => {
      const trimmed = query.trim();
      if (trimmed.length < 1) {
        return [];
      }
      const response = await request<SocialSearchResponse>(`/social/users/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`);
      return response.items;
    },
    fetchSocialOverview: async (): Promise<SocialOverview> => request<SocialOverview>("/social/friendships"),
    sendFriendRequest: async (targetUserId: number): Promise<SocialFriendRequest> => {
      return request<SocialFriendRequest>("/social/friend-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
    },
    acceptFriendRequest: async (friendshipId: number): Promise<SocialFriendRequest> => {
      return request<SocialFriendRequest>(`/social/friend-requests/${friendshipId}/accept`, {
        method: "POST",
      });
    },
    rejectFriendRequest: async (friendshipId: number): Promise<SocialFriendRequest> => {
      return request<SocialFriendRequest>(`/social/friends/requests/${friendshipId}/reject`, {
        method: "POST",
      });
    },
    fetchSocialFeed: async (input?: {
      cursor?: string | null;
      limit?: number;
      scope?: "feed" | "explore";
      sort?: SocialFeedSort;
      postType?: SocialFeedTypeFilter;
    }): Promise<SocialFeedResponse> => {
      const params = new URLSearchParams();
      if (input?.cursor) {
        params.set("cursor", input.cursor);
      }
      if (typeof input?.limit === "number") {
        params.set("limit", String(input.limit));
      }
      if (input?.scope) {
        params.set("scope", input.scope);
      }
      if (input?.sort) {
        params.set("sort", input.sort);
      }
      if (input?.postType && input.postType !== "all") {
        params.set("post_type", input.postType);
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return request<SocialFeedResponse>(`/social/feed${suffix}`);
    },
    fetchSocialProfile: async (input?: { userId?: number; cursor?: string | null; limit?: number }): Promise<SocialProfileResponse> => {
      const params = new URLSearchParams();
      if (input?.cursor) {
        params.set("cursor", input.cursor);
      }
      if (typeof input?.limit === "number") {
        params.set("limit", String(input.limit));
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const path = input?.userId ? `/social/users/${input.userId}/posts${suffix}` : `/social/me/posts${suffix}`;
      return request<SocialProfileResponse>(path);
    },
    createSocialPost: async (payload: {
      type: SocialPostType;
      caption?: string;
      visibility: SocialVisibility;
      photos?: string[];
      recipe?: SocialRecipePayload | null;
      progress?: SocialProgressPayload | null;
    }): Promise<SocialPost> => {
      const form = new FormData();
      form.append("type", payload.type);
      form.append("visibility", payload.visibility);
      if (payload.caption?.trim()) {
        form.append("caption", payload.caption.trim());
      }

      if (payload.type === "recipe" && payload.recipe) {
        form.append("recipe_title", payload.recipe.title.trim());
        if (payload.recipe.servings != null) {
          form.append("recipe_servings", String(payload.recipe.servings));
        }
        if (payload.recipe.prep_time_min != null) {
          form.append("recipe_prep_time_min", String(payload.recipe.prep_time_min));
        }
        form.append("recipe_ingredients_json", JSON.stringify(payload.recipe.ingredients));
        form.append("recipe_steps_json", JSON.stringify(payload.recipe.steps));
        form.append("recipe_tags_json", JSON.stringify(payload.recipe.tags));
        if (payload.recipe.nutrition_kcal != null) {
          form.append("recipe_nutrition_kcal", String(payload.recipe.nutrition_kcal));
        }
        if (payload.recipe.nutrition_protein_g != null) {
          form.append("recipe_nutrition_protein_g", String(payload.recipe.nutrition_protein_g));
        }
        if (payload.recipe.nutrition_carbs_g != null) {
          form.append("recipe_nutrition_carbs_g", String(payload.recipe.nutrition_carbs_g));
        }
        if (payload.recipe.nutrition_fat_g != null) {
          form.append("recipe_nutrition_fat_g", String(payload.recipe.nutrition_fat_g));
        }
      }

      if (payload.type === "progress" && payload.progress) {
        if (payload.progress.weight_kg != null) {
          form.append("progress_weight_kg", String(payload.progress.weight_kg));
        }
        if (payload.progress.body_fat_pct != null) {
          form.append("progress_body_fat_pct", String(payload.progress.body_fat_pct));
        }
        if (payload.progress.bmi != null) {
          form.append("progress_bmi", String(payload.progress.bmi));
        }
        if (payload.progress.notes?.trim()) {
          form.append("progress_notes", payload.progress.notes.trim());
        }
      }

      for (let index = 0; index < (payload.photos ?? []).length; index += 1) {
        const uri = payload.photos?.[index];
        if (!uri) {
          continue;
        }
        const fallbackName = uri.split("/").pop() || `social-${payload.type}-${index + 1}.jpg`;
        await appendImageUriToFormData(form, "photos", uri, fallbackName);
      }

      return request<SocialPost>("/social/posts", {
        method: "POST",
        body: form,
      });
    },
    updateSocialPostVisibility: async (postId: string, visibility: SocialVisibility): Promise<SocialPost> => {
      return request<SocialPost>(`/social/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
    },
    deleteSocialPost: async (postId: string): Promise<void> => {
      await request(`/social/posts/${postId}`, {
        method: "DELETE",
      });
    },
    likeSocialPost: async (postId: string): Promise<SocialLikeToggleResponse> => {
      return request<SocialLikeToggleResponse>(`/social/posts/${postId}/like`, {
        method: "POST",
      });
    },
    unlikeSocialPost: async (postId: string): Promise<SocialLikeToggleResponse> => {
      return request<SocialLikeToggleResponse>(`/social/posts/${postId}/like`, {
        method: "DELETE",
      });
    },
    fetchSocialComments: async (postId: string): Promise<SocialComment[]> => request<SocialComment[]>(`/social/posts/${postId}/comments`),
    createSocialComment: async (postId: string, text: string): Promise<SocialComment> => {
      return request<SocialComment>(`/social/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    },
  };
}
