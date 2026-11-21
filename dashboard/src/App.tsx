import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout";
import { CallDetailPage } from "@/pages/CallDetail";
import { CallsPage } from "@/pages/Calls";
import { FollowupsPage } from "@/pages/Followups";
import { OverviewPage } from "@/pages/Overview";
import { ToolsPage } from "@/pages/Tools";

export default function App() {
  return (
    <BrowserRouter basename="/app">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="calls/:id" element={<CallDetailPage />} />
          <Route path="followups" element={<FollowupsPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
