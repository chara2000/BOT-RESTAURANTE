'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';

interface MapComponentProps {
  riderCoords: [number, number];
  deliveryAddress: string;
}

export default function MapComponent({ riderCoords, deliveryAddress }: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const riderMarkerRef = useRef<Marker | null>(null);
  const initialRiderCoordsRef = useRef(riderCoords);
  const initialDeliveryAddressRef = useRef(deliveryAddress);

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

      const map = L.map(mapContainerRef.current).setView(initialRiderCoordsRef.current, 14);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);

      L.marker([6.2088, -75.5678])
        .addTo(map)
        .bindPopup('<b>Sede Principal Restaurante</b><br/>Despacho Central')
        .openPopup();

      const riderIcon = L.divIcon({
        className: 'custom-rider-icon',
        html: `<div class="relative flex items-center justify-center">
          <span class="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-violet-400 opacity-75"></span>
          <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 border border-white text-white shadow-lg text-xs font-bold">Moto</div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      riderMarkerRef.current = L.marker(initialRiderCoordsRef.current, { icon: riderIcon })
        .addTo(map)
        .bindPopup(`<b>Repartidor en Camino</b><br/>Entregando a: ${initialDeliveryAddressRef.current}`);
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        riderMarkerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !riderMarkerRef.current) return;
    riderMarkerRef.current.setLatLng(riderCoords);
    riderMarkerRef.current.bindPopup(`<b>Repartidor en Camino</b><br/>Entregando a: ${deliveryAddress}`);
    mapInstanceRef.current.panTo(riderCoords);
  }, [riderCoords, deliveryAddress]);

  return (
    <div className="relative w-full h-full min-h-[350px] rounded-xl overflow-hidden border border-gray-800 shadow-inner">
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
