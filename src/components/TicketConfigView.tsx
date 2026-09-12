import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { TicketConfig } from '../types';
import { useAppLogo } from '../lib/appConfig';
import { 
  Printer, 
  Save, 
  Check, 
  AlertTriangle, 
  Loader2, 
  Sliders, 
  FileText,
  ToggleLeft,
  ToggleRight,
  Image as ImageIcon,
  RotateCcw,
  ExternalLink,
  Sparkles
} from 'lucide-react';

export default function TicketConfigView() {
  const { logoUrl: globalLogo, saveLogoUrl, defaultLogo } = useAppLogo();
  const [config, setConfig] = useState<TicketConfig>({
    headerText: 'PLAZA DEL RÍO - PARKING',
    termsText: 'Conserve este boleto. No nos hacemos responsables por daños o robos parciales.',
    showLogo: true,
    showTerms: true,
    exitShowFolio: true,
    logoUrl: ''
  });
  const [logoInput, setLogoInput] = useState<string>('');
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen to config in real-time
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(doc(db, 'ticket_config', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as TicketConfig;
        setConfig(data);
        if (data.logoUrl !== undefined) {
          setLogoInput(data.logoUrl || '');
        }
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
      const updatedConfig: TicketConfig = {
        ...config,
        logoUrl: logoInput.trim()
      };
      await setDoc(doc(db, 'ticket_config', 'config'), updatedConfig, { merge: true });
      await saveLogoUrl(logoInput.trim());
      setConfig(updatedConfig);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar configuración remota: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetLogo = () => {
    setLogoInput('');
    setLogoPreviewError(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 size={40} className="animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-medium">Sincronizando configuración con Firestore...</p>
      </div>
    );
  }

  const effectiveLogoPreview = logoInput.trim() || defaultLogo;

  return (
    <div className="space-y-6 p-1.5 md:p-3 max-w-5xl mx-auto font-sans text-slate-300">
      {/* View Header */}
      <div className="flex items-center gap-3.5">
        <img 
          src={globalLogo || defaultLogo} 
          alt="Logo" 
          className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" 
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = defaultLogo;
          }} 
        />
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Configuración y Logotipo</h1>
          <p className="text-xs md:text-sm text-slate-400">
            Personaliza el logotipo de la aplicación, datos corporativos y formato de tickets impresos.
          </p>
        </div>
      </div>

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-sm flex items-center gap-2.5 animate-fade-in shadow-lg">
          <Check size={18} className="shrink-0" />
          <span>¡Configuración y logotipo guardados con éxito! Se aplicaron a toda la app web y se sincronizarán en tus terminales y celulares.</span>
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
        <form onSubmit={handleSave} className="bg-slate-800/60 border border-slate-700/50 rounded-3xl p-5 md:p-7 shadow-xl lg:col-span-7 space-y-6">
          
          {/* SECTION 1: LOGOTIPO GLOBAL */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-700/40">
              <ImageIcon size={18} className="text-blue-400" />
              Logotipo Oficial del Sistema
            </h3>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Ingresa la URL de la imagen de tu logotipo (PNG, JPG, SVG o WebP). Esta imagen se utilizará en toda la plataforma: barra lateral, inicio de sesión, cabeceras, cortes de turno, reportes PDF y tickets de cobro.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                URL del Logotipo (Enlace público de imagen)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={logoInput}
                  onChange={(e) => {
                    setLogoInput(e.target.value);
                    setLogoPreviewError(false);
                  }}
                  placeholder="https://ejemplo.com/mi-logotipo.png"
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
                {logoInput && (
                  <button
                    type="button"
                    onClick={handleResetLogo}
                    title="Restablecer logo por defecto"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span className="hidden sm:inline">Por Defecto</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live Logo Preview Box */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                {logoPreviewError ? (
                  <div className="text-center p-1 text-red-400 text-[10px]">
                    <AlertTriangle size={16} className="mx-auto mb-1" />
                    Error URL
                  </div>
                ) : (
                  <img
                    src={effectiveLogoPreview}
                    alt="Vista previa logo"
                    className="w-full h-full object-contain p-1"
                    referrerPolicy="no-referrer"
                    onError={() => setLogoPreviewError(true)}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">Vista Previa del Logotipo</span>
                  {logoInput.trim() ? (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium border border-blue-500/30">
                      Personalizado
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium border border-slate-700">
                      Predeterminado
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 truncate">
                  {logoInput.trim() ? logoInput : 'Utilizando logotipo base de Plaza del Río'}
                </p>
                {logoPreviewError && (
                  <span className="text-[10px] text-red-400 font-semibold block mt-1">
                    No se pudo cargar la imagen desde este enlace. Verifica que sea una URL directa y accesible.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: PARÁMETROS DEL BOLETO */}
          <div className="space-y-4 pt-4 border-t border-slate-700/40">
            <h3 className="text-base font-bold text-white flex items-center gap-2 pb-2">
              <Sliders size={18} className="text-blue-400" />
              Parámetros del Boleto y Razón Social
            </h3>

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
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition-colors h-28 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* SECTION 3: VISIBILIDAD */}
          <div className="space-y-3 pt-4 border-t border-slate-700/40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">Visibilidad de Elementos en Ticket</h4>
            
            {/* Show Logo Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800 rounded-2xl">
              <div>
                <span className="block text-xs font-bold text-white">Imprimir Logotipo Corporativo</span>
                <span className="text-[10px] text-slate-400">Muestra el logotipo configurado en la parte superior del boleto.</span>
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
                <span className="text-[10px] text-slate-400">Incluye las políticas de pérdida o siniestros impresas en papel térmico.</span>
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
                <span className="text-[10px] text-slate-400">Imprime el folio correlativo al terminar y liquidar el cobro.</span>
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
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20 active:scale-95"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando en la Nube...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Guardar Logotipo y Configuración
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Ticket Mockup Preview */}
        <div className="lg:col-span-5 space-y-4">
          <span className="block text-xs font-bold tracking-widest text-slate-400 uppercase">
            Vista Previa del Ticket Impreso
          </span>
          
          {/* Paper Ticket Mockup */}
          <div className="bg-white text-slate-950 p-6 shadow-2xl rounded-2xl border-t-8 border-dashed border-slate-300 font-mono text-xs space-y-4 relative overflow-hidden">
            {/* Ticket Tear dashes bottom effect */}
            <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-t from-slate-200/50 to-transparent border-b-4 border-dashed border-slate-400" />

            {/* Corporate Header */}
            <div className="text-center space-y-1 pb-4 border-b border-dashed border-slate-300">
              {config.showLogo && (
                <div className="mx-auto w-14 h-14 mb-2 flex items-center justify-center">
                  <img
                    src={effectiveLogoPreview}
                    alt="Logo Ticket"
                    className="max-h-full max-w-full object-contain filter grayscale contrast-125"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
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
                <span>OPERADOR:</span>
                <span>cajero1</span>
              </div>
            </div>

            {/* Barcode Mockup */}
            <div className="py-2 flex flex-col items-center justify-center gap-1">
              <div className="h-8 bg-slate-950 w-3/4 flex items-center justify-around">
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
