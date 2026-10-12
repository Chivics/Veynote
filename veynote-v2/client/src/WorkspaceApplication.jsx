import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ModeProvider } from "./context/ModeContext";
import { NavigationProvider } from "./context/NavigationContext";
import AppShell from "./components/layout/AppShell";
import { workspaceHome } from "./utils/workspace";
import NotesDashboard from "./pages/notes/Dashboard";
import NoteListPage from "./pages/notes/NoteListPage";
import NoteEditor from "./pages/notes/NoteEditor";
import Today from "./pages/notes/Today";
import Folders from "./pages/notes/Folders";
import FolderWorkspace from "./pages/notes/FolderWorkspace";
import Files from "./pages/notes/Files";
import LockedNotes from "./pages/notes/LockedNotes";
import VaultOverview from "./pages/vault/VaultOverview";
import VaultSecurity from "./pages/vault/VaultSecurity";
import VaultActivity from "./pages/vault/VaultActivity";
import WillInheritance from "./pages/notes/WillInheritance";
import NotesCalendar from "./pages/notes/Calendar";
import Tags from "./pages/notes/Tags";
import Templates from "./pages/notes/Templates";
import WillDetail from "./pages/notes/WillDetail";
import WillAssetDetail from "./pages/notes/WillAssetDetail";
import WillBeneficiaryDetail from "./pages/notes/WillBeneficiaryDetail";
import WillContactDetail from "./pages/notes/WillContactDetail";
import WillExecutorDetail from "./pages/notes/WillExecutorDetail";
import WillLiabilityDetail from "./pages/notes/WillLiabilityDetail";
import WillCollectionWorkspace, { WillActivityWorkspace, WillDocumentsWorkspace } from "./pages/notes/WillCollectionWorkspace";

import LibraryDashboard from "./pages/library/LibraryDashboard";
import ReadingPage from "./pages/library/ReadingPage";
import FilmWorkspace from "./pages/library/FilmWorkspace";
import BucketWorkspace from "./pages/library/BucketWorkspace";
import GoalsWorkspace from "./pages/library/GoalsWorkspace";
import IdeasWorkspace from "./pages/library/IdeasWorkspace";
import DatabasePage from "./pages/library/DatabasePage";
import ItemDetail from "./pages/library/LibraryRecord";
import LibraryTrash from "./pages/library/LibraryTrash";

import TaskBoard from "./pages/tasks/TaskBoard";
import TaskDetail from "./pages/tasks/TaskDetail";
import JournalDashboard from "./pages/journal/JournalDashboard";
import JournalToday from "./pages/journal/JournalToday";
import JournalTimeline from "./pages/journal/Timeline";
import JournalCalendar from "./pages/journal/JournalCalendar";
import JournalInsights from "./pages/journal/Insights";
import JournalReviewWorkspace from "./pages/journal/JournalReviewWorkspace";
import JournalMoodWorkspace from "./pages/journal/JournalMoodWorkspace";
import JournalRelatedRecords from "./pages/journal/JournalRelatedRecords";
import JournalRecordDetail from "./pages/journal/JournalRecordDetail";
import JournalEntryGateway from "./pages/journal/JournalEntryGateway";
import BusinessWorkspace, { BusinessDashboard, BusinessCustomers, BusinessCustomerDetail, BusinessPipeline, BusinessFollowUps, BusinessOpportunityDetail } from "./pages/business/BusinessWorkspace";

import TradingDashboard from "./pages/trading/Dashboard";
import EntryListPage from "./pages/trading/EntryListPage";
import TradeEditor from "./pages/trading/TradeEditor";
import TradeDetail from "./pages/trading/TradeDetail";
import Accounts from "./pages/trading/Accounts";
import AccountDetail from "./pages/trading/AccountDetail";
import Analytics from "./pages/trading/Analytics";
import TradingCalendar from "./pages/trading/Calendar";
import TradingRules from "./pages/trading/TradingRules";
import TradingRuleDetail from "./pages/trading/TradingRuleDetail";
import TradingReports from "./pages/trading/TradingReports";

