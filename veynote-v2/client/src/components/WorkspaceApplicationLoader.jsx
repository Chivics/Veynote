import { Component, lazy, Suspense, useMemo, useState } from "react";
import StartupSplash from "./StartupSplash";
import { preloadWorkspaceApplication } from "../utils/workspaceModule";

class WorkspaceLoadBoundary extends Component {
  state = { failed: false, downloadFailed: false };
  static getDerivedStateFromError(error) { return { failed: true, downloadFailed: error?.code === "WORKSPACE_DOWNLOAD_FAILED" }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="workspace-opening-error">
      <section role="alert">
        <img src="/logo.png" width="48" height="48" alt="Veynote" />
        <span className="eyebrow">{this.state.downloadFailed ? "WORKSPACE CONNECTION" : "WORKSPACE RECOVERY"}</span>
        <h1 className="page-title">Your workspace couldn’t open.</h1>
        <p>{this.state.downloadFailed ? "The application files couldn’t be downloaded. Check your connection, then reload Veynote. Your sign-in has been kept on this device." : "An application error interrupted the workspace. Saved records remain available. Reopening may discard unsaved edits; contact support before reopening if you need to preserve them."}</p>
        <button type="button" className="btn-primary" onClick={this.state.downloadFailed ? () => window.location.reload() : this.props.onRetry}>{this.state.downloadFailed ? "Reload Veynote" : "Reopen workspace"}</button>
      </section>
    </main>;
  }
}

export default function WorkspaceApplicationLoader() {
  const [attempt, setAttempt] = useState(0);
  // Runtime recovery preserves the account/session providers outside this
  // boundary. Failed module fetches require a user-initiated document reload,
  // because browsers can cache a rejected dynamic import for this document.
  const Application = useMemo(() => lazy(preloadWorkspaceApplication), [attempt]);
  return <WorkspaceLoadBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}>
    <Suspense fallback={<StartupSplash />}><Application /></Suspense>
  </WorkspaceLoadBoundary>;
}
