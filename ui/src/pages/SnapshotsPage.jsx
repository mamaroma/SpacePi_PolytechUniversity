import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Marker, Tooltip, AttributionControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GuideBanner, Hint } from "../components/Hint";

/* Манифест с реально выгруженными в бакет Yandex Cloud снимками. */
const MANIFEST_URL = "/snapshots-manifest.json";

const FOLDERS = ["Полярные фотографии", "Фотографии с КА"];

const FOLDER_META = {
  "Полярные фотографии": {
    color: "#c084fc",
    short: "Полярные",
    blurb: "Снимки арктических и антарктических районов (лёд, побережья, экспедиции). Точка = место съёмки.",
  },
  "Фотографии с КА": {
    color: "#fb923c",
    short: "С КА",
    blurb: "Кадры с бортовых камер спутников Polytech Universe / партнёров над сушей и океаном.",
  },
};

function cleanTitle(snap) {
  return snap.region || snap.title || "Снимок";
}

/** Компактный маркер-точка (фиксированный пиксельный размер — не «пятно» на карте). */
function makeSnapIcon(color, selected = false) {
  const size = selected ? 16 : 11;
  const core = selected ? 8 : 5;
  const ring = selected ? color : "#f1ead2";
  return L.divIcon({
    className: "snap-point-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<span class="snap-point" style="
      width:${core}px;height:${core}px;
      background:${color};
      box-shadow:0 0 0 1.5px ${ring}, 0 1px 3px rgba(0,0,0,.65);
    "></span>`,
  });
}

const ICON_CACHE = {};
function iconFor(folder, selected) {
  const key = `${folder}|${selected ? 1 : 0}`;
  if (!ICON_CACHE[key]) {
    ICON_CACHE[key] = makeSnapIcon(FOLDER_META[folder]?.color || "#9460b8", selected);
  }
  return ICON_CACHE[key];
}

function FlyToSelected({ snap }) {
  const map = useMap();
  useEffect(() => {
    if (!snap) return;
    try {
      map.flyTo([snap.lat, snap.lon], Math.max(map.getZoom(), 4), { duration: 0.55 });
    } catch {}
  }, [snap, map]);
  return null;
}