import Settings from "./pages/Settings";
import ProductPreview from "./pages/ProductPreview";
import FileTrash from "./pages/notes/FileTrash";
import ConnectedFiles from "./pages/notes/ConnectedFiles";
import ActivityCenter from "./pages/ActivityCenter.jsx";
import SharingCenter from "./pages/SharingCenter.jsx";
import GlobalSearch from "./pages/GlobalSearch.jsx";

function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={workspaceHome(user)} replace />;
}

export default function WorkspaceApplication() {
  return <Routes>
        {/* -- Main app shell (both modes share this layout) -- */}
        <Route
          path="/"
          element={
              <ModeProvider>
                <NavigationProvider><AppShell /></NavigationProvider>
              </ModeProvider>
          }
        >
          <Route index element={<RootRedirect />} />
          <Route path="settings" element={<Settings />} />
          <Route path="activity" element={<ActivityCenter />} />
          <Route path="sharing" element={<SharingCenter />} />
          <Route path="search" element={<GlobalSearch />} />
          {import.meta.env.DEV && <Route path="product-preview" element={<ProductPreview />} />}

          {/* Notes mode */}
          <Route path="notes" element={<NotesDashboard />} />
          <Route path="notes/today" element={<Today />} />
          <Route path="notes/new" element={<NoteEditor />} />
          <Route path="notes/all" element={<NoteListPage scope="all" />} />
          <Route path="notes/favorites" element={<NoteListPage scope="favorites" />} />
          <Route path="notes/shared" element={<NoteListPage scope="shared" />} />
          <Route path="notes/archive" element={<NoteListPage scope="archive" />} />
          <Route path="notes/trash" element={<NoteListPage scope="trash" />} />
          <Route path="notes/search" element={<NoteListPage scope="search" />} />
          <Route path="notes/tags" element={<Tags />} />
          <Route path="notes/templates" element={<Templates />} />
          <Route path="notes/tags/:tag" element={<NoteListPage scope="tag" />} />
          <Route path="notes/folders" element={<Folders />} />
          <Route path="notes/folders/:folderId" element={<FolderWorkspace />} />
          <Route path="notes/files" element={<Files />} />
          <Route path="notes/files/trash" element={<FileTrash />} />
          <Route path="notes/files/connected" element={<ConnectedFiles />} />
          <Route path="notes/files/:id" element={<Files />} />
          <Route path="notes/locked" element={<LockedNotes />} />
          <Route path="vault" element={<VaultOverview />} />
          <Route path="vault/documents" element={<LockedNotes />} />
          <Route path="vault/security" element={<VaultSecurity />} />
          <Route path="vault/activity" element={<VaultActivity />} />
          <Route
          path="notes/will"
          element={<Navigate to="/will" replace />}
        />

        <Route
          path="will"
          element={<WillInheritance />}
        />

        <Route path="will/assets" element={<WillCollectionWorkspace view="assets" />} />
        <Route path="will/liabilities" element={<WillCollectionWorkspace view="liabilities" />} />
        <Route path="will/beneficiaries" element={<WillCollectionWorkspace view="beneficiaries" />} />
        <Route path="will/people" element={<WillCollectionWorkspace view="people" />} />
        <Route path="will/instructions" element={<WillCollectionWorkspace view="instructions" />} />
        <Route path="will/digital-legacy" element={<WillCollectionWorkspace view="digital" />} />
        <Route path="will/documents" element={<WillDocumentsWorkspace />} />
        <Route path="will/activity" element={<WillActivityWorkspace />} />

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
          <Route
            path="will/liabilities/:id"
            element={<WillLiabilityDetail />}
          />
          <Route path="notes/calendar" element={<NotesCalendar />} />

          {/* Library (no Calendar anywhere in here, per the approved update) */}
          <Route path="notes/library" element={<LibraryDashboard />} />
          <Route path="notes/library/trash" element={<LibraryTrash />} />
          <Route path="notes/library/reading" element={<ReadingPage />} />
          <Route path="notes/library/reading/:id" element={<ItemDetail configKey="reading" />} />
          <Route path="notes/library/films" element={<FilmWorkspace />} />
          <Route path="notes/library/films/:id" element={<ItemDetail configKey="films" />} />
          <Route path="notes/library/goals" element={<GoalsWorkspace />} />
          <Route path="notes/library/goals/:id" element={<ItemDetail configKey="goals" />} />
          <Route path="notes/library/travel" element={<DatabasePage configKey="travel" />} />
          <Route path="notes/library/travel/:id" element={<ItemDetail configKey="travel" />} />
          <Route path="notes/library/bucket" element={<BucketWorkspace />} />
          <Route path="notes/library/bucket/:id" element={<ItemDetail configKey="bucket" />} />
          <Route path="notes/library/ideas" element={<IdeasWorkspace />} />
          <Route path="notes/library/ideas/:id" element={<ItemDetail configKey="ideas" />} />
          <Route path="notes/library/projects" element={<DatabasePage configKey="projects" />} />
          <Route path="notes/library/projects/:id" element={<ItemDetail configKey="projects" />} />

          {/* Task List (no Calendar here either) */}
          <Route path="notes/tasks" element={<TaskBoard />} />
          <Route path="notes/tasks/:id" element={<TaskDetail />} />

          {/* This catch-all note editor route must stay last among /notes/*
              routes so it doesn't shadow the static paths above. */}
          <Route path="notes/:id" element={<NoteEditor />} />

          {/* Personal Journal — persisted through the rich record engine */}
          <Route path="journal" element={<JournalDashboard />} />
          <Route path="journal/today" element={<JournalToday />} />
          <Route path="journal/new" element={<JournalEntryGateway />} />
          <Route path="journal/timeline" element={<JournalTimeline />} />
          <Route path="journal/calendar" element={<JournalCalendar />} />
          <Route path="journal/insights" element={<JournalInsights />} />
          <Route path="journal/reviews" element={<JournalReviewWorkspace mode="weekly" />} />
          <Route path="journal/reviews/weekly" element={<JournalReviewWorkspace mode="weekly" />} />
          <Route path="journal/reviews/monthly" element={<JournalReviewWorkspace mode="monthly" />} />
          <Route path="journal/reviews/quarterly" element={<JournalReviewWorkspace mode="quarterly" />} />
          <Route path="journal/reviews/annual" element={<JournalReviewWorkspace mode="annual" />} />
          <Route path="journal/decisions" element={<JournalReviewWorkspace mode="decisions" />} />
          <Route path="journal/calibration" element={<JournalReviewWorkspace mode="calibration" />} />
          <Route path="journal/reflections" element={<JournalReviewWorkspace mode="reflections" />} />
          <Route path="journal/mood" element={<JournalMoodWorkspace />} />
          <Route path="journal/lessons" element={<JournalReviewWorkspace mode="lessons" />} />
          <Route path="journal/goals" element={<Navigate to="/notes/library/goals" replace />} />
          <Route path="journal/related" element={<JournalRelatedRecords />} />
          <Route path="journal/entries/:id" element={<JournalRecordDetail />} />
          <Route path="journal/entries/:id/edit" element={<NoteEditor kind="JOURNAL" />} />

          <Route path="business" element={<BusinessWorkspace />}>
            <Route index element={<BusinessDashboard />} />
            <Route path="customers" element={<BusinessCustomers />} />
            <Route path="customers/:id" element={<BusinessCustomerDetail />} />
            <Route path="pipeline" element={<BusinessPipeline />} />
            <Route path="follow-ups" element={<BusinessFollowUps />} />
            <Route path="opportunities/:id" element={<BusinessOpportunityDetail />} />
          </Route>

          {/* Trading Journal mode */}
          <Route path="trading" element={<TradingDashboard />} />
          <Route path="trading/entries" element={<EntryListPage mode="all" />} />
          <Route path="trading/entries/new" element={<TradeEditor />} />
          <Route path="trading/entries/:id" element={<TradeDetail />} />
          <Route path="trading/entries/:id/edit" element={<TradeEditor />} />
          <Route path="trading/accounts" element={<Accounts />} />
          <Route path="trading/accounts/:id" element={<AccountDetail />} />
          <Route path="trading/rules" element={<TradingRules />} />
          <Route path="trading/rules/:id" element={<TradingRuleDetail />} />
          <Route path="trading/calendar" element={<TradingCalendar />} />
          <Route path="trading/analytics" element={<Analytics />} />
          <Route path="trading/reports" element={<TradingReports />} />
          <Route path="trading/search" element={<EntryListPage mode="search" />} />
        </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
