'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CreditCard, Save, Shield, Clock, Store, Smartphone, MapPin, CheckCircle2, Navigation, Target, Map, Truck, FileText, Upload, ExternalLink, Eye, Trash2, RefreshCw } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_LABELS, type PaymentMethod } from '@/types';
import { BotChannelsSection } from '@/components/settings/BotChannelsSection';
import { TeamManagementSection } from '@/components/settings/TeamManagementSection';
import { ImageInputPicker } from '@/components/ImageInputPicker';



function LocationPickerMap({
  lat,
  lng,
  onLocationChange,
}: {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    let active = true;

    import('leaflet').then((L) => {
      if (!active || !mapRef.current) return;
      if ((mapRef.current as any)._leaflet_id) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        className: 'dark-mode-map',
        maxZoom: 19,
      }).addTo(map);

      const restaurantIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:linear-gradient(135deg,#f97316,#ea580c);
          border:3px solid #fff;
          box-shadow:0 4px 12px rgba(249,115,22,0.5);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;cursor:pointer;
        ">🍽️</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker([lat, lng], { icon: restaurantIcon, draggable: true }).addTo(map);
      marker.bindPopup('<strong>📍 Ubicación del Restaurante</strong><br>Arrastra el marcador para ajustar.').openPopup();

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onLocationChange(parseFloat(pos.lat.toFixed(6)), parseFloat(pos.lng.toFixed(6)));
      });

      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        onLocationChange(parseFloat(e.latlng.lat.toFixed(6)), parseFloat(e.latlng.lng.toFixed(6)));
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
    });

    return () => {
      active = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (markerRef.current && mapInstanceRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom());
    }
  }, [lat, lng]);

  return <div ref={mapRef} style={{ height: '320px', width: '100%', borderRadius: '24px', zIndex: 1 }} />;
}

const AVAILABLE_MODULES = [
  { id: '/', label: 'Dashboard General', icon: '📊' },
  { id: '/pedidos', label: 'Pedidos (Kanban / Lista)', icon: '🛍️' },
  { id: '/historial', label: 'Historial de Pedidos', icon: '📜' },
  { id: '/menu', label: 'Menú & Productos', icon: '🍽️' },
  { id: '/inventario', label: 'Inventario & Stock', icon: '📦' },
  { id: '/caja', label: 'Caja POS & Cuadre', icon: '💵' },
  { id: '/pagos', label: 'Registro de Pagos', icon: '💳' },
  { id: '/clientes', label: 'Clientes & CRM', icon: '👥' },
  { id: '/domicilios', label: 'Domicilios & Asignación', icon: '🛵' },
  { id: '/repartidores', label: 'Repartidores', icon: '🛵' },
  { id: '/mensajes', label: 'Mensajes & Chat', icon: '💬' },
  { id: '/ia', label: 'IA & Automatizaciones', icon: '🤖' },
  { id: '/reportes', label: 'Reportes & Analítica', icon: '📈' },
  { id: '/configuracion', label: 'Configuración', icon: '⚙️' },
];

