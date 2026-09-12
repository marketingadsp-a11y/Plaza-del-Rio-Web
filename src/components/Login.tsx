import React, { useState, useEffect } from 'react';
import { getDoc, doc, setDoc, collection, getDocs, limit, query } from 'firebase/firestore';
import { getDb, sha256, getPreferredDbId } from '../lib/firebase';
import { Shield, Lock, User as UserIcon, AlertCircle, Database, HelpCircle, Check, Loader2 } from 'lucide-react';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const [dbEmpty, setDbEmpty] = useState<boolean | null>(null);
  const [currentDbId, setCurrentDbId] = useState(getPreferredDbId());

  // Check if users collection is empty to guide the user to create a default admin
  useEffect(() => {
    async function checkDbEmpty() {
      try {
        const db = getDb();
        const q = query(collection(db, 'users'), limit(1));
        const snap = await getDocs(q);
        setDbEmpty(snap.empty);
      } catch (err) {
        console.warn('Error checking if users exist:', err);
        // Could be due to empty database or permissions
        setDbEmpty(true);
      }
    }
    checkDbEmpty();
  }, [currentDbId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Por favor, ingresa tu usuario y contraseña.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = getDb();
      const userRef = doc(db, 'users', username.trim());
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setError('El usuario no existe.');
        setLoading(false);
        return;
      }

      const userData = userSnap.data() as User;
      const enteredHash = await sha256(password);

      if (userData.passwordHash !== enteredHash) {
        setError('Contraseña incorrecta.');
        setLoading(false);
        return;
      }

      if (userData.role !== 'ADMIN') {
        setError('Acceso denegado: Se requiere rol de Administrador.');
        setLoading(false);
        return;
      }

      if (!userData.isActive) {
        setError('Tu cuenta de administrador está inactiva.');
        setLoading(false);
        return;
      }

      // Validated successfully
      onLoginSuccess(userData);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(`Error de conexión con Firebase: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDefaultAdmin = async () => {
    setSeeding(true);
    setError(null);
    try {
      const db = getDb();
      const adminUsername = 'admin';
      const adminPassword = 'admin123';
      const hash = await sha256(adminPassword);

      const defaultAdmin: User = {
        username: adminUsername,
        fullName: 'Administrador de Sistema (Demo)',
        passwordHash: hash,
        role: 'ADMIN',
        isActive: true,
      };

      await setDoc(doc(db, 'users', adminUsername), defaultAdmin);
      
      // Also seed basic rates so app can start nicely
      const defaultRates = [
        { typeName: 'Auto', hourlyRate: 20, isDefault: true },
        { typeName: 'Motocicleta', hourlyRate: 10, isDefault: false },
        { typeName: 'Camioneta/SUV', hourlyRate: 30, isDefault: false }
      ];

      for (const rate of defaultRates) {
        await setDoc(doc(db, 'vehicle_type_rates', rate.typeName), rate);
      }

      // Seed ticket config
      const defaultTicketConfig = {
        headerText: 'PLAZA DEL RÍO - ESTACIONAMIENTO',
        termsText: 'Conserve este boleto. No nos hacemos responsables por objetos dejados dentro del vehículo. Horas o fracción.',
        showLogo: true,
        showTerms: true,
        exitShowFolio: true
      };
      await setDoc(doc(db, 'ticket_config', 'config'), defaultTicketConfig);

      setSeedSuccess(true);
      setDbEmpty(false);
      setUsername('admin');
      setPassword('admin123');
      
      setTimeout(() => {
        setSeedSuccess(false);
      }, 5000);
    } catch (err: any) {
      console.error('Error seeding default admin:', err);
      setError(`Error al crear usuario por defecto: ${err.message || err}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-12 relative overflow-hidden font-sans">
      {/* Decorative gradients */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-md relative">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/logo-plaza-1.jpg" alt="Logo Plaza del Río" className="w-20 h-20 rounded-3xl object-cover shadow-2xl border-2 border-slate-700/60" onError={(e) => {
              // fallback if logo is missing or empty
              e.currentTarget.style.display = 'none';
            }} />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Plaza del Río</h1>
          <p className="text-slate-400 mt-2 font-medium">Panel de Control de Estacionamiento</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Iniciar Sesión</h2>
            <p className="text-xs text-slate-400 mt-1">Acceso exclusivo para Administradores de Plaza del Río</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Nombre de Usuario
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <UserIcon size={18} />
                </span>
                <input
                  id="username"
                  type="text"
                  required
                  placeholder="ej. juan_admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Contraseña
                </label>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <Lock size={18} />
                </span>
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-2 text-sm cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Verificando...
                </>
              ) : (
                'Ingresar al Panel'
              )}
            </button>
          </form>

          {/* Database Info & Switcher */}
          <div className="mt-6 pt-5 border-t border-slate-700/60 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/40 p-3 rounded-xl border border-slate-700/40">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <Database size={14} className="text-blue-400" />
                Base de Datos activa:
              </span>
              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-blue-300 font-semibold truncate max-w-[180px]" title={currentDbId}>
                {currentDbId}
              </span>
            </div>

            {/* Empty DB Guide Helper */}
            {dbEmpty && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-slate-300 text-xs flex flex-col gap-3">
                <div className="flex gap-2 items-start">
                  <HelpCircle size={16} className="text-blue-400 shrink-0 mt-0.5 animate-bounce" />
                  <div>
                    <span className="font-semibold text-blue-300">¿Base de datos nueva o vacía?</span>
                    <p className="mt-1 text-slate-400">
                      No se encontraron usuarios en la colección <code className="font-mono bg-slate-900/60 px-1 py-0.5 rounded text-blue-200">users</code> para este Database ID. Puedes inicializar un Administrador de demostración y tarifas básicas.
                    </p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={handleSeedDefaultAdmin}
                  disabled={seeding || seedSuccess}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  {seeding ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Inicializando...
                    </>
                  ) : seedSuccess ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      ¡Creado! admin / admin123
                    </>
                  ) : (
                    'Inicializar Admin de Demo'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom copyright/indicator */}
        <p className="text-center text-slate-500 text-xs mt-6">
          © 2026 Plaza del Río. Todos los derechos reservados.<br />
          Sincronizado en tiempo real.
        </p>
      </div>
    </div>
  );
}
