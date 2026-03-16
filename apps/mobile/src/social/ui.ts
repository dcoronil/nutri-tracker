import type { ComponentType, ReactNode } from "react";

export type SocialUiBridge = {
  styles: Record<string, unknown>;
  theme: {
    accent: string;
  };
  AppHeader: ComponentType<any>;
  AppCard: ComponentType<any>;
  EmptyState: ComponentType<any>;
  SocialFeedSkeleton: ComponentType<any>;
  SocialPostCard: ComponentType<any>;
  SectionHeader: ComponentType<any>;
  TagChip: ComponentType<any>;
  AvatarCircle: ComponentType<any>;
  MetricCard: ComponentType<any>;
  ChoiceRow: ComponentType<any>;
  InputField: ComponentType<any>;
  TextInput: ComponentType<any>;
  EditableStringListField: ComponentType<any>;
  PrimaryButton: ComponentType<any>;
  SecondaryButton: ComponentType<any>;
};

export type SocialHeaderNodeProps = {
  title: string;
  subtitle: string;
  rightActionLabel?: string;
  onRightAction?: () => void;
  onBack?: () => void;
};

export type SocialNodeFactory = (props: SocialHeaderNodeProps) => ReactNode;
