import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { TicketConfig } from '../types';
import { 
  Printer, 
  Save, 
  Check, 
  AlertTriangle, 
  Loader2, 
  Sliders, 
  FileText,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

export default function TicketConfigView() {
  const [config, setConfig] = useState<TicketConfig>({
    headerText: 'PLAZA DEL RÍO - PARKING',
    termsText: 'Conserve este boleto. No nos hacemos responsables por daños o robos parciales.',
    showLogo: true,
    showTerms: true,
    exitShowFolio: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen to config in real-time
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(doc(db, 'ticket_config', 'config'), (snap) => {
      if (snap.exists()) {
        setConfig(snap.data() as TicketConfig);
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Error al sincronizar configuración.');
      setLoading(false);
    });

    return unsub;
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const db = getDb();
      await setDoc(doc(db, 'ticket_config', 'config'), config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar configuración remota: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 size={40} className="animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-medium">Sincronizando configuración con Firestore...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1.5 md:p-3 max-w-4xl mx-auto font-sans text-slate-300">
      {/* View Header */}
      <div className="flex items-center gap-3.5">
        <img src="/logo-plaza-1.jpg" alt="Logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" onError={(e) => {
          e.currentTarget.style.display = 'none';
        }} />
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Configuración de Ticket</h1>
        </div>
      </div>

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-sm flex items-center gap-2.5 animate-fade-in">
          <Check size={18} />
          <span>Configuración guardada en la nube con éxito. Se sincronizará al instante en los dispositivos móviles.</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Configuration Form */}
        <form onSubmit={handleSave} className="bg-slate-800/60 border border-slate-700/50 rounded-3xl p-6 shadow-xl lg:col-span-7 space-y-6">
          <h3 className="text-md font-bold text-white flex items-center gap-2 pb-4 border-b border-slate-700/40">
            <Sliders size={18} className="text-blue-400" />
            Parámetros del Boleto
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Texto de Cabecera (Nombre del Estacionamiento / Razón Social)
              </label>
              <input
                type="text"
                required
                value={config.headerText}
                onChange={(e) => setConfig({ ...config, headerText: e.target.value })}
                placeholder="ej. PLAZA DEL RÍO - PARKING"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Términos y Condiciones (Texto del pie del ticket)
              </label>
              <textarea
                required
                value={config.termsText}
                onChange={(e) => setConfig({ ...config, termsText: e.target.value })}
                placeholder="Escribe las cláusulas o responsabilidades para el usuario..."
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none h-32 resize-none leading-relaxed"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-700/40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">Visibilidad de Elementos</h4>
            
            {/* Show Logo Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800 rounded-2xl">
              <div>
                <span className="block text-xs font-bold text-white">Imprimir Logotipo Corporativo</span>
                <span className="text-[10px] text-slate-500">Muestra el logo de Plaza del Río en la parte superior del boleto.</span>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, showLogo: !config.showLogo })}
                className="text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                {config.showLogo ? (
                  <ToggleRight size={38} className="text-blue-500" />
                ) : (
                  <ToggleLeft size={38} className="text-slate-600" />
                )}
              </button>
            </div>

            {/* Show Terms Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800 rounded-2xl">
              <div>
                <span className="block text-xs font-bold text-white">Imprimir Cláusulas y Términos</span>
                <span className="text-[10px] text-slate-500">Incluye las políticas de pérdida o siniestros impresas en papel térmico.</span>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, showTerms: !config.showTerms })}
                className="text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                {config.showTerms ? (
                  <ToggleRight size={38} className="text-blue-500" />
                ) : (
                  <ToggleLeft size={38} className="text-slate-600" />
                )}
              </button>
            </div>

            {/* Exit Show Folio Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800 rounded-2xl">
              <div>
                <span className="block text-xs font-bold text-white">Mostrar Folio en Ticket de Salida</span>
                <span className="text-[10px] text-slate-500">Imprime el folio correlativo al terminar y liquidar el cobro.</span>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, exitShowFolio: !config.exitShowFolio })}
                className="text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                {config.exitShowFolio ? (
                  <ToggleRight size={38} className="text-blue-500" />
                ) : (
                  <ToggleLeft size={38} className="text-slate-600" />
                )}
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/10 active:scale-95"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Guardando en la Nube...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Guardar Cambios
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Ticket Mockup Preview */}
        <div className="lg:col-span-5 space-y-4">
          <span className="block text-xs font-bold tracking-widest text-slate-500 uppercase">
            Vista Previa del Ticket Impreso
          </span>
          
          {/* Paper Ticket Mockup */}
          <div className="bg-white text-slate-950 p-6 shadow-2xl rounded-2xl border-t-8 border-dashed border-slate-300 font-mono text-xs space-y-4 relative overflow-hidden">
            {/* Ticket Tear dashes bottom effect */}
            <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-t from-slate-200/50 to-transparent border-b-4 border-dashed border-slate-400" />

            {/* Corporate Header */}
            <div className="text-center space-y-1 pb-4 border-b border-dashed border-slate-300">
              {config.showLogo && (
                <div className="mx-auto w-10 h-10 border-2 border-slate-950 rounded-full flex items-center justify-center font-bold text-lg mb-2">
                  PR
                </div>
              )}
              <span className="font-extrabold text-sm block uppercase tracking-wider">{config.headerText || 'PLAZA DEL RÍO'}</span>
              <span className="text-[9px] text-slate-600 block">SISTEMA DE ESTACIONAMIENTO</span>
            </div>

            {/* Ticket body mock data */}
            <div className="space-y-1.5 text-[10px] pb-4 border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span>FOLIO TICKET:</span>
                <span className="font-bold">PR-1024</span>
              </div>
              <div className="flex justify-between">
                <span>PLACA:</span>
                <span className="font-bold bg-slate-100 px-1 py-0.5 rounded border border-slate-300">GWM-7762</span>
              </div>
              <div className="flex justify-between">
                <span>CATEGORÍA:</span>
                <span className="font-bold">Auto (Normal)</span>
              </div>
              <div className="flex justify-between">
                <span>FECHA ENTRADA:</span>
                <span>11/07/2026 15:42</span>
              </div>
              <div className="flex justify-between">
                <span>OPERADOR ENTRADA:</span>
                <span>cajero1</span>
              </div>
            </div>

            {/* Barcode Mockup */}
            <div className="py-2 flex flex-col items-center justify-center gap-1">
              <div className="h-8 bg-slate-950 w-3/4 flex items-center justify-around">
                {/* Visual barcode white gaps */}
                <div className="w-1 bg-white h-full" />
                <div className="w-2 bg-white h-full" />
                <div className="w-0.5 bg-white h-full" />
                <div className="w-1.5 bg-white h-full" />
                <div className="w-1 bg-white h-full" />
                <div className="w-2.5 bg-white h-full" />
                <div className="w-1 bg-white h-full" />
              </div>
              <span className="text-[8px] tracking-[3px] text-slate-600 font-semibold font-mono">*PR-1024*</span>
            </div>

            {/* Ticket Footer (clausules/terms) */}
            {config.showTerms && (
              <div className="text-center pt-2 border-t border-dashed border-slate-300 text-[8px] text-slate-500 leading-normal">
                <span className="font-bold block text-slate-800 mb-1">IMPORTANTE</span>
                <p className="px-2 text-justify uppercase">{config.termsText || 'Conserve este boleto.'}</p>
              </div>
            )}
            
            <p className="text-center text-[7px] text-slate-400 pt-4 pb-2">
              ¡GRACIAS POR SU PREFERENCIA!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
