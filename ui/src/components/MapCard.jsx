import React, { useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  CircleMarker
} from "react-leaflet";
import L from "leaflet";

// Fix marker icons in Vite
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

function validLatLon(lat, lon) {
  if (lat === null || lon === null || lat === undefined || lon === undefined) return false;
  const la = Number(lat), lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

export default function MapCard({ title, receivedPoints, orbitTrack, orbitCurrent }) {
  // Received points (from telemetry) — show only as dots, not as polyline
  const rx = useMemo(() => {
    const cleaned = (receivedPoints ?? [])
      .filter(p => validLatLon(p.lat, p.lon))
      .map(p => ({ ...p, lat: Number(p.lat), lon: Number(p.lon) }));

    // sampling for performance
    const max = 300;
    if (cleaned.length <= max) return cleaned;
    const step = Math.ceil(cleaned.length / max);
    return cleaned.filter((_, i) => i % step === 0);
  }, [receivedPoints]);

  // Orbit track (predicted) — smooth polyline
  const orbit = useMemo(() => {
    return (orbitTrack ?? [])
      .filter(p => validLatLon(p.lat, p.lon))
      .map(p => [Number(p.lat), Number(p.lon)]);
  }, [orbitTrack]);

  const current = useMemo(() => {
    if (!orbitCurrent) return null;
    if (!validLatLon(orbitCurrent.lat, orbitCurrent.lon)) return null;
    return { lat: Number(orbitCurrent.lat), lon: Number(orbitCurrent.lon), ts_utc: orbitCurrent.ts_utc };
  }, [orbitCurrent]);

  const center = current ? [current.lat, current.lon] : (orbit.length ? orbit[Math.floor(orbit.length / 2)] : [0, 0]);
  const zoom = current ? 3 : 2;

  return (
    <div className="card" style={{ height: 480 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: "6px 0 10px" }}>{title}</h3>
        <div className="small">
          orbit: {orbitTrack?.length ?? 0} pts • received: {rx.length} pts
        </div>
      </div>

      <div style={{ width: "100%", height: 410, borderRadius: 12, overflow: "hidden" }}>
        <MapContainer center={center} zoom={zoom} style={{ width: "100%", height: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Predicted orbit ground track */}
          {orbit.length >= 2 && <Polyline positions={orbit} />}

          {/* Received points (telemetry) as dots */}
          {rx.map((p, idx) => (
            <CircleMarker
              key={`${p.ts_utc}-${idx}`}
              center={[p.lat, p.lon]}
              radius={3}
              pathOptions={{ weight: 1 }}
            >
              <Popup>
                <div style={{ fontFamily: "system-ui" }}>
                  <div><b>Received</b></div>
                  <div>{new Date(p.ts_utc).toLocaleString()}</div>
                  <div>Lat: {p.lat.toFixed(3)}, Lon: {p.lon.toFixed(3)}</div>
                  {p.temp_c != null && <div>Temp: {p.temp_c} °C</div>}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Current position marker (from orbit) */}
          {current && (
            <Marker position={[current.lat, current.lon]}>
              <Popup>
                <div style={{ fontFamily: "system-ui" }}>
                  <div><b>Current (orbit)</b></div>
                  <div>{new Date(current.ts_utc).toLocaleString()}</div>
                  <div>Lat: {current.lat.toFixed(3)}</div>
                  <div>Lon: {current.lon.toFixed(3)}</div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        ⚠️ “received” точки из TinyGS не соединяем линией — иначе получается паутина. Орбита рисуется по TLE.
      </div>
    </div>
  );
}