export default function ConfiguracionPage() {
  const { settings, updateSettings, activeTenantId, selectedTenantId } = useAppData();
  const [saved, setSaved] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  const [mapLat, setMapLat] = useState(settings.restaurant_lat ?? 4.7110);
  const [mapLng, setMapLng] = useState(settings.restaurant_lng ?? -74.0721);

  const [menuPdfUrl, setMenuPdfUrl] = useState(settings.menu_pdf_url || '');
  const [showInlinePdf, setShowInlinePdf] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfUploadSuccess, setPdfUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings.menu_pdf_url !== undefined) {
      setMenuPdfUrl(settings.menu_pdf_url || '');
    }
  }, [settings.menu_pdf_url]);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor selecciona un archivo PDF válido (.pdf)');
      return;
    }

    setUploadingPdf(true);
    setPdfUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'menu-pdfs');

      const res = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || 'Error al subir el archivo');
      }

      if (resData.url) {
        setMenuPdfUrl(resData.url);
        await updateSettings({ menu_pdf_url: resData.url });
        setPdfUploadSuccess(true);
        setTimeout(() => setPdfUploadSuccess(false), 6000);
      } else {
        throw new Error('No se recibió la URL pública del archivo');
      }
    } catch (err: any) {
      console.error('Error subiendo PDF:', err);
      alert('No se pudo subir el archivo PDF: ' + (err.message || 'Error desconocido'));
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSavePdfUrl = async () => {
    try {
      await updateSettings({ menu_pdf_url: menuPdfUrl.trim() });
      setPdfUploadSuccess(true);
      setTimeout(() => setPdfUploadSuccess(false), 5000);
    } catch (err: any) {
      alert('Error guardando enlace del PDF: ' + (err.message || 'Error desconocido'));
    }
  };

  const handleRemovePdf = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar la carta en PDF? Los bots ya no enviarán este archivo a los clientes.')) {
      return;
    }
    setMenuPdfUrl('');
    setShowInlinePdf(false);
    try {
      await updateSettings({ menu_pdf_url: '' });
    } catch (err) {
      console.error('Error al remover PDF:', err);
    }
  };

  // Team management state now handled inside <TeamManagementSection />

  useEffect(() => {
    if (settings.restaurant_lat) setMapLat(settings.restaurant_lat);
    if (settings.restaurant_lng) setMapLng(settings.restaurant_lng);
  }, [settings.restaurant_lat, settings.restaurant_lng]);

  useEffect(() => {
    if (document.getElementById('leaflet-css')) {
      setMapReady(true);
      return;
    }
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.onload = () => setMapReady(true);
    document.head.appendChild(link);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateSettings({
        restaurant_lat: mapLat,
        restaurant_lng: mapLng,
        menu_pdf_url: menuPdfUrl.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Error al guardar configuración:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const DEFAULT_BUSINESS_HOURS = [
    { day: 'Lunes', open: '08:00', close: '22:00', closed: false },
    { day: 'Martes', open: '08:00', close: '22:00', closed: false },
    { day: 'Miércoles', open: '08:00', close: '22:00', closed: false },
    { day: 'Jueves', open: '08:00', close: '22:00', closed: false },
    { day: 'Viernes', open: '08:00', close: '23:00', closed: false },
    { day: 'Sábado', open: '08:00', close: '23:00', closed: false },
    { day: 'Domingo', open: '09:00', close: '21:00', closed: false },
  ];

  const currentHours = (settings.business_hours && settings.business_hours.length > 0)
    ? settings.business_hours
    : DEFAULT_BUSINESS_HOURS;

  const togglePayment = (method: PaymentMethod) => {
    const methods = settings.payment_methods.includes(method)
      ? settings.payment_methods.filter((m) => m !== method)
      : [...settings.payment_methods, method];
    updateSettings({ payment_methods: methods });
  };

  const handleLocationChange = useCallback((lat: number, lng: number) => {
    setMapLat(lat);
    setMapLng(lng);
    updateSettings({ restaurant_lat: lat, restaurant_lng: lng });
  }, [updateSettings]);

  const handleGetMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización.');
      return;
    }
    setGeolocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        handleLocationChange(lat, lng);
        setGeolocating(false);
      },
      (err) => {
        setGeoError(`No se pudo obtener la ubicación.`);
        setGeolocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Ajustes del Sistema" subtitle="Personalización, integraciones, pagos y seguridad" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative">
        <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 max-w-7xl mx-auto pb-12">
          
          {/* General */}
          <div className="card p-6 rounded-3xl space-y-5 animate-fade-in-up border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <Store className="h-5 w-5 text-[var(--orange)]" /> Datos del Restaurante
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Nombre Comercial</label>
                <input defaultValue={settings.restaurant_name}
                  onChange={(e) => updateSettings({ restaurant_name: e.target.value })}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]" 
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <ImageInputPicker
                  label="Logo del Negocio / Restaurante"
                  value={settings.logo_url || ''}
                  onChange={(url) => updateSettings({ logo_url: url })}
                  placeholder="https://ejemplo.com/logo.png"
                  bucket="logos"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Tarifa Base Domicilio (COP)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-xs text-[var(--text-muted)]">$</span>
                  <input type="number" defaultValue={settings.delivery_fee}
                    onChange={(e) => updateSettings({ delivery_fee: Number(e.target.value) })}
                    className="w-full text-xs font-semibold pl-8 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]" 
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="card p-6 rounded-3xl space-y-5 animate-fade-in-up delay-75 border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <CreditCard className="h-5 w-5 text-emerald-500" /> Pasarelas y Métodos de Pago
            </p>
            <div className="flex flex-wrap gap-2.5">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                <button key={m} type="button" onClick={() => togglePayment(m)}
                  className="text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-2xl transition-all shadow-sm border cursor-pointer"
                  style={{
                    background: settings.payment_methods.includes(m) ? 'var(--orange)' : 'var(--bg-input)',
                    color: settings.payment_methods.includes(m) ? '#fff' : 'var(--text-muted)',
                    borderColor: settings.payment_methods.includes(m) ? 'var(--orange)' : 'var(--border)',
                  }}>
                  {settings.payment_methods.includes(m) ? '✓ ' : ''}{PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Cuentas de Pago Digital */}
          <div className="card p-6 rounded-3xl space-y-5 animate-fade-in-up delay-100 border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <CreditCard className="h-5 w-5 text-sky-500" /> Cuentas para Pago Digital (Nequi / Bancolombia)
            </p>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Estos números aparecerán en WhatsApp y Telegram cuando el cliente elija pagar por transferencia.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Número Nequi / Daviplata</label>
                <input type="text" placeholder="Ej: 300 123 4567"
                  defaultValue={settings.nequi_number || ''}
                  onChange={(e) => updateSettings({ nequi_number: e.target.value })}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Número Bancolombia</label>
                <input type="text" placeholder="Ej: 123-456789-00"
                  defaultValue={settings.bancolombia_number || ''}
                  onChange={(e) => updateSettings({ bancolombia_number: e.target.value })}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Tipo de Cuenta Bancolombia</label>
                <select
                  value={settings.bancolombia_type || 'Ahorros'}
                  onChange={(e) => updateSettings({ bancolombia_type: e.target.value })}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="Ahorros">Cuenta de Ahorros</option>
                  <option value="Corriente">Cuenta Corriente</option>
                </select>
              </div>
            </div>
          </div>

          {/* Carta / Menú en PDF para Clientes */}
          <div className="card p-6 rounded-3xl space-y-5 animate-fade-in-up delay-100 border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-orange-500/10 text-[var(--orange)] border border-orange-500/20 shadow-sm">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    Carta / Menú Digital en PDF
                    {menuPdfUrl ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Carta Cargada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Sin Carta Subida
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    El bot de WhatsApp y Telegram enviará este archivo automáticamente a los clientes.
                  </p>
                </div>
              </div>

              {menuPdfUrl && (
                <div className="flex items-center gap-2">
                  <a
                    href={menuPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-black flex items-center gap-1.5 px-4 py-2 rounded-xl border border-orange-500 bg-orange-500 text-white hover:bg-orange-600 transition-all shadow-md shadow-orange-500/20 cursor-pointer"
                    title="Abrir el PDF en una pestaña nueva"
                  >
                    <ExternalLink className="w-4 h-4" /> Abrir Carta PDF
                  </a>
                </div>
              )}
            </div>

            {/* Status Card when PDF is present */}
            {menuPdfUrl ? (
              <div className="p-4 sm:p-5 rounded-2xl border bg-[var(--bg-input)] space-y-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0 shadow-sm">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black truncate max-w-[280px] sm:max-w-md" style={{ color: 'var(--text-primary)' }}>
                          {menuPdfUrl.split('/').pop()?.split('?')[0] || 'carta_menu.pdf'}
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                          Listo para envío
                        </span>
                      </div>
                      <p className="text-[11px] truncate mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                        {menuPdfUrl}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <a
                      href={menuPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl border border-orange-500/30 bg-orange-500/10 text-[var(--orange)] hover:bg-orange-500/20 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Ver PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowInlinePdf(!showInlinePdf)}
                      className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                    >
                      <Eye className="w-3.5 h-3.5 text-[var(--orange)]" />
                      {showInlinePdf ? 'Ocultar Visor' : 'Ver aquí'}
                    </button>
                    <label className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      <RefreshCw className={`w-3.5 h-3.5 ${uploadingPdf ? 'animate-spin' : ''}`} />
                      {uploadingPdf ? 'Subiendo...' : 'Cambiar PDF'}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        disabled={uploadingPdf}
                        onChange={handlePdfUpload}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleRemovePdf}
                      className="px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                      title="Eliminar este archivo PDF"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline PDF Viewer */}
                {showInlinePdf && (
                  <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-[var(--orange)]" /> Previsualización interactiva de la Carta Digital:
                      </p>
                      <a
                        href={menuPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-[var(--orange)] hover:underline flex items-center gap-1"
                      >
                        Abrir pantalla completa <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="w-full h-[520px] rounded-2xl overflow-hidden border bg-black/40 shadow-inner" style={{ borderColor: 'var(--border)' }}>
                      <iframe
                        src={menuPdfUrl}
                        title="Carta del Restaurante"
                        className="w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* When no PDF is uploaded */
              <div className="p-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center space-y-3 transition-all" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-[var(--orange)] shadow-sm">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>
                    Aún no has subido tu carta en PDF
                  </p>
                  <p className="text-[11px] max-w-sm" style={{ color: 'var(--text-muted)' }}>
                    Sube el archivo PDF de tu carta para que los clientes puedan consultarla y descargarla al chatear con el bot de WhatsApp o Telegram.
                  </p>
                </div>
                <label className="flex items-center gap-2 px-6 py-3 rounded-2xl border border-orange-500 bg-orange-500 hover:bg-orange-600 text-xs font-black text-white cursor-pointer transition-all shadow-md shadow-orange-500/20">
                  <Upload className="w-4 h-4" />
                  {uploadingPdf ? 'Subiendo archivo a la nube...' : 'Seleccionar archivo PDF (.pdf)'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    disabled={uploadingPdf}
                    onChange={handlePdfUpload}
                  />
                </label>
              </div>
            )}

            {/* Success message */}
            {pdfUploadSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-between gap-2 animate-fade-in">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ¡Carta PDF subida y configurada exitosamente en el sistema!
                </span>
                {menuPdfUrl && (
                  <a
                    href={menuPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-emerald-300 hover:text-white font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    Abrir PDF <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Manual URL entry input */}
            <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
              <label className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                O configurar mediante enlace directo (URL pública)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://.../carta-restaurante.pdf"
                  value={menuPdfUrl}
                  onChange={(e) => setMenuPdfUrl(e.target.value)}
                  className="flex-1 text-xs font-semibold px-4 py-2.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={handleSavePdfUrl}
                  className="px-4 py-2.5 rounded-2xl border text-xs font-bold hover:bg-[var(--orange-soft)] text-[var(--orange)] border-orange-500/30 transition-all cursor-pointer shrink-0"
                >
                  Guardar Enlace
                </button>
              </div>
            </div>
          </div>

          {/* Bots & IA */}
          <BotChannelsSection tenantId={activeTenantId ?? ''} />

          {/* Configuración de Logística y Domicilios */}
          <div className="card p-6 rounded-3xl space-y-5 border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <Truck className="h-5 w-5 text-[var(--orange)]" /> Configuración de Domicilios y Repartidores
            </p>
            <div className="space-y-4">
              {/* Auto Assign */}
              <div className="flex items-center justify-between p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>Asignación Automática</p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Asignar automáticamente a repartidores disponibles cuando el pedido esté listo.
                  </p>
                </div>
                <div
                  onClick={() => updateSettings({ auto_assign_riders: !settings.auto_assign_riders })}
                  className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer border shrink-0 ${settings.auto_assign_riders ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-slate-500/20 border-slate-500/40'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform shadow-sm ${settings.auto_assign_riders ? 'left-[22px] bg-emerald-500' : 'left-0.5 bg-slate-400'}`} />
                </div>
              </div>

              {/* Allow External Riders */}
              <div className="flex items-center justify-between p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>Compartir Domiciliarios (Pool SaaS)</p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Permitir que repartidores de otros restaurantes tomen tus pedidos de la pool general.
                  </p>
                </div>
                <div
                  onClick={() => updateSettings({ allow_external_riders: !settings.allow_external_riders })}
                  className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer border shrink-0 ${settings.allow_external_riders ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-slate-500/20 border-slate-500/40'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform shadow-sm ${settings.allow_external_riders ? 'left-[22px] bg-emerald-500' : 'left-0.5 bg-slate-400'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Business Hours */}
          <div className="card p-6 rounded-3xl space-y-5 animate-fade-in-up delay-[125ms] xl:col-span-2 border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <Clock className="h-5 w-5 text-violet-500" /> Horario Comercial del Restaurante
            </p>
            <p className="text-xs font-medium -mt-2" style={{ color: 'var(--text-muted)' }}>
              Define los horarios en los que el bot de Telegram acepta pedidos. Fuera de este rango, el bot informará que el restaurante está cerrado.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {currentHours.map((h, index) => (
                <div
                  key={h.day}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${h.closed ? 'opacity-50' : ''}`}
                  style={{ background: 'var(--bg-input)', borderColor: h.closed ? 'var(--border)' : 'var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>{h.day}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        {h.closed ? 'Cerrado' : 'Abierto'}
                      </span>
                      <div
                        onClick={() => {
                          const updated = currentHours.map((x, idx) =>
                            idx === index ? { ...x, closed: !x.closed } : x
                          );
                          updateSettings({ business_hours: updated });
                        }}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer border ${h.closed ? 'bg-rose-500/20 border-rose-500/40' : 'bg-emerald-500/20 border-emerald-500/40'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform shadow-sm ${h.closed ? 'left-0.5 bg-rose-400' : 'left-[18px] bg-emerald-400'}`} />
                      </div>
                    </label>
                  </div>
                  {!h.closed && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Abre</label>
                        <input
                          type="time"
                          value={h.open}
                          onChange={(e) => {
                            const updated = currentHours.map((x, idx) =>
                              idx === index ? { ...x, open: e.target.value } : x
                            );
                            updateSettings({ business_hours: updated });
                          }}
                          className="w-full text-xs font-bold px-2 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>Cierra</label>
                        <input
                          type="time"
                          value={h.close}
                          onChange={(e) => {
                            const updated = currentHours.map((x, idx) =>
                              idx === index ? { ...x, close: e.target.value } : x
                            );
                            updateSettings({ business_hours: updated });
                          }}
                          className="w-full text-xs font-bold px-2 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Location Map */}
          <div className="card p-6 rounded-3xl xl:col-span-2 animate-fade-in-up delay-200 border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <div className="flex items-start justify-between border-b pb-4 mb-4" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Map className="h-5 w-5 text-[var(--orange)]" /> Ubicación del Restaurante
              </p>
              <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-orange-500/10 text-[var(--orange)] border border-orange-500/30">
                GPS Preciso
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>📌 Latitud</label>
                <input
                  type="number"
                  step="0.000001"
                  value={mapLat}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) handleLocationChange(v, mapLng);
                  }}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>📌 Longitud</label>
                <input
                  type="number"
                  step="0.000001"
                  value={mapLng}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) handleLocationChange(mapLat, v);
                  }}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={handleGetMyLocation}
                  disabled={geolocating}
                  className="px-4 py-3 rounded-2xl text-xs font-black text-white shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--orange)' }}
                >
                  <Target className="w-4 h-4" />
                  <span>Obtener Mi Ubicación</span>
                </button>
              </div>
            </div>

            {mapReady && (
              <LocationPickerMap lat={mapLat} lng={mapLng} onLocationChange={handleLocationChange} />
            )}
          </div>

          {/* Gestión de Equipo de Trabajo & Permisos Modulares */}
          <TeamManagementSection />

          <div className="xl:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-8 py-4 rounded-2xl text-white font-black text-xs shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2 cursor-pointer"
              style={{ background: 'var(--orange)' }}
            >
              <Save className="w-4 h-4" />
              <span>{saved ? '✓ Guardado Correctamente' : 'Guardar Ajustes del Sistema'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


