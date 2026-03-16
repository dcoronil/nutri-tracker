import { BaseWebLayout } from "./BaseWebLayout";
import type { WebTopbarAccount, WebTopbarAction, WebTopbarNavItem } from "../components/WebTopbar";

export function OnboardingLayout(props: {
  onHome: () => void;
  navItems?: WebTopbarNavItem[];
  actions?: WebTopbarAction[];
  account?: WebTopbarAccount;
  children: import("react").ReactNode;
}) {
  return (
    <BaseWebLayout onHome={props.onHome} navItems={props.navItems} actions={props.actions} account={props.account}>
      {props.children}
    </BaseWebLayout>
  );
}
