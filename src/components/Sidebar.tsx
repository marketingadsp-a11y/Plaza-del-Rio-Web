import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  DollarSign, 
  Users, 
  History, 
  CreditCard, 
  Printer, 
  LogOut, 
  Database,
  Menu,
  X,
  User as UserIcon,
  ShieldAlert,
  BarChart3,
  Sliders,
  FileCheck2
} from 'lucide-react';
import { User } from '../types';
import { getPreferredDbId, setPreferredDbId } from '../lib/firebase';
import { useAppLogo } from '../lib/appConfig';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, onTabChange, currentUser, onLogout }: SidebarProps) {
  const { logoUrl, defaultLogo } = useAppLogo();
  const [isOpen, setIsOpen] = useState(false);
  const [dbId, setDbId] = useState(getPreferredDbId());
  const [isEditingDb, setIsEditingDb] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Vista General', icon: LayoutDashboard },
    { id: 'records', label: 'Registros y Tickets', icon: FileSpreadsheet },
    { id: 'prepaid', label: 'Pensionados / Mensuales', icon: CreditCard },
    { id: 'backups', label: 'Analizar Respaldos', icon: FileCheck2 },
    { id: 'shifts', label: 'Turnos y Cortes', icon: History },
    { id: 'users', label: 'Cajeros y Usuarios', icon: Users },
    { id: 'rates', label: 'Tarifas por Vehículo', icon: DollarSign },
    { id: 'reports', label: 'Reportes y Descargas', icon: BarChart3 },
    { id: 'config', label: 'Configuración y Logotipo', icon: Sliders },
  ];

  const handleDbSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDbId = dbId.trim();
    setPreferredDbId(cleanDbId);
    setIsEditingDb(false);
    // Reload page to re-initialize firebase with the new DB ID
    window.location.reload();
  };

  const effectiveLogo = logoUrl || defaultLogo;

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between bg-slate-900 border-b border-slate-800 text-white px-5 py-4 sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2.5">
          <img 
            src={effectiveLogo} 
            alt="Logo" 
            className="w-9 h-9 rounded-lg object-contain bg-slate-800 border border-slate-700 shadow-md p-0.5" 
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = defaultLogo;
            }} 
          />
          <span className="font-bold tracking-tight text-md">Plaza del Río</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-slate-800 rounded-xl transition-all"
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Sidebar Overlay for Mobile */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 left-0 bg-slate-900 border-r border-slate-800 text-slate-300 w-72 lg:w-80 flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 lg:static
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Banner */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={effectiveLogo} 
              alt="Logo" 
              className="w-11 h-11 rounded-xl object-contain bg-slate-800 border border-slate-700 shadow-md p-1" 
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = defaultLogo;
              }} 
            />
            <div>
              <h2 className="font-extrabold text-white text-lg tracking-tight">Plaza del Río</h2>
              <span className="text-xs text-blue-400 font-medium tracking-wider uppercase">Parking Admin</span>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        {/* User profile info */}
        <div className="p-5 mx-4 my-4 bg-slate-800/40 border border-slate-800 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
            <UserIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{currentUser.fullName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                {currentUser.role}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">@{currentUser.username}</span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-thin">
          <span className="block px-3 text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">
            Módulos de Gestión
          </span>
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3.5 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer group
                  ${isActive 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/15' 
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  }
                `}
              >
                <IconComponent 
                  size={18} 
                  className={`transition-transform duration-200 group-hover:scale-105 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} 
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Panel (Database Switcher and Logout) */}
        <div className="p-4 border-t border-slate-800 space-y-4">
          {/* Database Selector Widget */}
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 text-xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="flex items-center gap-1.5 font-medium text-slate-400">
                <Database size={13} className="text-blue-400" />
                Firestore DB:
              </span>
              {!isEditingDb && (
                <button 
                  onClick={() => setIsEditingDb(true)}
                  className="text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                >
                  Cambiar
                </button>
              )}
            </div>

            {isEditingDb ? (
              <form onSubmit={handleDbSave} className="space-y-2 mt-1">
                <input
                  type="text"
                  value={dbId}
                  onChange={(e) => setDbId(e.target.value)}
                  placeholder="ID de base de datos o (default)"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDbId(getPreferredDbId());
                      setIsEditingDb(false);
                    }}
                    className="px-2 py-1 bg-slate-800 text-slate-400 hover:bg-slate-700 rounded font-medium text-[10px]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-1 bg-blue-600 text-white hover:bg-blue-500 rounded font-semibold text-[10px]"
                  >
                    Aplicar
                  </button>
                </div>
              </form>
            ) : (
              <div className="font-mono bg-slate-900 px-2.5 py-1.5 rounded-lg text-blue-300 font-semibold truncate flex items-center justify-between border border-slate-800">
                <span className="truncate" title={dbId}>{dbId || '(default)'}</span>
              </div>
            )}
            
            <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
              *Cambiar a <code className="font-mono text-slate-400">(default)</code> si la app móvil usa la DB predeterminada.
            </p>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3.5 px-4 py-3 text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-xl font-medium text-sm transition-all cursor-pointer"
          >
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
