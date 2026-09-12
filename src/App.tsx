import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import ParkingRecordsView from './components/ParkingRecordsView';
import RatesView from './components/RatesView';
import UsersView from './components/UsersView';
import ShiftsView from './components/ShiftsView';
import PrepaidView from './components/PrepaidView';
import TicketConfigView from './components/TicketConfigView';
import ReportsView from './components/ReportsView';
import { User } from './types';
import { Shield, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [checkingSession, setCheckingSession] = useState(true);

  // Load session from localStorage on startup
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('plaza_del_rio_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser) as User;
        // Verify session validity or simply restore
        setCurrentUser(parsed);
      }
    } catch (err) {
      console.error('Error recovering session:', err);
      localStorage.removeItem('plaza_del_rio_user');
    } finally {
      setCheckingSession(false);
    }
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('plaza_del_rio_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('plaza_del_rio_user');
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <Loader2 size={40} className="animate-spin text-blue-500 mb-3" />
        <span className="text-sm font-semibold">Cargando Plaza del Río...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Render the selected view
  const renderView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'records':
        return <ParkingRecordsView currentUser={currentUser} />;
      case 'rates':
        return <RatesView />;
      case 'users':
        return <UsersView currentUser={currentUser} />;
      case 'shifts':
        return <ShiftsView />;
      case 'prepaid':
        return <PrepaidView />;
      case 'config':
        return <TicketConfigView />;
      case 'reports':
        return <ReportsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-8 lg:px-8 bg-slate-950">
        <div className="animate-fade-in duration-300">
          {renderView()}
        </div>
      </main>
    </div>
  );
}
