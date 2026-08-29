'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';

interface DeliveryPoint {
  orderId: string;
  address: string;
  customerName: string;
  isActive: boolean;
}

interface MapMultiDeliveryProps {
  riderCoords: [number, number];
  restaurantCoords: [number, number];
  deliveries: DeliveryPoint[];
}

export default function MapMultiDelivery({
  riderCoords,
  restaurantCoords,
  deliveries,
}: MapMultiDeliveryProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const riderMarkerRef = useRef<Marker | null>(null);
  const deliveryMarkersRef = useRef<Map<string, Marker>>(new Map());
  const routeLayerRef = useRef<any>(null); // For the OSRM route polyline

  // 1. Init map once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      const map = L.map(mapContainerRef.current).setView(restaurantCoords, 14);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'dark-mode-map',
        maxZoom: 19,
      }).addTo(map);

      // Restaurant marker
      const restIcon = L.divIcon({
        className: '',
        html: `<div class="relative flex items-center justify-center">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 border-2 border-white text-white shadow-lg text-base">🏪</div>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker(restaurantCoords, { icon: restIcon }).addTo(map).bindPopup('<b>Restaurante</b>');

      // Rider marker
      const riderIcon = L.divIcon({
        className: '',
        html: `<div class="relative flex items-center justify-center">
          <span class="absolute inline-flex h-7 w-7 animate-ping rounded-full bg-violet-400 opacity-75"></span>
          <div class="relative flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 border-2 border-white text-white shadow-lg text-base">🛵</div>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const riderMarker = L.marker(riderCoords, { icon: riderIcon }).addTo(map);
      riderMarker.bindPopup('<b>Tú (Repartidor)</b>');
      riderMarkerRef.current = riderMarker;
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        riderMarkerRef.current = null;
        deliveryMarkersRef.current.clear();
      }
    };
  }, []);

  // 2. Update rider position reactively
  useEffect(() => {
    riderMarkerRef.current?.setLatLng(riderCoords);
    mapInstanceRef.current?.panTo(riderCoords, { animate: true });
  }, [riderCoords]);

  // 3. Geocode and add/update delivery markers when deliveries change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    import('leaflet').then((L) => {
      if (!mapInstanceRef.current) return;
      const map = mapInstanceRef.current;

      deliveries.forEach((d) => {
        if (d.address.includes('Para Recoger')) return;

        const geocode = async () => {
          const query = encodeURIComponent(d.address);
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
              { headers: { 'User-Agent': 'ChefFlow-App/1.0' } }
            );
            const data = await res.json();
            if (!data || !data[0]) return;
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            const coords: [number, number] = [lat, lon];

            if (deliveryMarkersRef.current.has(d.orderId)) {
              deliveryMarkersRef.current.get(d.orderId)!.setLatLng(coords);
            } else {
              const color = d.isActive ? '#10b981' : '#64748b';
              const icon = L.divIcon({
                className: '',
                html: `<div class="relative flex items-center justify-center">
                  ${d.isActive ? '<span class="absolute inline-flex h-7 w-7 animate-ping rounded-full opacity-60" style="background:' + color + '"></span>' : ''}
                  <div class="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-white shadow-lg text-base" style="background:${color}">📦</div>
                </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 36],
              });
              const marker = L.marker(coords, { icon }).addTo(map);
              marker.bindPopup(`<b>${d.customerName}</b><br/>${d.address}`);
              if (d.isActive) {
                marker.openPopup();
                
                // Draw OSRM Route to active delivery
                if (riderCoords[0] && riderCoords[1]) {
                  const drawRoute = async () => {
                    try {
                      // OSRM coordinates format: lon,lat
                      const startLon = riderCoords[1];
                      const startLat = riderCoords[0];
                      const endLon = lon;
                      const endLat = lat;
                      
                      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
                      const routeRes = await fetch(osrmUrl);
                      const routeData = await routeRes.json();
                      
                      if (routeData.routes && routeData.routes.length > 0) {
                        const coords = routeData.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
                        
                        if (routeLayerRef.current) {
                          routeLayerRef.current.remove();
                        }
                        
                        routeLayerRef.current = L.polyline(coords, { 
                          color: '#3b82f6', 
                          weight: 5, 
                          opacity: 0.8, 
                          dashArray: '10, 10',
                          lineCap: 'round'
                        }).addTo(map);
                        
                        // Opcional: auto-ajustar la vista para mostrar la ruta entera
                        // map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
                      }
                    } catch (routeErr) {
                      console.warn('Could not fetch OSRM route:', routeErr);
                    }
                  };
                  drawRoute();
                }
              }
              deliveryMarkersRef.current.set(d.orderId, marker);
            }
          } catch (err) {
            console.warn('Geocoding failed for:', d.address, err);
          }
        };
        geocode();
      });
    });
  }, [deliveries]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
        integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
        crossOrigin=""
      />
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}
