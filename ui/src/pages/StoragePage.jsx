import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  fetchStorageList,
  uploadStorageFile,
  deleteStorageFile,
  fetchTeleaisTelemetryList,
  fetchTeleaisTelemetryPreview,
  fetchTeleaisAisList,
} from "../api";
import { GuideBanner } from "../components/Hint";

const CONTACT_EMAIL = "spacepicontest@mail.ru";

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

const SAT_ACCENT = {
  "PU-1": "#f39768",
  "PU-2": "#f39768",
  "PU-3": "#9460b8",
  "PU-4": "#6cc77b",
  "PU-5": "#56965b",
  "PU-6": "#5ad6ff",
};

const TELEMETRY_CODES = ["PU-1", "PU-2", "PU-3", "PU-4", "PU-5", "PU-6"];

function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function requestAccessMailto({ kind, sat, filename }) {
  const subject = encodeURIComponent(
    `Запрос доступа к архиву PolySpace${sat ? ` · ${sat}` : ""}${kind ? ` · ${kind}` : ""}`
  );
  const body = encodeURIComponent(
    [
      "Здравствуйте!",
      "",
      "Прошу предоставить доступ к данным раздела «Хранилище» PolySpace Ground Station.",
      sat ? `Спутник / источник: ${sat}` : null,
      kind ? `Тип данных: ${kind}` : null,
      filename ? `Файл / сессия: ${filename}` : null,
      "",
      "Цель использования:",
      "Организация / ФИО:",
      "",
      "Спасибо.",
    ].filter(Boolean).join("\n")
  );
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}

function RequestAccessButton({ kind, sat, filename, label = "Запросить доступ" }) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => requestAccessMailto({ kind, sat, filename })}
      title={`Письмо на ${CONTACT_EMAIL}`}
    >
      {label}
    </button>
  );
}

