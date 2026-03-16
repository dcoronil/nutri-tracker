import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import type { SocialPost, SocialUser } from "../types";
import type { SocialUiBridge } from "../ui";
import { formatRelativeTime, socialSourceLabel, socialTypeLabel, socialTypeMeta, socialVisibilityLabel } from "../presentation";

function metricText(value: number | null | undefined, suffix = "") {
  if (value == null) {
    return "-";
  }
  return `${value.toFixed(1)}${suffix}`;
}

function isDesktop(width: number) {
  return width >= 1120;
}

export function SocialPostCard(props: {
  ui: SocialUiBridge;
  post: SocialPost;
  onOpenProfile: (user: SocialUser) => void;
  onToggleLike: (post: SocialPost) => void;
  onOpenComments: (post: SocialPost) => void;
  onShare: (post: SocialPost) => void;
  onManagePost?: (post: SocialPost) => void;
  canManage?: boolean;
}) {
  const { width } = useWindowDimensions();
  const useDesktopLayout = isDesktop(width);
  const { styles, AppCard, AvatarCircle } = props.ui;
  const typeMeta = socialTypeMeta(props.post.type);
  const mediaViewportWidth = useDesktopLayout ? Math.min(width - 220, 760) : Math.max(280, width - 52);
  const mediaHeight = useDesktopLayout ? 380 : 260;
  const caption = props.post.caption?.trim() ?? "";
  const showExpand = caption.length > 180;
  const [expandedCaption, setExpandedCaption] = useState(false);

  return (
    <AppCard style={styles.socialPostCard as any}>
      <View style={[styles.socialPostAccentBar as any, { backgroundColor: typeMeta.color }]} />

      <View style={styles.socialPostHeader as any}>
        <Pressable
          style={({ pressed }) => [styles.socialPostUserWrap as any, pressed && styles.socialInteractivePressed as any]}
          onPress={() => props.onOpenProfile(props.post.user)}
        >
          <AvatarCircle letter={props.post.user.username} imageUrl={props.post.user.avatar_url} size={42} />
          <View style={styles.socialPostUserCopy as any}>
            <View style={styles.socialPostIdentityRow as any}>
              <Text style={styles.socialPostUserName as any}>@{props.post.user.username}</Text>
              <Text style={styles.socialPostMetaContext as any}>{socialSourceLabel(props.post.source)}</Text>
            </View>
            <Text style={styles.socialPostMeta as any}>{formatRelativeTime(props.post.created_at)} · {socialVisibilityLabel(props.post.visibility)}</Text>
          </View>
        </Pressable>

        <View style={styles.socialPostHeaderRight as any}>
          <View style={styles.socialPostBadges as any}>
            <View style={[styles.socialTypeBadge as any, { backgroundColor: typeMeta.softBackground, borderColor: typeMeta.borderColor }]}> 
              <Text style={[styles.socialTypeBadgeText as any, { color: typeMeta.color }]}>{socialTypeLabel(props.post.type)}</Text>
            </View>
          </View>
          {props.canManage && props.onManagePost ? (
            <Pressable
              style={({ pressed }) => [styles.socialPostManageButton as any, pressed && styles.socialInteractivePressed as any]}
              onPress={() => props.onManagePost?.(props.post)}
            >
              <Text style={styles.socialPostManageButtonText as any}>⋯</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {caption ? (
        <View style={styles.socialCaptionWrap as any}>
          <Text style={styles.socialCaptionText as any} numberOfLines={expandedCaption ? undefined : 3}>
            {caption}
          </Text>
          {showExpand ? (
            <Pressable
              style={({ pressed }) => [styles.socialCaptionToggle as any, pressed && styles.socialInteractivePressed as any]}
              onPress={() => setExpandedCaption(!expandedCaption)}
            >
              <Text style={styles.socialCaptionToggleText as any}>{expandedCaption ? "Ver menos" : "Ver más"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {props.post.media.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.socialMediaCarousel as any}>
          {props.post.media.map((media) => (
            <Image
              key={`${props.post.id}-${media.id}`}
              source={{ uri: media.media_url }}
              style={[
                styles.socialMediaImage as any,
                {
                  width: mediaViewportWidth,
                  height: mediaHeight,
                },
              ]}
            />
          ))}
        </ScrollView>
      ) : null}

      {props.post.type === "recipe" && props.post.recipe ? (
        <View style={styles.socialRecipeCard as any}>
          <View style={styles.socialRecipeHeader as any}>
            <Text style={styles.socialRecipeTitle as any}>{props.post.recipe.title}</Text>
            <View style={styles.socialMiniMetaRow as any}>
              {props.post.recipe.servings ? <Text style={styles.socialRecipeMetaText as any}>{props.post.recipe.servings} raciones</Text> : null}
              {props.post.recipe.prep_time_min ? <Text style={styles.socialRecipeMetaText as any}>{props.post.recipe.prep_time_min} min</Text> : null}
            </View>
          </View>

          {props.post.recipe.ingredients.length ? (
            <View style={styles.socialRecipeListBlock as any}>
              <Text style={styles.socialRecipeListTitle as any}>Ingredientes</Text>
              {props.post.recipe.ingredients.slice(0, 4).map((ingredient, index) => (
                <Text key={`ingredient-${props.post.id}-${index}`} style={styles.socialRecipeListText as any}>
                  • {ingredient}
                </Text>
              ))}
            </View>
          ) : null}

          {(props.post.recipe.nutrition_kcal != null || props.post.recipe.nutrition_protein_g != null) ? (
            <View style={styles.socialNutritionRow as any}>
              {props.post.recipe.nutrition_kcal != null ? (
                <View style={[styles.socialNutritionPill as any, styles.socialNutritionPillKcal as any]}>
                  <Text style={styles.socialNutritionPillText as any}>{Math.round(props.post.recipe.nutrition_kcal)} kcal</Text>
                </View>
              ) : null}
              {props.post.recipe.nutrition_protein_g != null ? (
                <View style={[styles.socialNutritionPill as any, styles.socialNutritionPillProtein as any]}>
                  <Text style={styles.socialNutritionPillText as any}>{Math.round(props.post.recipe.nutrition_protein_g)} g prot</Text>
                </View>
              ) : null}
              {props.post.recipe.nutrition_carbs_g != null ? (
                <View style={[styles.socialNutritionPill as any, styles.socialNutritionPillCarbs as any]}>
                  <Text style={styles.socialNutritionPillText as any}>{Math.round(props.post.recipe.nutrition_carbs_g)} g carb</Text>
                </View>
              ) : null}
              {props.post.recipe.nutrition_fat_g != null ? (
                <View style={[styles.socialNutritionPill as any, styles.socialNutritionPillFat as any]}>
                  <Text style={styles.socialNutritionPillText as any}>{Math.round(props.post.recipe.nutrition_fat_g)} g grasa</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {props.post.type === "progress" && props.post.progress ? (
        <View style={styles.socialProgressPanel as any}>
          <View style={styles.socialProgressStatsGrid as any}>
            <View style={styles.socialProgressStat as any}>
              <Text style={styles.socialProgressStatLabel as any}>Peso</Text>
              <Text style={styles.socialProgressStatValue as any}>{metricText(props.post.progress.weight_kg, " kg")}</Text>
            </View>
            <View style={styles.socialProgressStat as any}>
              <Text style={styles.socialProgressStatLabel as any}>IMC</Text>
              <Text style={styles.socialProgressStatValue as any}>{metricText(props.post.progress.bmi)}</Text>
            </View>
            <View style={styles.socialProgressStat as any}>
              <Text style={styles.socialProgressStatLabel as any}>Grasa</Text>
              <Text style={styles.socialProgressStatValue as any}>{metricText(props.post.progress.body_fat_pct, "%")}</Text>
            </View>
          </View>
          {props.post.progress.notes ? <Text style={styles.socialProgressNotesText as any}>{props.post.progress.notes}</Text> : null}
        </View>
      ) : null}

      <View style={styles.socialActionRow as any}>
        <Pressable
          style={({ pressed }) => [
            styles.socialActionPill as any,
            props.post.liked_by_me && styles.socialActionPillActive as any,
            pressed && styles.socialInteractivePressed as any,
          ]}
          onPress={() => props.onToggleLike(props.post)}
        >
          <Text style={[styles.socialActionPillText as any, props.post.liked_by_me && styles.socialActionPillTextActive as any]}>Me gusta</Text>
          <Text style={[styles.socialActionPillLabel as any, props.post.liked_by_me && styles.socialActionPillLabelActive as any]}>
            {props.post.like_count}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.socialActionPill as any, pressed && styles.socialInteractivePressed as any]}
          onPress={() => props.onOpenComments(props.post)}
        >
          <Text style={styles.socialActionPillText as any}>Comentar</Text>
          <Text style={styles.socialActionPillLabel as any}>{props.post.comment_count}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.socialActionPill as any, pressed && styles.socialInteractivePressed as any]}
          onPress={() => props.onShare(props.post)}
        >
          <Text style={styles.socialActionPillText as any}>Compartir</Text>
          <Text style={styles.socialActionPillLabel as any}>↗</Text>
        </Pressable>
      </View>
    </AppCard>
  );
}
