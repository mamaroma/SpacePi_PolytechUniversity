import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "../AuthContext";
import {
  fetchStorageList,
  storageDownloadUrl,
  uploadStorageFile,
  deleteStorageFile,
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

  // Reader без ключа или с неверным ключом → форма ввода
  if (!isEditor && (error === "locked" || (!user && !unlockKey))) {
    return (
      <div className="app-body">
        <UnlockGate onUnlock={(k) => { setUnlockKey(k); setError(""); }} />
      </div>
    );
  }

  return (
    <div className="app-body">
      <GuideBanner id="storage-intro">
        <strong>Хранилище.</strong> Здесь складываются <em>сырые</em> (не демодулированные)
        пакеты AIS, бинарная телеметрия со спутников и IQ-записи с SDR.
        Файлы можно скачивать и обрабатывать в задачах раздела <em>Challenge</em>.
      </GuideBanner>

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Хранилище</h1>
          <p className="page-subtitle">Сырые пакеты для лабораторных задач</p>
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
    </div>
  );
}
