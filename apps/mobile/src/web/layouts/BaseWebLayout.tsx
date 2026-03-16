import { Platform, SafeAreaView, StyleSheet, View } from "react-native";

import { themeForPlatform } from "../../theme/colors";
import { WebTopbar, type WebTopbarAccount, type WebTopbarAction, type WebTopbarNavItem } from "../components/WebTopbar";

const theme = themeForPlatform(Platform.OS);

export function BaseWebLayout(props: {
  onHome: () => void;
  navItems?: WebTopbarNavItem[];
  actions?: WebTopbarAction[];
  account?: WebTopbarAccount;
  children: import("react").ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <WebTopbar onBrandPress={props.onHome} navItems={props.navItems} actions={props.actions} account={props.account} />
      <View style={styles.content}>{props.children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    flex: 1,
  },
});
