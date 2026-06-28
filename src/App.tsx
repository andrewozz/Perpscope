import { Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DashboardPage from './features/dashboard/DashboardPage';
import ScannerPage from './features/scanner/ScannerPage';
import EnginePage from './features/engine/EnginePage';

function App() {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-[#05070d]">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/scanner" element={<ScannerPage />} />
            <Route path="/engine" element={<EnginePage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
