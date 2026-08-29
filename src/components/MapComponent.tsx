'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';

interface MapComponentProps {
  riderCoords: [number, number];
  deliveryAddress: string;
  restaurantCoords?: [number, number];
  className?: string;
  isPublic?: boolean;
}

export default function MapComponent({
  riderCoords,
  deliveryAddress,
  restaurantCoords,
  className,
  isPublic
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const riderMarkerRef = useRef<Marker | null>(null);
  const clientMarkerRef = useRef<Marker | null>(null);
  const restaurantMarkerRef = useRef<Marker | null>(null);

  const restCoords: [number, number] = restaurantCoords || [3.2311, -76.4167];

  // 1. Inicialización del mapa una sola vez
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      const map = L.map(mapContainerRef.current).setView(restCoords, 14);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'dark-mode-map',
        maxZoom: 19,
      }).addTo(map);

      // Sede Principal Restaurant Marker
      const restMarker = L.marker(restCoords)
        .addTo(map)
        .bindPopup('<b>Sede Principal Restaurante</b><br/>Despacho Central')
        .openPopup();
      restaurantMarkerRef.current = restMarker;

      // Rider Icon & Marker
      const riderIcon = L.divIcon({
        className: 'custom-rider-icon',
        html: `<div class="relative flex items-center justify-center">
          <span class="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-violet-400 opacity-75"></span>
          <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 border border-white text-white shadow-lg text-[10px] font-bold">Repartidor</div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const riderMarker = L.marker(riderCoords, { icon: riderIcon }).addTo(map);
      riderMarkerRef.current = riderMarker;
      riderMarker.bindPopup(`<b>Repartidor en Camino</b>`);

      // Client Icon & Marker
      const clientIcon = L.divIcon({
        className: 'custom-client-icon',
        html: `<div class="relative flex items-center justify-center">
          <span class="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 border border-white text-white shadow-lg text-[10px] font-bold">Cliente</div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const clientMarker = L.marker(restCoords, { icon: clientIcon }).addTo(map);
      clientMarkerRef.current = clientMarker;
      clientMarker.bindPopup(`<b>Dirección de entrega</b><br/>${deliveryAddress}`);
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        riderMarkerRef.current = null;
        clientMarkerRef.current = null;
        restaurantMarkerRef.current = null;
      }
    };
  }, []);

  // 2. Reactividad para coordenadas del restaurante (por si cambian en settings)
  useEffect(() => {
    if (restaurantMarkerRef.current) {
      restaurantMarkerRef.current.setLatLng(restCoords);
    }
  }, [restCoords]);

  // 3. Reactividad para posición del repartidor en tiempo real
  useEffect(() => {
    if (!mapInstanceRef.current || !riderMarkerRef.current) return;
    riderMarkerRef.current.setLatLng(riderCoords);
    
    if (clientMarkerRef.current) {
      const clientLatLng = clientMarkerRef.current.getLatLng();
      if (clientLatLng.lat !== restCoords[0] || clientLatLng.lng !== restCoords[1]) {
        import('leaflet').then((L) => {
          if (!mapInstanceRef.current) return;
          const bounds = L.latLngBounds([riderCoords, [clientLatLng.lat, clientLatLng.lng]]);
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
        });
        return;
      }
    }
    mapInstanceRef.current.panTo(riderCoords);
  }, [riderCoords, restCoords]);

  // 4. Reactividad para geocodificación de dirección del cliente
  useEffect(() => {
    if (!mapInstanceRef.current || !clientMarkerRef.current || !deliveryAddress) return;

    if (deliveryAddress.includes('Para Recoger')) {
      clientMarkerRef.current.setLatLng(restCoords);
      clientMarkerRef.current.bindPopup(`<b>Dirección de entrega</b><br/>${deliveryAddress}`);
      return;
    }

    const query = encodeURIComponent(deliveryAddress);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
      headers: {
        'User-Agent': 'ChefFlow-Restaurant-App/1.0'
      }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data[0]) {
          const latVal = parseFloat(data[0].lat);
          const lonVal = parseFloat(data[0].lon);
          const clientCoords: [number, number] = [latVal, lonVal];
          
          if (clientMarkerRef.current) {
            clientMarkerRef.current.setLatLng(clientCoords);
            clientMarkerRef.current.bindPopup(`<b>Dirección de entrega</b><br/>${deliveryAddress}`);
          }

          import('leaflet').then((L) => {
            if (!mapInstanceRef.current) return;
            const bounds = L.latLngBounds([riderCoords, clientCoords]);
            mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
          });
        }
      })
      .catch((err) => {
        console.warn('Geocoding client address failed:', err);
      });
  }, [deliveryAddress, riderCoords, restCoords]);

  return (
    <div className={className || `relative w-full h-full min-h-[350px] rounded-xl overflow-hidden border shadow-inner`} style={!className ? { borderColor: 'var(--border)' } : {}}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
        integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
        crossOrigin=""
      />
      <div ref={mapContainerRef} className="w-full h-full min-h-[350px]" />
    </div>
  );
}
