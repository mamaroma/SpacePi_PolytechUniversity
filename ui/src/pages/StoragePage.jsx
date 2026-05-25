import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "../AuthContext";
import {
  fetchStorageList,
  storageDownloadUrl,
  uploadStorageFile,
  deleteStorageFile,
  fetchTeleaisTelemetryList,
  teleaisTelemetryDownloadUrl,
  fetchTeleaisAisList,
  teleaisAisDownloadUrl,
} from "../api";
import { GuideBanner } from "../components/Hint";

const KIND_META = {
  ais: {
    label:  "AIS пакеты",
    desc:   "Сырые AIVDM-сообщения автоматической идентификационной системы кораблей.",
    accept: ".txt,.aivdm,.log",
  },
  telemetry: {
    label:  "Телеметрия",
    desc:   "Бинарные пакеты с борта спутников Polytech Universe (без демодуляции).",
    accept: ".bin,.dat,.tlm",
  },
  iq: {
    label:  "IQ-записи",
    desc:   "Сырые комплексные отсчёты с SDR (complex float32).",
    accept: ".iq,.cf32,.dat,.bin",
  },
  demo_emi: {
    label:  "демоЭМИ",
    desc:   "Демонстрационные точки ЭМ-обстановки для карты /emi. Используется только в учебных целях.",
    accept: ".json,.csv",
  },
};

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const SAT_ACCENT = {
  "PU-1": "#f39768",
  "PU-2": "#f39768",
  "PU-3": "#9460b8",
  "PU-4": "#6cc77b",
  "PU-5": "#56965b",
  "PU-6": "#5ad6ff",
};