/* ─── Архив телеметрии PU-1 ... PU-6 ─────────────────────────── */
function ArchiveTelemetrySection({ selectedSat, onSelectSat }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchTeleaisTelemetryList()
      .then((r) => setItems(r.items || []))
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  const active = useMemo(
    () => (items || []).find((it) => it.code === selectedSat) || null,
    [items, selectedSat]
  );

  useEffect(() => {
    if (!selectedSat || !TELEMETRY_CODES.includes(selectedSat)) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewErr("");
    fetchTeleaisTelemetryPreview(selectedSat, 14)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch((e) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewErr(e?.message || String(e));
        }
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSat]);

  return (
    <section className="card storage-section">
      <div className="card-header">
        <div>
          <span className="card-title">Архив телеметрии · PU-1 … PU-6</span>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Превью бортовых пакетов «как с орбиты». Полные CSV не скачиваются —
            доступ к выгрузке только <b>по запросу</b>.
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
          <div className="storage-sat-grid">
            {items.map((it) => {
              const isSel = it.code === selectedSat;
              const accent = SAT_ACCENT[it.code] || "#9460b8";
              const inactive = it.active === false;
              return (
                <button
                  key={it.code}
                  type="button"
                  onClick={() => onSelectSat(it.code)}
                  className={`storage-sat-card${isSel ? " is-selected" : ""}${inactive ? " is-inactive" : ""}`}
                  style={{
                    "--sat-accent": accent,
                  }}
                >
                  <div className="storage-sat-code">{it.code}</div>
                  <div className="storage-sat-label">{it.label}</div>
                  <div className="storage-sat-meta">
                    {it.missing
                      ? "файл отсутствует"
                      : (it.last_packet_label
                        ? `последний пакет · ${it.last_packet_label}`
                        : (inactive ? "архив · не передаёт" : fmtBytes(it.size_bytes)))}
                  </div>
                  <div className={`storage-sat-status${inactive ? " is-off" : " is-on"}`}>
                    {inactive ? (it.status_note || "не передаёт") : (it.status_note || "действует")}
                  </div>
                </button>
              );
            })}
          </div>

          {active && !active.missing && (
            <div className="storage-preview-panel">
              <div className="storage-preview-head">
                <div>
                  <div className="storage-preview-title">
                    {active.label}
                    <span className="storage-preview-code">{active.code}</span>
                  </div>
                  <div className="storage-preview-sub">
                    {active.active === false ? (
                      <>
                        <span className="storage-pill storage-pill--off">архив</span>
                        {active.status_note || "больше не передаёт"}
                        {active.last_packet_label && <> · последний пакет {active.last_packet_label}</>}
                      </>
                    ) : (
                      <>
                        <span className="storage-pill storage-pill--on">online / архив</span>
                        {preview?.last_packet_label
                          ? `последний пакет · ${preview.last_packet_label}`
                          : (active.last_packet_label || "действующий аппарат")}
                        {" · "}{fmtBytes(active.size_bytes)}
                      </>
                    )}
                  </div>
                </div>
                <RequestAccessButton
                  kind="телеметрия CSV"
                  sat={active.code}
                  filename={active.filename}
                  label="Запросить полную выгрузку"
                />
              </div>

              {previewLoading && (
                <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
                  Загрузка превью пакетов…
                </div>
              )}
              {previewErr && (
                <div style={{ padding: 12, color: "var(--orange-2)", fontSize: 13 }}>
                  Превью недоступно: {previewErr}
                </div>
              )}
              {preview?.rows?.length > 0 && (
                <div className="table-wrap storage-preview-table">
                  <table>
                    <thead>
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...preview.rows].reverse().map((row, i) => (
                        <tr key={i}>
                          {preview.columns.map((c) => (
                            <td key={c}>{row[c] === "" || row[c] == null ? "—" : String(row[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
function ArchiveAisSection({ selectedSat }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [satFilter, setSatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");

  useEffect(() => {
    fetchTeleaisAisList()
      .then((r) => setItems(r.items || []))
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  // Синхронизация с выбранным КА в шапке раздела (если у него есть AIS).
  useEffect(() => {
    if (!items || !selectedSat) return;
    const has = items.some((it) => it.satellite === selectedSat);
    if (has) setSatFilter(selectedSat);
  }, [selectedSat, items]);

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
            Каталог сеансов CSTP-2.1 / CSTP-2.2 / PU-4. Файлы не отдаются напрямую —
            выгрузка <b>по запросу</b>. Выбор спутника выше фильтрует таблицу.
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
          <div className="storage-ais-filters">
            <span className="ctrl-label">Спутник</span>
            <select
              value={satFilter}
              onChange={(e) => setSatFilter(e.target.value)}
              className="storage-select"
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
              className="storage-select"
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
                  <th>Доступ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => (
                  <tr key={it.path}>
                    <td style={{ color: "var(--text)", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                      {it.session_date || "—"}
                    </td>
                    <td>
                      <span className="storage-sat-chip">{it.satellite}</span>
                    </td>
                    <td style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      <div style={{ color: "var(--text-dim)" }}>{it.session}</div>
                      <div style={{ color: "var(--text-muted)" }}>{it.filename}</div>
                    </td>
                    <td style={{ color: "var(--text-dim)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      {fmtBytes(it.size_bytes)}
                    </td>
                    <td>
                      <RequestAccessButton
                        kind="AIS CSV"
                        sat={it.satellite}
                        filename={it.filename}
                      />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                      {TELEMETRY_CODES.includes(selectedSat) && satFilter === selectedSat
                        ? `Для ${selectedSat} AIS-сессий в каталоге нет — выберите CSTP-2.x / PU-4 или «Все».`
                        : "Файлов нет для выбранного фильтра."}
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
        <h2 style={{ marginBottom: 6, color: "var(--orange)" }}>Лабораторный раздел заблокирован</h2>
        <p style={{ color: "var(--text-dim)", marginBottom: 16, fontSize: 14, lineHeight: 1.55 }}>
          Сырые AIS / Telemetry / IQ для практических кейсов открываются по ключу
          модератора. Публичный архив выше доступен без ключа (просмотр превью,
          выгрузка — по запросу на {CONTACT_EMAIL}).
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

function FileRow({ kind, file, onDelete, canEdit }) {
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
      <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <RequestAccessButton kind={KIND_META[kind]?.label || kind} filename={file.name} />
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

function KindSection({ kind, files, isEditor, authHeader, onMutate }) {
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
            {meta.desc} Прямое скачивание отключено — запросите доступ.
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
                <th>Доступ</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <FileRow
                  key={f.name}
                  kind={kind}
                  file={f}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [unlockKey, setUnlockKey] = useState(() => localStorage.getItem("polyspace.storage.key") || "");
  const [data, setData] = useState({ ais: [], telemetry: [], iq: [], demo_emi: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ais");

  const selectedSat = useMemo(() => {
    const q = (searchParams.get("sat") || "").toUpperCase();
    if (TELEMETRY_CODES.includes(q)) return q;
    try {
      const saved = (localStorage.getItem("polyspace.selectedSat") || "").toUpperCase();
      if (TELEMETRY_CODES.includes(saved)) return saved;
    } catch {}
    return "PU-3";
  }, [searchParams]);

  const onSelectSat = useCallback((code) => {
    const next = String(code || "").toUpperCase();
    if (!TELEMETRY_CODES.includes(next)) return;
    try { localStorage.setItem("polyspace.selectedSat", next); } catch {}
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("sat", next);
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  // Первичная запись sat в URL, чтобы шапка/шаринг ссылки работали.
  useEffect(() => {
    if (!searchParams.get("sat")) onSelectSat(selectedSat);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const showLockGate = !isEditor && (error === "locked" || (!user && !unlockKey));

  return (
    <div className="app-body">
      <GuideBanner id="storage-intro-v2">
        <strong>Зачем это хранилище.</strong> Здесь собраны <em>реальные</em> архивы
        телеметрии Polytech Universe и AIS-сессий со спутников — чтобы увидеть,
        как выглядят пакеты с орбиты, и понять структуру данных до практики.
        Прямое скачивание отключено: полный доступ выдаётся{" "}
        <b>по запросу</b> ({CONTACT_EMAIL}). Ниже — отдельный лабораторный раздел
        с сырыми файлами для кейсов (по ключу модератора).
      </GuideBanner>

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Хранилище</h1>
          <p className="page-subtitle">
            Каталог орбитальных архивов · превью пакетов · доступ по запросу
          </p>
        </div>
        <div className="storage-header-sat">
          <span className="ctrl-label">Спутник</span>
          <select
            className="storage-select"
            value={selectedSat}
            onChange={(e) => onSelectSat(e.target.value)}
            aria-label="Выбор спутника для хранилища"
          >
            {TELEMETRY_CODES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 24 }}>
        <ArchiveTelemetrySection selectedSat={selectedSat} onSelectSat={onSelectSat} />
        <ArchiveAisSection selectedSat={selectedSat} />
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
          isEditor={isEditor}
          authHeader={authHeader}
          reload={reload}
        />
      )}
    </div>
  );
}

function StorageLabSection({ data, loading, error, tab, setTab, isEditor, authHeader, reload }) {
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
          isEditor={isEditor}
          authHeader={authHeader}
          onMutate={reload}
        />
      )}
    </>
  );
}
