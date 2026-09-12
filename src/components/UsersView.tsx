import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { getDb, sha256 } from '../lib/firebase';
import { User } from '../types';
import { useParkingLots } from '../lib/parkingLots';
import { 
  Users, 
  Plus, 
  Edit2, 
  Key, 
  UserCheck, 
  UserX, 
  AlertTriangle, 
  X, 
  Check, 
  Shield, 
  Loader2,
  Lock,
  Building2,
  Sliders,
  Globe,
  Search
} from 'lucide-react';

interface UsersViewProps {
  currentUser: User;
}

export default function UsersView({ currentUser }: UsersViewProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [lotFilter, setLotFilter] = useState<string>('ALL');

  // Modal / Form state for Users
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);

  // Modal state for Global Parking Lot Names
  const [isConfigLotsModalOpen, setIsConfigLotsModalOpen] = useState(false);
  const [editLotNames, setEditLotNames] = useState<Record<string, string>>({});
  const [customLotCount, setCustomLotCount] = useState<number>(2);
  const [savingLots, setSavingLots] = useState(false);

  // Form inputs (Create/Edit User)
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [isActive, setIsActive] = useState(true);
  const [assignedParkingLot, setAssignedParkingLot] = useState<number | ''>('');

  // Password Update inputs
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Collect all known parking lot IDs from the users list
  const knownLotIds = useMemo(() => {
    return users
      .map((u) => u.assignedParkingLot)
      .filter((id): id is number => typeof id === 'number' && id > 0);
  }, [users]);

  // Hook for settings/global parking lots
  const { parkingLots, getLotName, saveParkingLotNames, loading: loadingLots } = useParkingLots(knownLotIds);

  // Listen to users collection
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: User[] = [];
      snap.forEach((doc) => {
        list.push({ username: doc.id, ...doc.data() } as User);
      });
      setUsers(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Error al cargar la colección de usuarios.');
      setLoading(false);
    });

    return unsub;
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setUsername('');
    setFullName('');
    setPassword('');
    setRole('EMPLOYEE');
    setIsActive(true);
    // Default to the first available lot or 1
    setAssignedParkingLot(parkingLots.length > 0 ? parkingLots[0].id : 1);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setFullName(user.fullName);
    setRole(user.role);
    setIsActive(user.isActive);
    setAssignedParkingLot(
      user.assignedParkingLot !== undefined && user.assignedParkingLot !== null
        ? user.assignedParkingLot
        : ''
    );
    setError(null);
    setIsModalOpen(true);
  };

  const openPasswordModal = (user: User) => {
    setPasswordUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setIsPasswordModalOpen(true);
  };

  const openConfigLotsModal = () => {
    const map: Record<string, string> = {};
    parkingLots.forEach((lot) => {
      map[lot.fieldName] = lot.name;
    });
    setEditLotNames(map);
    setCustomLotCount(Math.max(2, ...parkingLots.map((p) => p.id)));
    setIsConfigLotsModalOpen(true);
  };

  const handleAddAnotherLotField = () => {
    const nextId = customLotCount + 1;
    setCustomLotCount(nextId);
    setEditLotNames((prev) => ({
      ...prev,
      [`parkingLot${nextId}Name`]: `Estacionamiento ${nextId}`
    }));
  };

  const handleSaveLotsConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLots(true);
    try {
      await saveParkingLotNames(editLotNames);
      showSuccess('Nombres de estacionamientos actualizados en settings/global.');
      setIsConfigLotsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar configuración de estacionamientos: ${err.message || err}`);
    } finally {
      setSavingLots(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    const cleanFullName = fullName.trim();

    if (!cleanUsername) {
      setError('El nombre de usuario es obligatorio.');
      return;
    }
    if (!cleanFullName) {
      setError('El nombre completo es obligatorio.');
      return;
    }

    // Creating new user
    if (!editingUser) {
      if (!password) {
        setError('La contraseña es obligatoria para nuevos usuarios.');
        return;
      }
      if (password.length < 4) {
        setError('La contraseña debe tener al menos 4 caracteres.');
        return;
      }

      // Check if user already exists
      const exists = users.some((u) => u.username === cleanUsername);
      if (exists) {
        setError('El nombre de usuario ya está registrado.');
        return;
      }
    }

    const lotValue = assignedParkingLot === '' ? null : Number(assignedParkingLot);

    try {
      const db = getDb();
      const userRef = doc(db, 'users', cleanUsername);

      if (editingUser) {
        // Self protection
        if (editingUser.username === currentUser.username && role !== 'ADMIN') {
          setError('No puedes quitarte el rol de Administrador a ti mismo.');
          return;
        }
        if (editingUser.username === currentUser.username && !isActive) {
          setError('No puedes desactivar tu propia cuenta de Administrador.');
          return;
        }

        await updateDoc(userRef, {
          fullName: cleanFullName,
          role: role,
          isActive: isActive,
          assignedParkingLot: lotValue
        });

        showSuccess('Usuario actualizado correctamente.');
      } else {
        // Create flow
        const hash = await sha256(password);
        const newUser: User = {
          username: cleanUsername,
          fullName: cleanFullName,
          passwordHash: hash,
          role: role,
          isActive: isActive,
          assignedParkingLot: lotValue
        };

        await setDoc(userRef, newUser);
        showSuccess('Usuario creado correctamente.');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar: ${err.message || err}`);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passwordUser) return;
    if (newPassword.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      const db = getDb();
      const userRef = doc(db, 'users', passwordUser.username);
      const hash = await sha256(newPassword);

      await updateDoc(userRef, {
        passwordHash: hash
      });

      setIsPasswordModalOpen(false);
      showSuccess(`Contraseña de @${passwordUser.username} actualizada con éxito.`);
    } catch (err: any) {
      console.error(err);
      setError(`Error al actualizar contraseña: ${err.message || err}`);
    }
  };

  const handleToggleActive = async (user: User) => {
    setError(null);
    if (user.username === currentUser.username) {
      setError('No puedes desactivar tu propia cuenta de Administrador.');
      return;
    }

    try {
      const db = getDb();
      const userRef = doc(db, 'users', user.username);
      await updateDoc(userRef, {
        isActive: !user.isActive
      });

      showSuccess(`Usuario ${user.username} ${!user.isActive ? 'activado' : 'desactivado'} con éxito.`);
    } catch (err: any) {
      console.error(err);
      setError(`Error al cambiar estado: ${err.message || err}`);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  // Filtered users according to search and lot selection
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = u.fullName.toLowerCase().includes(q);
        const matchUser = u.username.toLowerCase().includes(q);
        if (!matchName && !matchUser) return false;
      }

      if (lotFilter === 'ALL') return true;
      if (lotFilter === 'UNASSIGNED') {
        return u.assignedParkingLot === undefined || u.assignedParkingLot === null || u.assignedParkingLot === 0;
      }
      return u.assignedParkingLot === Number(lotFilter);
    });
  }, [users, searchQuery, lotFilter]);

  return (
    <div className="space-y-6 p-1.5 md:p-3 max-w-7xl mx-auto font-sans text-slate-300">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img 
            src="/logo-plaza-1.jpg" 
            alt="Logo" 
            className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }} 
          />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>Cajeros y Usuarios</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestión de personal y control de acceso por estacionamiento asignado
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Button to configure parking lot names in settings/global */}
          <button
            onClick={openConfigLotsModal}
            title="Editar nombres de estacionamientos en ajustes globales"
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Sliders size={15} className="text-blue-400" />
            Nombres de Estacionamientos
          </button>

          {/* Button to register user */}
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={16} />
            Registrar Nuevo Cajero/Admin
          </button>
        </div>
      </div>

      {/* Parking lot summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {parkingLots.map((lot) => {
          const count = users.filter((u) => u.assignedParkingLot === lot.id).length;
          const isSelected = lotFilter === String(lot.id);
          return (
            <button
              key={lot.id}
              onClick={() => setLotFilter(isSelected ? 'ALL' : String(lot.id))}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600/15 border-blue-500/50 ring-1 ring-blue-500/30'
                  : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 font-mono">
                  Lote #{lot.id}
                </span>
                <span className="text-xs font-extrabold text-white bg-slate-700/60 px-2 py-0.5 rounded-full">
                  {count} {count === 1 ? 'cajero' : 'cajeros'}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-200 truncate">{lot.name}</p>
            </button>
          );
        })}

        <button
          onClick={() => setLotFilter(lotFilter === 'ALL' ? 'UNASSIGNED' : 'ALL')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            lotFilter === 'ALL'
              ? 'bg-emerald-600/15 border-emerald-500/40'
              : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
              Total Personal
            </span>
            <span className="text-xs font-extrabold text-white bg-slate-700/60 px-2 py-0.5 rounded-full">
              {users.length}
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-200">Ver Todos los Usuarios</p>
        </button>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-sm flex items-center gap-3">
          <Check size={18} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-800/60 border border-slate-700/50 p-3 rounded-2xl">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o @usuario..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-slate-400 shrink-0" />
          <select
            value={lotFilter}
            onChange={(e) => setLotFilter(e.target.value)}
            className="bg-slate-900/80 border border-slate-700/80 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
          >
            <option value="ALL">Filtrar: Todos los Estacionamientos</option>
            {parkingLots.map((lot) => (
              <option key={lot.id} value={String(lot.id)}>
                Lote #{lot.id}: {lot.name}
              </option>
            ))}
            <option value="UNASSIGNED">Sin Estacionamiento Asignado</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 size={36} className="animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando usuarios...</p>
          </div>
        ) : filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs font-bold uppercase tracking-wider bg-slate-800/40">
                  <th className="py-4 px-6">Nombre Completo</th>
                  <th className="py-4 px-6 font-mono">Usuario</th>
                  <th className="py-4 px-6">Rol</th>
                  <th className="py-4 px-6">Estacionamiento Asignado</th>
                  <th className="py-4 px-6 text-center">Estado</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredUsers.map((u) => {
                  const isSelf = u.username === currentUser.username;
                  return (
                    <tr key={u.username} className={`hover:bg-slate-700/20 text-xs text-slate-300 ${isSelf ? 'bg-blue-600/5' : ''}`}>
                      <td className="py-3.5 px-6">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {u.fullName}
                          {isSelf && (
                            <span className="text-[9px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded">TÚ</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 font-mono text-slate-400">@{u.username}</td>
                      <td className="py-3.5 px-6">
                        {u.role === 'ADMIN' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-400/10 px-2.5 py-0.5 rounded-full border border-blue-400/20">
                            <Shield size={10} /> Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-slate-400 bg-slate-400/10 px-2.5 py-0.5 rounded-full border border-slate-400/20">
                            Cajero / Employee
                          </span>
                        )}
                      </td>

                      {/* Estacionamiento Asignado Column */}
                      <td className="py-3.5 px-6">
                        {u.role === 'ADMIN' && (u.assignedParkingLot === undefined || u.assignedParkingLot === null) ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-300 bg-blue-900/30 border border-blue-700/40 px-2.5 py-1 rounded-lg">
                            <Globe size={12} className="text-blue-400 shrink-0" />
                            Acceso Global (Todos)
                          </span>
                        ) : u.assignedParkingLot ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-lg w-fit">
                              <Building2 size={12} className="text-emerald-400 shrink-0" />
                              {getLotName(u.assignedParkingLot)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono pl-1">
                              Lote #{u.assignedParkingLot}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700/50 px-2.5 py-1 rounded-lg">
                            Sin Asignar
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-center font-semibold">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full border border-emerald-400/20">
                            Habilitado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-red-400 bg-red-400/10 px-2.5 py-0.5 rounded-full border border-red-400/20">
                            Deshabilitado
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {/* Toggle Active status */}
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={isSelf}
                            title={u.isActive ? 'Desactivar Cuenta' : 'Activar Cuenta'}
                            className={`p-1.5 border rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed
                              ${u.isActive 
                                ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white' 
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white'}`}
                          >
                            {u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>

                          {/* Reset Password */}
                          <button
                            onClick={() => openPasswordModal(u)}
                            title="Actualizar Contraseña"
                            className="p-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
                          >
                            <Key size={14} />
                          </button>

                          {/* Edit Details */}
                          <button
                            onClick={() => openEditModal(u)}
                            title="Editar Perfil"
                            className="p-1.5 bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-lg transition-all cursor-pointer"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-24 text-center text-slate-500">
            <AlertTriangle size={32} className="mx-auto text-slate-600 mb-2" />
            <span className="font-semibold text-slate-400">Sin usuarios coincidentes</span>
            <p className="text-xs mt-1">
              {searchQuery || lotFilter !== 'ALL'
                ? 'Prueba cambiando los filtros o el término de búsqueda.'
                : 'Crea un nuevo usuario haciendo clic en el botón de arriba.'}
            </p>
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT USER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users size={20} className="text-blue-500" />
              {editingUser ? 'Editar Cajero/Usuario' : 'Registrar Nuevo Cajero/Admin'}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nombre de Usuario (ID Único de Documento)
                </label>
                <input
                  type="text"
                  required
                  disabled={editingUser !== null} // Username is Document ID, immutable
                  placeholder="ej. pedro_cajero"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none disabled:opacity-50 disabled:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Pedro Ramírez García"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Contraseña Inicial (Se hasheará en SHA-256)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                      <Lock size={16} />
                    </span>
                    <input
                      type="password"
                      required
                      placeholder="Contraseña del cajero"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Rol en Sistema
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'ADMIN' | 'EMPLOYEE')}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                  >
                    <option value="EMPLOYEE">Cajero (Employee)</option>
                    <option value="ADMIN">Administrador (Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Estado Acceso
                  </label>
                  <select
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                  >
                    <option value="true">Activo / Permitir</option>
                    <option value="false">Inactivo / Bloqueado</option>
                  </select>
                </div>
              </div>

              {/* Selector de Estacionamiento Asignado */}
              <div className="p-3.5 bg-slate-900/80 border border-slate-700/80 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Building2 size={14} className="text-blue-400" />
                    Estacionamiento Asignado (assignedParkingLot)
                  </label>
                  <button
                    type="button"
                    onClick={openConfigLotsModal}
                    className="text-[11px] text-slate-400 hover:text-blue-300 underline flex items-center gap-1 cursor-pointer"
                  >
                    Editar nombres
                  </button>
                </div>

                <select
                  value={assignedParkingLot === '' ? '' : String(assignedParkingLot)}
                  onChange={(e) => setAssignedParkingLot(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                >
                  <option value="">
                    {role === 'ADMIN' 
                      ? 'Todos los Estacionamientos (Acceso Global)' 
                      : 'Sin Asignar / Todos los Estacionamientos'}
                  </option>
                  {parkingLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      Lote #{lot.id} — {lot.name}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-slate-400 leading-normal">
                  {role === 'EMPLOYEE'
                    ? 'Determina a qué estacionamiento tiene acceso este cajero para emitir tickets y cobrar según su estación de trabajo.'
                    : 'Para administradores se recomienda dejar en "Todos los Estacionamientos" a menos que supervise un lote específico.'}
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
                >
                  Guardar Perfil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIAR / ACTUALIZAR CONTRASEÑA */}
      {isPasswordModalOpen && passwordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setIsPasswordModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Key size={20} className="text-yellow-400" />
              Restablecer Contraseña
            </h3>
            <p className="text-xs text-slate-400 mb-4">Actualizando credenciales de: <span className="text-white font-semibold font-mono">@{passwordUser.username}</span></p>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 4 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>

              <p className="text-[10px] text-slate-500 leading-normal">
                *La contraseña se aplicará inmediatamente cifrada mediante SHA-256 de forma irreversible antes de actualizar Firestore. El cajero deberá iniciar sesión con esta nueva contraseña.
              </p>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 rounded-xl text-xs font-bold transition-all shadow-lg shadow-yellow-500/10 cursor-pointer"
                >
                  Confirmar Nueva Contraseña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURAR NOMBRES DE ESTACIONAMIENTOS EN SETTINGS/GLOBAL */}
      {isConfigLotsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsConfigLotsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                <Sliders size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Nombres de Estacionamientos</h3>
                <p className="text-xs text-slate-400">
                  Configuración global almacenada en <code className="font-mono text-blue-400">settings/global</code>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 leading-relaxed">
              Los nombres definidos aquí se utilizan para identificar cada lote (ej. <span className="font-mono text-white">parkingLot1Name</span>, <span className="font-mono text-white">parkingLot2Name</span>) en el selector de usuarios, reportes y tarifas.
            </p>

            <form onSubmit={handleSaveLotsConfig} className="space-y-4">
              <div className="space-y-3">
                {Array.from({ length: customLotCount }, (_, i) => i + 1).map((lotId) => {
                  const fieldKey = `parkingLot${lotId}Name`;
                  const val = editLotNames[fieldKey] || '';
                  return (
                    <div key={lotId} className="bg-slate-900/90 border border-slate-700/70 p-3.5 rounded-xl">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Building2 size={13} className="text-emerald-400" />
                          Estacionamiento #{lotId}
                        </label>
                        <span className="text-[10px] font-mono text-slate-500">
                          campo: {fieldKey}
                        </span>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder={`Nombre descriptivo para Lote #${lotId}`}
                        value={val}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setEditLotNames((prev) => ({
                            ...prev,
                            [fieldKey]: newVal
                          }));
                        }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleAddAnotherLotField}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                >
                  <Plus size={14} />
                  Agregar Lote #{customLotCount + 1}
                </button>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsConfigLotsModalOpen(false)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingLots}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                  >
                    {savingLots ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Guardar Nombres Globales
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
