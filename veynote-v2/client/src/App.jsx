import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ModeProvider } from "./context/ModeContext";
import { NavigationProvider } from "./context/NavigationContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/layout/AppShell";

import Login from "./pages/auth/Login";
import SharedNote from "./pages/SharedNote";
import Signup from "./pages/auth/Signup";
import PickMode from "./pages/auth/PickMode";
import AuthCallback from "./pages/auth/AuthCallback";

import NotesDashboard from "./pages/notes/Dashboard";
import Today from "./pages/notes/Today";
import NoteListPage from "./pages/notes/NoteListPage";
import NoteEditor from "./pages/notes/NoteEditor";
import Folders from "./pages/notes/Folders";
import Files from "./pages/notes/Files";
import LockedNotes from "./pages/notes/LockedNotes";
import WillInheritance from "./pages/notes/WillInheritance";
import NotesCalendar from "./pages/notes/Calendar";
import Tags from "./pages/notes/Tags";
import WillDetail from "./pages/notes/WillDetail";
import WillAssetDetail from "./pages/notes/WillAssetDetail";
import WillBeneficiaryDetail from "./pages/notes/WillBeneficiaryDetail";
import WillContactDetail from "./pages/notes/WillContactDetail";
import WillExecutorDetail from "./pages/notes/WillExecutorDetail";

import LibraryDashboard from "./pages/library/LibraryDashboard";
import ReadingPage from "./pages/library/ReadingPage";
import DatabasePage from "./pages/library/DatabasePage";
import ItemDetail from "./pages/library/ItemDetail";

import TaskBoard from "./pages/tasks/TaskBoard";
import TaskDetail from "./pages/tasks/TaskDetail";

import TradingDashboard from "./pages/trading/Dashboard";
import EntryListPage from "./pages/trading/EntryListPage";
import TradeEditor from "./pages/trading/TradeEditor";
import TradeDetail from "./pages/trading/TradeDetail";
import Accounts from "./pages/trading/Accounts";
import Analytics from "./pages/trading/Analytics";
import TradingCalendar from "./pages/trading/Calendar";
import TradingRules from "./pages/trading/TradingRules";
import TradingRuleDetail from "./pages/trading/TradingRuleDetail";

import Settings from "./pages/Settings";
import ConnectionStatus from "./components/ConnectionStatus";

function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.defaultMode === "TRADING" ? "/trading" : "/notes"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ConnectionStatus />
      <Routes>
        {/* -- Public / auth -- */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/shared/:token" element={<SharedNote />} />
        <Route
          path="/pick-mode"
          element={
            <ProtectedRoute>
              <PickMode />
            </ProtectedRoute>
          }
        />

        {/* -- Main app shell (both modes share this layout) -- */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ModeProvider>
                <NavigationProvider><AppShell /></NavigationProvider>
              </ModeProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<RootRedirect />} />
          <Route path="settings" element={<Settings />} />

          {/* Notes mode */}
          <Route path="notes" element={<NotesDashboard />} />
          <Route path="notes/today" element={<Today />} />
          <Route path="notes/new" element={<NoteEditor />} />
          <Route path="notes/all" element={<NoteListPage scope="all" />} />
          <Route path="notes/favorites" element={<NoteListPage scope="favorites" />} />
          <Route path="notes/archive" element={<NoteListPage scope="archive" />} />
          <Route path="notes/trash" element={<NoteListPage scope="trash" />} />
          <Route path="notes/search" element={<NoteListPage scope="search" />} />
          <Route path="notes/tags" element={<Tags />} />
          <Route path="notes/tags/:tag" element={<NoteListPage scope="tag" />} />
          <Route path="notes/folders" element={<Folders />} />
          <Route path="notes/folders/:folderId" element={<NoteListPage scope="folder" />} />
          <Route path="notes/files" element={<Files />} />
          <Route path="notes/files/:id" element={<Files />} />
          <Route path="notes/locked" element={<LockedNotes />} />
          <Route
          path="notes/will"
          element={<Navigate to="/will" replace />}
        />

        <Route
          path="will"
          element={<WillInheritance />}
        />

        <Route
          path="will/details/:id"
          element={<WillDetail />}
        />

        <Route
          path="will/assets/:id"
          element={<WillAssetDetail />}
        />

        <Route
          path="will/beneficiaries/:id"
          element={<WillBeneficiaryDetail />}
        />

        <Route
          path="will/contacts/:id"
          element={<WillContactDetail />}
        />

        <Route
          path="will/executors/:id"
          element={<WillExecutorDetail />}
        />
          <Route path="notes/calendar" element={<NotesCalendar />} />

          {/* Library (no Calendar anywhere in here, per the approved update) */}
          <Route path="notes/library" element={<LibraryDashboard />} />
          <Route path="notes/library/reading" element={<ReadingPage />} />
          <Route path="notes/library/reading/:id" element={<ItemDetail configKey="reading" />} />
          <Route path="notes/library/goals" element={<DatabasePage configKey="goals" />} />
          <Route path="notes/library/goals/:id" element={<ItemDetail configKey="goals" />} />
          <Route path="notes/library/travel" element={<DatabasePage configKey="travel" />} />
          <Route path="notes/library/travel/:id" element={<ItemDetail configKey="travel" />} />
          <Route path="notes/library/bucket" element={<DatabasePage configKey="bucket" />} />
          <Route path="notes/library/bucket/:id" element={<ItemDetail configKey="bucket" />} />
          <Route path="notes/library/ideas" element={<DatabasePage configKey="ideas" />} />
          <Route path="notes/library/ideas/:id" element={<ItemDetail configKey="ideas" />} />
          <Route path="notes/library/projects" element={<DatabasePage configKey="projects" />} />
          <Route path="notes/library/projects/:id" element={<ItemDetail configKey="projects" />} />

          {/* Task List (no Calendar here either) */}
          <Route path="notes/tasks" element={<TaskBoard />} />
          <Route path="notes/tasks/:id" element={<TaskDetail />} />

          {/* This catch-all note editor route must stay last among /notes/*
              routes so it doesn't shadow the static paths above. */}
          <Route path="notes/:id" element={<NoteEditor />} />

          {/* Trading Journal mode */}
          <Route path="trading" element={<TradingDashboard />} />
          <Route path="trading/entries" element={<EntryListPage mode="all" />} />
          <Route path="trading/entries/new" element={<TradeEditor />} />
          <Route path="trading/entries/:id" element={<TradeDetail />} />
          <Route path="trading/entries/:id/edit" element={<TradeEditor />} />
          <Route path="trading/accounts" element={<Accounts />} />
          <Route path="trading/rules" element={<TradingRules />} />
          <Route path="trading/rules/:id" element={<TradingRuleDetail />} />
          <Route path="trading/calendar" element={<TradingCalendar />} />
          <Route path="trading/analytics" element={<Analytics />} />
          <Route path="trading/search" element={<EntryListPage mode="search" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
