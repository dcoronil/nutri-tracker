import { Platform, StyleSheet, View } from "react-native";

import { themeForPlatform } from "../../theme/colors";
import { WebTopbar, type WebTopbarAccount, type WebTopbarNavItem } from "../components/WebTopbar";

const theme = themeForPlatform(Platform.OS);

export type AppLayoutNavItem = WebTopbarNavItem;

export function AppLayout(props: {
  onHome: () => void;
  navItems: AppLayoutNavItem[];
  account: WebTopbarAccount;
  children: import("react").ReactNode;
}) {
  return (
    <>
      <WebTopbar onBrandPress={props.onHome} navItems={props.navItems} account={props.account} />
      <View style={styles.content}>{props.children}</View>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: theme.bg,
  },
});