/* ─── Архив телеметрии PU-1 ... PU-6 ─────────────────────────── */
function ArchiveTelemetrySection() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("PU-3");

  useEffect(() => {
    fetchTeleaisTelemetryList()
      .then((r) => setItems(r.items || []))
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  const active = useMemo(
    () => (items || []).find((it) => it.code === selected) || null,
    [items, selected]
  );

  return (
    <section className="card storage-section">
      <div className="card-header">
        <div>
          <span className="card-title">Архив телеметрии · PU-1 ... PU-6</span>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Полные CSV-выгрузки телеметрии каждого аппарата за весь срок миссии.
            Выберите спутник и скачайте файл.
          </div>
        </div>
        <span className="card-meta">{items ? `${items.length} аппаратов` : "…"}</span>
      </div>

      {error && (
        <div style={{ padding: 12, color: "var(--orange-2)", fontSize: 13 }}>
          Ошибка: {error}
        </div>
      )}

      {!items && !error && (
        <div style={{ padding: 24, color: "var(--text-muted)" }}>Загрузка…</div>
      )}

      {items && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            {items.map((it) => {
              const isSel = it.code === selected;
              const accent = SAT_ACCENT[it.code] || "#9460b8";
              return (
                <button
                  key={it.code}
                  onClick={() => setSelected(it.code)}
                  style={{
                    background: isSel
                      ? `linear-gradient(135deg, ${accent}33 0%, var(--surface-1) 85%)`
                      : "var(--surface-1)",
                    border: `1px solid ${isSel ? accent : "var(--border)"}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "var(--text)",
                    transition: "border-color 0.18s, transform 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: accent }}>
                    {it.code}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{it.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
                    {it.missing ? "файл отсутствует" : fmtBytes(it.size_bytes)}
                  </div>
                </button>
              );
            })}
          </div>

          {active && !active.missing && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                background: "var(--surface-2)",
                borderRadius: 10,
                border: `1px solid ${SAT_ACCENT[active.code] || "var(--border)"}55`,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
                  {active.filename}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                  {active.label} · {fmtBytes(active.size_bytes)}
                  {active.mtime_iso && (
                    <> · обновлено {new Date(active.mtime_iso).toLocaleString("ru")}</>
                  )}
                </div>
              </div>
              <a
                className="btn btn-success"
                href={teleaisTelemetryDownloadUrl(active.code)}
                download={active.filename}
              >
                ↓ Скачать CSV
              </a>
            </div>
          )}
          {active && active.missing && (
            <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 13 }}>
              Файл для {active.code} ещё не загружен на сервер.
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ─── Архив сырых AIS-сессий ─────────────────────────────────── */
function ArchiveAisSection() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [satFilter, setSatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");

  useEffect(() => {
    fetchTeleaisAisList()
      .then((r) => setItems(r.items || []))
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  const satOptions = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map((it) => it.satellite))).sort();
  }, [items]);

  const visible = useMemo(() => {
    let list = items || [];
    if (satFilter !== "all") list = list.filter((it) => it.satellite === satFilter);

    const cmpDate = (a, b) => {
      const da = `${a.session_date || "0"} ${a.filename}`;
      const db = `${b.session_date || "0"} ${b.filename}`;
      return da.localeCompare(db);
    };
    const sorters = {
      date_desc: (a, b) => -cmpDate(a, b),
      date_asc:  (a, b) =>  cmpDate(a, b),
      size_desc: (a, b) => b.size_bytes - a.size_bytes,
      size_asc:  (a, b) => a.size_bytes - b.size_bytes,
      sat_az:    (a, b) => a.satellite.localeCompare(b.satellite) || cmpDate(b, a),
    };
    return [...list].sort(sorters[sortBy] || sorters.date_desc);
  }, [items, satFilter, sortBy]);

  return (
    <section className="card storage-section">
      <div className="card-header">
        <div>
          <span className="card-title">Архив AIS-сессий со спутников</span>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Сырые CSV с декодированными NMEA-AIS пакетами по сеансам. Принято
            спутниками CSTP-2.1, CSTP-2.2 и PU-4 над акваторией Арктики.
          </div>
        </div>
        <span className="card-meta">{items ? `${items.length} файлов` : "…"}</span>
      </div>

      {error && (
        <div style={{ padding: 12, color: "var(--orange-2)", fontSize: 13 }}>
          Ошибка: {error}
        </div>
      )}

      {items && (
        <>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 12,
              alignItems: "center",
            }}
          >
            <span className="ctrl-label">Спутник</span>
            <select
              value={satFilter}
              onChange={(e) => setSatFilter(e.target.value)}
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 13,
              }}
            >
              <option value="all">Все ({items.length})</option>
              {satOptions.map((s) => (
                <option key={s} value={s}>
                  {s} ({items.filter((it) => it.satellite === s).length})
                </option>
              ))}
            </select>

            <span className="ctrl-label" style={{ marginLeft: 8 }}>Сортировка</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 13,
              }}
            >
              <option value="date_desc">Дата ↓ (новые)</option>
              <option value="date_asc">Дата ↑ (старые)</option>
              <option value="size_desc">Размер ↓</option>
              <option value="size_asc">Размер ↑</option>
              <option value="sat_az">По спутнику</option>
            </select>

            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
              Показано: {visible.length}
            </span>
          </div>

          <div className="table-wrap" style={{ maxHeight: 540, overflow: "auto" }}>
            <table>
              <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)" }}>
                <tr>
                  <th>Дата</th>
                  <th>Спутник</th>
                  <th>Сессия / файл</th>
                  <th>Размер</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => (
                  <tr key={it.path}>
                    <td style={{ color: "var(--text)", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                      {it.session_date || "—"}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "rgba(114,71,150,0.18)",
                          color: "var(--accent-2, #c2b5d4)",
                          border: "1px solid rgba(114,71,150,0.45)",
                          fontFamily: "'Space Mono', monospace",
                        }}
                      >
                        {it.satellite}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      <div style={{ color: "var(--text-dim)" }}>{it.session}</div>
                      <div style={{ color: "var(--text-muted)" }}>{it.filename}</div>
                    </td>
                    <td style={{ color: "var(--text-dim)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      {fmtBytes(it.size_bytes)}
                    </td>
                    <td>
                      <a
                        className="btn btn-sm"
                        href={teleaisAisDownloadUrl(it.path)}
                        download={it.filename}
                      >
                        Скачать
                      </a>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                      Файлов нет для выбранного фильтра.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function UnlockGate({ onUnlock }) {
  const [val, setVal] = useState(() => localStorage.getItem("polyspace.storage.key") || "");

  const submit = (e) => {
    e.preventDefault();
    const k = val.trim();
    if (!k) return;
    localStorage.setItem("polyspace.storage.key", k);
    onUnlock(k);
  };

  return (
    <div className="storage-unlock-wrap">
      <form onSubmit={submit} className="card storage-unlock-card">
        <h2 style={{ marginBottom: 6, color: "var(--orange)" }}>Хранилище заблокировано</h2>
        <p style={{ color: "var(--text-dim)", marginBottom: 16, fontSize: 14, lineHeight: 1.55 }}>
          Доступ к сырым пакетам AIS / Telemetry / IQ открыт только для модераторов
          и администратора. Если вы Reader — введите выданный администратором
          секретный ключ.
        </p>
        <input
          className="form-input"
          placeholder="секретный ключ (64 hex-символа)"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          style={{ fontFamily: "'Space Mono', monospace", marginBottom: 12, letterSpacing: "0.5px" }}
        />
        <button type="submit" className="btn btn-primary">Разблокировать</button>
      </form>
    </div>
  );
}

function FileRow({ kind, file, downloadUrl, onDelete, canEdit }) {
  return (
    <tr>
      <td style={{ fontFamily: "'Space Mono', monospace", color: "var(--text)", fontWeight: 600 }}>
        {file.name}
      </td>
      <td style={{ color: "var(--text-dim)", fontFamily: "'Space Mono', monospace" }}>
        {fmtBytes(file.size_bytes)}
      </td>
      <td style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
        {new Date(file.mtime_iso).toLocaleString("ru")}
      </td>
      <td style={{ display: "flex", gap: 6 }}>
        <a className="btn btn-sm" href={downloadUrl} download={file.name}>Скачать</a>
        {canEdit && (
          <button
            className="btn btn-sm"
            onClick={() => onDelete(kind, file.name)}
            style={{ color: "var(--orange-2)" }}
          >
            Удалить
          </button>
        )}
      </td>
    </tr>
  );
}

function KindSection({ kind, files, unlockKey, isEditor, authHeader, onMutate }) {
  const meta = KIND_META[kind];
  const [busy, setBusy] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadStorageFile(kind, file, authHeader);
      await onMutate();
    } catch (err) {
      alert("Ошибка загрузки: " + (err?.message || err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (k, name) => {
    if (!confirm(`Удалить файл "${name}"?`)) return;
    try {
      await deleteStorageFile(k, name, authHeader);
      await onMutate();
    } catch (err) {
      alert("Ошибка удаления: " + (err?.message || err));
    }
  };

  return (
    <section className="card storage-section">
      <div className="card-header">
        <div>
          <span className="card-title">{meta.label}</span>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {meta.desc}
          </div>
        </div>
        <span className="card-meta">{files.length} файлов</span>
      </div>

      {isEditor && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
          <label className="btn btn-success" style={{ cursor: "pointer" }}>
            {busy ? "Загрузка…" : "+ Загрузить файл"}
            <input
              type="file"
              accept={meta.accept}
              onChange={handleUpload}
              style={{ display: "none" }}
              disabled={busy}
            />
          </label>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Принимаются: {meta.accept}
          </span>
        </div>
      )}

      {files.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Файлов пока нет
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Файл</th>
                <th>Размер</th>
                <th>Загружен</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <FileRow
                  key={f.name}
                  kind={kind}
                  file={f}
                  downloadUrl={storageDownloadUrl(kind, f.name, unlockKey)}
                  onDelete={handleDelete}
                  canEdit={isEditor}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function StoragePage() {
  const { user, isEditor, authHeader } = useAuth();
  const [unlockKey, setUnlockKey] = useState(() => localStorage.getItem("polyspace.storage.key") || "");
  const [data, setData] = useState({ ais: [], telemetry: [], iq: [], demo_emi: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ais");

  const reload = useCallback(async () => {
    if (!user && !unlockKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetchStorageList(authHeader, unlockKey);
      setData({
        ais:       res.ais       || [],
        telemetry: res.telemetry || [],
        iq:        res.iq        || [],
        demo_emi:  res.demo_emi  || [],
      });
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes("403") || msg.includes("401")) {
        setError("locked");
        if (!isEditor) {
          localStorage.removeItem("polyspace.storage.key");
          setUnlockKey("");
        }
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [user, isEditor, authHeader, unlockKey]);

  useEffect(() => { reload(); }, [reload]);

  // Reader без ключа или с неверным ключом → форма ввода для «закрытой» части,
  // но архив телеметрии/AIS публичен и должен быть виден всегда.
  const showLockGate = !isEditor && (error === "locked" || (!user && !unlockKey));

  return (
    <div className="app-body">
      <GuideBanner id="storage-intro">
        <strong>Хранилище.</strong> Здесь складываются <em>сырые</em> (не демодулированные)
        пакеты AIS, бинарная телеметрия со спутников и IQ-записи с SDR.
        Файлы можно скачивать и обрабатывать в задачах раздела <em>Практические кейсы</em>.
      </GuideBanner>

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Хранилище</h1>
          <p className="page-subtitle">Архив реальных данных + сырые пакеты для практики</p>
        </div>
        {!isEditor && unlockKey && (
          <button
            className="btn"
            onClick={() => {
              localStorage.removeItem("polyspace.storage.key");
              setUnlockKey("");
              setError("locked");
            }}
          >
            Заблокировать
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 24 }}>
        <ArchiveTelemetrySection />
        <ArchiveAisSection />
      </div>

      {showLockGate && (
        <UnlockGate onUnlock={(k) => { setUnlockKey(k); setError(""); }} />
      )}

      {!showLockGate && (
        <StorageLabSection
          data={data}
          loading={loading}
          error={error}
          tab={tab}
          setTab={setTab}
          unlockKey={unlockKey}
          isEditor={isEditor}
          authHeader={authHeader}
          reload={reload}
        />
      )}
    </div>
  );
}

function StorageLabSection({ data, loading, error, tab, setTab, unlockKey, isEditor, authHeader, reload }) {
  return (
    <>
      <h2 style={{
        fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--text)",
        letterSpacing: 0.4,
      }}>
        Сырые пакеты для лабораторных задач
      </h2>

      <div className="ctrl-row" style={{ marginBottom: 12 }}>
        {Object.entries(KIND_META).map(([k, m]) => (
          <button
            key={k}
            className={`btn btn-tab ${tab === k ? "active" : ""}`}
            onClick={() => setTab(k)}
          >
            {m.label}
            <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>({data[k].length})</span>
          </button>
        ))}
      </div>

      {error && error !== "locked" && (
        <div style={{ padding: 12, color: "var(--orange-2)", fontSize: 13 }}>
          Ошибка: {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          Загрузка…
        </div>
      ) : (
        <KindSection
          kind={tab}
          files={data[tab]}
          unlockKey={unlockKey}
          isEditor={isEditor}
          authHeader={authHeader}
          onMutate={reload}
        />
      )}
    </>
  );
}
