import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { useI18n } from "../../i18n";
import { themeForPlatform } from "../../theme/colors";
import { BrandWordmark } from "./BrandWordmark";
import { WebLanguageSwitch } from "./LanguageSwitch";

const theme = themeForPlatform(Platform.OS);

export type WebTopbarNavItem = {
  key: string;
  label: string;
  active?: boolean;
  onPress: () => void;
};

export type WebTopbarAction = {
  label: string;
  onPress: () => void;
  primary?: boolean;
};

export type WebTopbarAccountItem = {
  key: string;
  label: string;
  onPress: () => void;
  description?: string;
  danger?: boolean;
};

export type WebTopbarAccountSection = {
  key: string;
  title?: string;
  items: WebTopbarAccountItem[];
};

export type WebTopbarAccount = {
  avatarUrl?: string | null;
  avatarInitial: string;
  displayName: string;
  email?: string;
  sections: WebTopbarAccountSection[];
};

export function WebTopbar(props: {
  onBrandPress: () => void;
  navItems?: WebTopbarNavItem[];
  actions?: WebTopbarAction[];
  account?: WebTopbarAccount;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = props.navItems ?? [];
  const actions = props.actions ?? [];
  const account = props.account;

  return (
    <>
      <View style={styles.topShell}>
        <View style={styles.topBar}>
          <View style={styles.brandZone}>
            <BrandWordmark onPress={props.onBrandPress} compact />
          </View>

          <View style={styles.navZone}>
            {navItems.length ? (
              <View style={styles.navRow}>
                {navItems.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={item.onPress}
                    style={({ pressed }) => [
                      styles.navItem,
                      item.active && styles.navItemActive,
                      pressed && styles.navItemPressed,
                    ]}
                  >
                    <Text style={[styles.navItemText, item.active && styles.navItemTextActive]}>{t(item.label)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.actionsZone}>
            <WebLanguageSwitch />
            {account ? (
              <Pressable
                hitSlop={10}
                style={({ hovered, pressed }: any) => [
                  styles.profileButton,
                  hovered && styles.profileButtonHovered,
                  pressed && styles.profileButtonPressed,
                ]}
                onPress={() => setMenuOpen((current) => !current)}
              >
                <View style={styles.profileButtonInner}>
                  <View style={styles.profileAvatar}>
                    {account.avatarUrl ? <Image source={{ uri: account.avatarUrl }} style={styles.profileAvatarImage} /> : null}
                    {!account.avatarUrl ? <Text style={styles.profileAvatarText}>{account.avatarInitial}</Text> : null}
                  </View>
                  <View style={styles.profileMeta}>
                    <Text numberOfLines={1} style={styles.profileMetaName}>
                      {account.displayName}
                    </Text>
                  </View>
                  <Text style={styles.profileChevron}>{menuOpen ? "▴" : "▾"}</Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.actionButtonsRow}>
                {actions.map((action) => (
                  <Pressable
                    key={action.label}
                    onPress={action.onPress}
                    style={({ hovered, pressed }: any) => [
                      styles.actionButton,
                      action.primary && styles.actionButtonPrimary,
                      hovered && styles.actionButtonHovered,
                      pressed && styles.actionButtonPressed,
                    ]}
                  >
                    <Text style={[styles.actionButtonText, action.primary && styles.actionButtonTextPrimary]}>{t(action.label)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      {account && menuOpen ? (
        <View style={styles.menuLayer} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuScrim} />
          </Pressable>
          <View style={styles.menuContainer}>
            <View style={styles.menuCard}>
              <View style={styles.menuProfileHeader}>
                <View style={styles.menuProfileAvatar}>
                  {account.avatarUrl ? <Image source={{ uri: account.avatarUrl }} style={styles.menuProfileAvatarImage} /> : null}
                  {!account.avatarUrl ? <Text style={styles.menuProfileAvatarText}>{account.avatarInitial}</Text> : null}
                </View>
                <View style={styles.menuProfileCopy}>
                  <Text numberOfLines={1} style={styles.menuProfileName}>
                    {account.displayName}
                  </Text>
                  {account.email ? (
                    <Text numberOfLines={1} style={styles.menuProfileEmail}>
                      {account.email}
                    </Text>
                  ) : null}
                </View>
              </View>
              {account.sections.map((section, sectionIndex) => {
                const isDangerSection = section.items.some((item) => item.danger);
                return (
                  <View
                    key={section.key}
                    style={[
                      styles.menuSection,
                      sectionIndex > 0 && styles.menuSectionSeparated,
                      isDangerSection && styles.menuSectionDanger,
                    ]}
                  >
                    {section.title ? <Text style={styles.menuSectionTitle}>{t(section.title)}</Text> : null}
                    <View style={styles.menuActions}>
                      {section.items.map((item) => (
                        <Pressable
                          key={item.key}
                          style={({ hovered, pressed }: any) => [
                            styles.menuButton,
                            item.danger && styles.menuButtonDanger,
                            hovered && styles.menuButtonHovered,
                            hovered && item.danger && styles.menuButtonDangerHovered,
                            pressed && styles.menuButtonPressed,
                          ]}
                          onPress={() => {
                            setMenuOpen(false);
                            item.onPress();
                          }}
                        >
                          <View style={styles.menuButtonCopy}>
                            <Text style={[styles.menuButtonText, item.danger && styles.menuButtonTextDanger]}>{t(item.label)}</Text>
                            {item.description ? (
                              <Text style={[styles.menuButtonDescription, item.danger && styles.menuButtonDescriptionDanger]}>
                                {t(item.description)}
                              </Text>
                            ) : null}
                          </View>
                          {!item.danger ? <Text style={styles.menuButtonChevron}>›</Text> : null}
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  topShell: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
    backgroundColor: "rgba(10,13,18,0.92)",
    borderBottomWidth: 1,
    borderBottomColor: theme.topbarBorder,
  },
  topBar: {
    height: 72,
    width: "100%",
    maxWidth: 1520,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    paddingHorizontal: 28,
  },
  brandZone: {
    minWidth: 164,
    alignItems: "flex-start",
  },
  navZone: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  navItem: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
  },
  navItemActive: {
    backgroundColor: "rgba(45,212,191,0.12)",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.26)",
  },
  navItemPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  navItemText: {
    color: "#9aa4b2",
    fontSize: 13,
    fontWeight: "700",
  },
  navItemTextActive: {
    color: theme.text,
  },
  actionsZone: {
    minWidth: 320,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#131821",
  },
  actionButtonPrimary: {
    backgroundColor: theme.text,
    borderColor: theme.text,
  },
  actionButtonHovered: {
    borderColor: "rgba(255,255,255,0.18)",
  },
  actionButtonPressed: {
    opacity: 0.9,
  },
  actionButtonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  actionButtonTextPrimary: {
    color: theme.bg,
  },
  profileButton: {
    minHeight: 48,
    borderRadius: 999,
  },
  profileButtonHovered: {
    opacity: 0.98,
  },
  profileButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  profileButtonInner: {
    minHeight: 48,
    maxWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#11161e",
    borderWidth: 1,
    borderColor: theme.border,
  },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panelMuted,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  profileAvatarText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
  profileMeta: {
    minWidth: 0,
    flexShrink: 1,
  },
  profileMetaName: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  profileChevron: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
  },
  menuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 70,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menuScrim: {
    flex: 1,
    backgroundColor: "rgba(2,6,12,0.28)",
  },
  menuContainer: {
    position: "absolute",
    top: 68,
    right: 24,
  },
  menuCard: {
    width: 320,
    borderRadius: 20,
    padding: 18,
    backgroundColor: "#0f141b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
  menuProfileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 6,
  },
  menuProfileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panelMuted,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  menuProfileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  menuProfileAvatarText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  menuProfileCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  menuProfileName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  menuProfileEmail: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  menuSection: {
    gap: 8,
  },
  menuSectionSeparated: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  menuSectionDanger: {
    marginTop: 4,
  },
  menuSectionTitle: {
    color: "#758295",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 4,
  },
  menuActions: {
    gap: 6,
  },
  menuButton: {
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  menuButtonDanger: {
    backgroundColor: "rgba(248,113,113,0.05)",
  },
  menuButtonHovered: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  menuButtonDangerHovered: {
    backgroundColor: "rgba(248,113,113,0.08)",
  },
  menuButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.992 }],
  },
  menuButtonCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  menuButtonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  menuButtonDescription: {
    color: "#8b98aa",
    fontSize: 11,
    lineHeight: 16,
  },
  menuButtonTextDanger: {
    color: "#fca5a5",
  },
  menuButtonDescriptionDanger: {
    color: "#f0b3b3",
  },
  menuButtonChevron: {
    color: "#6b7788",
    fontSize: 18,
    fontWeight: "600",
  },
});
