import { WORKSPACES } from "../components/layout/navigationConfig.js";

export function startingWorkspace(user) {
  return Object.hasOwn(WORKSPACES, user?.defaultWorkspace || "")
    ? user.defaultWorkspace : user?.defaultMode === "TRADING" ? "Trading" : "Notes";
}

export function workspaceHome(user) {
  return WORKSPACES[startingWorkspace(user)].home;
}