function PhotoCard({ snap, onClose }) {
  const [imgErr, setImgErr] = useState(false);
  const title = cleanTitle(snap);
  const meta = FOLDER_META[snap.folder] || {};
  return (
    <div className="snap-lightbox" onClick={onClose}>
      <div className="snap-lightbox-card" onClick={(e) => e.stopPropagation()}>
        <div className="snap-lightbox-media">
          {imgErr ? (
            <div className="snap-lightbox-fallback">
              <div className="snap-lightbox-fallback-title">Фото загружается</div>
              <div className="snap-lightbox-fallback-url">{snap.url}</div>
            </div>
          ) : (
            <img
              src={snap.url}
              alt={title}
              loading="eager"
              decoding="async"
              onError={() => setImgErr(true)}
            />
          )}
          <button type="button" className="snap-lightbox-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="snap-lightbox-body">
          <div className="snap-lightbox-folder" style={{ color: meta.color }}>
            {snap.folder}
          </div>
          <div className="snap-lightbox-title">{title}</div>
          <p className="snap-lightbox-blurb">{meta.blurb}</p>
          <div className="snap-lightbox-coords">
            {Number(snap.lat).toFixed(3)}° · {Number(snap.lon).toFixed(3)}°
            {snap.size ? ` · ${(snap.size / 1024 / 1024).toFixed(1)} МБ` : ""}
          </div>
          <a className="btn btn-sm" href={snap.url} target="_blank" rel="noreferrer">
            Открыть оригинал в Yandex Cloud
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SnapshotsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFolders, setActiveFolders] = useState(new Set(FOLDERS));
  const [selected, setSelected] = useState(null);
  const [regionFilter, setRegionFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => { if (alive) setItems(Array.isArray(j?.items) ? j.items : []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const folderCounts = useMemo(() => {
    const m = {};
    for (const s of items) m[s.folder] = (m[s.folder] || 0) + 1;
    return m;
  }, [items]);

  const regions = useMemo(() => {
    const m = new Map();
    for (const s of items) {
      if (!activeFolders.has(s.folder)) continue;
      const key = s.region || "Прочее";
      if (!m.has(key)) m.set(key, { name: key, count: 0, folder: s.folder, sample: s });
      const row = m.get(key);
      row.count += 1;
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
  }, [items, activeFolders]);

  const filtered = useMemo(() => {
    return items.filter((s) => {
      if (!activeFolders.has(s.folder)) return false;
      if (regionFilter !== "all" && (s.region || "Прочее") !== regionFilter) return false;
      return true;
    });
  }, [items, activeFolders, regionFilter]);

  const toggleFolder = (f) =>
    setActiveFolders((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  return (
    <div className="app-body">
      <GuideBanner id="snapshots-intro-v2">
        <strong>Зачем этот раздел.</strong> На карте — <em>места съёмки</em> фото из архива
        бортовых камер и полярных наблюдений. Каждая <b>точка</b> — один кадр
        (не зона покрытия). Клик открывает снимок из бакета Yandex Cloud.
        Раздел нужен, чтобы связать орбитальные данные с визуальным контекстом
        Земли: лёд, берега, пролёты КА.
      </GuideBanner>

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Снимки</h1>
          <p className="page-subtitle">
            Точки съёмки на карте · архив в Yandex Cloud ·{" "}
            {loading ? "загрузка…" : `${filtered.length} из ${items.length} кадров`}
          </p>
        </div>
      </div>

      <div className="snap-layout">
        <div className="snap-main">
          <div className="controls-card">
            <div className="ctrl-row" style={{ flexWrap: "wrap", gap: 10 }}>
              <span className="ctrl-label">Источники</span>
              <Hint text="Включите оба источника или один. Точки на карте — координаты кадров, не площади." />
              {FOLDERS.map((f) => {
                const meta = FOLDER_META[f];
                return (
                  <label key={f} className={`snap-folder-chip${activeFolders.has(f) ? " is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={activeFolders.has(f)}
                      onChange={() => toggleFolder(f)}
                      style={{ accentColor: meta.color }}
                    />
                    <span className="snap-folder-dot" style={{ background: meta.color }} />
                    <span>
                      <strong>{meta.short}</strong>
                      <em>{folderCounts[f] || 0}</em>
                    </span>
                  </label>
                );
              })}
              <div className="ctrl-spacer" />
              <span className="card-meta">{filtered.length} точек</span>
            </div>
            <div className="snap-folder-hints">
              {FOLDERS.map((f) => (
                <div key={f} className="snap-folder-hint">
                  <span style={{ color: FOLDER_META[f].color }}>●</span>
                  <span>{FOLDER_META[f].blurb}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="globe-card snap-map-card">
            <div className="card-header">
              <span className="card-title">Карта точек съёмки</span>
              <span className="card-meta">1 точка = 1 фото</span>
            </div>
            <div className="globe-inner snap-map-inner">
              <style>{`
                .leaflet-control-zoom a { background: #1b1530 !important; color: #f1ead2 !important; border-color: #8a5ab0 !important; }
                .leaflet-container { background: #0d0a18 !important; }
                .leaflet-control-attribution { background: rgba(19,14,34,.85) !important; color: #8aa090 !important; font-size: 10px !important; }
                .leaflet-control-attribution a { color: #f39768 !important; }
                .snap-point-icon { background: transparent !important; border: none !important; }
                .snap-point {
                  display: block;
                  border-radius: 50%;
                  margin: auto;
                }
              `}</style>
              <MapContainer
                center={[55, 40]}
                zoom={2}
                style={{ width: "100%", height: "100%" }}
                attributionControl={false}
              >
                <AttributionControl position="bottomright" prefix={false} />
                {/* Esri Dark Gray — без watermark «API KEY REQUIRED» у Carto */}
                <TileLayer
                  attribution='Tiles &copy; Esri'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={16}
                />
                <FlyToSelected snap={selected} />
                {filtered.map((s) => (
                  <Marker
                    key={s.id}
                    position={[s.lat, s.lon]}
                    icon={iconFor(s.folder, selected?.id === s.id)}
                    eventHandlers={{ click: () => setSelected(s) }}
                    zIndexOffset={selected?.id === s.id ? 500 : 0}
                  >
                    <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                      <span style={{ fontFamily: "system-ui", fontSize: 12 }}>
                        <strong>{cleanTitle(s)}</strong>
                        <br />
                        <span style={{ color: "#8aa090" }}>{FOLDER_META[s.folder]?.short || s.folder}</span>
                      </span>
                    </Tooltip>
                  </Marker>
                ))}
              </MapContainer>

              <div className="snap-map-legend">
                <span className="snap-map-legend-title">Точки</span>
                {FOLDERS.map((f) => (
                  <span key={f} className="snap-map-legend-item">
                    <i style={{ background: FOLDER_META[f].color }} />
                    {FOLDER_META[f].short}
                  </span>
                ))}
                <span className="snap-map-legend-hint">Клик по точке → снимок</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="snap-side">
          <div className="snap-side-card">
            <div className="snap-side-title">Что здесь</div>
            <p>
              Это не слой покрытия и не зоны ЭМИ. На карте лежат <b>координаты кадров</b>
              из фотоархива: куда смотрела камера / где был объект съёмки.
            </p>
            <p>
              Раздел помогает быстро найти визуальный пример к орбитальным задачам
              (лёд, суда, береговая линия) и открыть исходник в облаке.
            </p>
          </div>

          <div className="snap-side-card">
            <div className="snap-side-title">Как пользоваться</div>
            <ol className="snap-side-steps">
              <li>Выберите источник: полярные и/или с КА.</li>
              <li>Кликните <b>точку</b> на карте — откроется фото.</li>
              <li>Или выберите регион в списке ниже — карта подлетит к кадру.</li>
            </ol>
          </div>

          <div className="snap-side-card">
            <div className="snap-side-title-row">
              <div className="snap-side-title">Регионы</div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setRegionFilter("all")}
                disabled={regionFilter === "all"}
              >
                Все
              </button>
            </div>
            <div className="snap-region-list">
              {regions.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  className={`snap-region-item${regionFilter === r.name ? " is-on" : ""}`}
                  onClick={() => {
                    setRegionFilter(r.name);
                    setSelected(r.sample);
                  }}
                >
                  <span
                    className="snap-region-dot"
                    style={{ background: FOLDER_META[r.folder]?.color || "#9460b8" }}
                  />
                  <span className="snap-region-name">{r.name}</span>
                  <span className="snap-region-n">{r.count}</span>
                </button>
              ))}
              {!regions.length && (
                <div className="snap-region-empty">Нет точек для выбранных фильтров</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {selected && createPortal(
        <PhotoCard snap={selected} onClose={() => setSelected(null)} />,
        document.body
      )}
    </div>
  );
}
