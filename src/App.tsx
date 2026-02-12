import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SuppliersList from './pages/Suppliers/SuppliersList';
import SupplierDetail from './pages/Suppliers/SupplierDetail';
import ProjectsList from './pages/Projects/ProjectsList';
import ProjectDetail from './pages/Projects/ProjectDetail';
import ActivityLibraryPage from './pages/ActivityLibrary/ActivityLibraryPage';
import ActivityTemplateDetail from './pages/ActivityLibrary/ActivityTemplateDetail';
import TrackingGrid from './pages/SupplierProjects/TrackingGrid';
import SupplierProjectDetail from './pages/SupplierProjects/SupplierProjectDetail';
import ReportsPage from './pages/Reports/ReportsPage';
import SettingsPage from './pages/Settings/SettingsPage';
import HelpPage from './pages/Help/HelpPage';
import PartsPage from './pages/Parts/PartsPage';
import ImportExportPage from './pages/ImportExport/ImportExportPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/suppliers" element={<SuppliersList />} />
        <Route path="/suppliers/:id" element={<SupplierDetail />} />
        <Route path="/projects" element={<ProjectsList />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/activity-templates" element={<ActivityLibraryPage />} />
        <Route path="/activity-templates/:id" element={<ActivityTemplateDetail />} />
        <Route path="/tracking" element={<TrackingGrid />} />
        <Route path="/supplier-projects/:supplierId/:projectId" element={<SupplierProjectDetail />} />
        <Route path="/parts" element={<PartsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/import-export" element={<ImportExportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Routes>
    </Layout>
  );
}
