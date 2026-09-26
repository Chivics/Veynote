import { createModuleLoader } from "./moduleLoader";

export const preloadWorkspaceApplication = createModuleLoader(() => import("../WorkspaceApplication"));
