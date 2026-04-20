import React, { useState, useEffect, useRef } from "react";

// SDR is now integrated into the main backend — same origin, /sdr path.
const SDR_PATH = "/sdr";
const PROBE_URL = "/sdr/api/info";
const CONNECT_TIMEOUT_MS = 6000;

export default function SdrPage() {
  const [status, setStatus] = useState("connecting");
  const [retryKey, setRetryKey] = useState(0);
  const [errorDetail, setErrorDetail] = useState("");
  const timeoutRef = useRef(null);

  useEffect(() => {
    setStatus("connecting");
    setErrorDetail("");
    const controller = new AbortController();

    timeoutRef.current = setTimeout(() => {
      controller.abort();
      setStatus("offline");
      setErrorDetail("Timeout — сервис не отвечает");
    }, CONNECT_TIMEOUT_MS);

    fetch(PROBE_URL, { signal: controller.signal })
      .then(async (r) => {
        clearTimeout(timeoutRef.current);
        if (r.ok) {
          setStatus("online");
        } else {
          const body = await r.json().catch(() => ({}));
          setErrorDetail(body.detail || `HTTP ${r.status}`);
          setStatus("offline");
        }
      })
      .catch((err) => {
        clearTimeout(timeoutRef.current);
        if (err.name !== "AbortError") {
          setErrorDetail(err.message);
          setStatus("offline");
        }
      });

    return () => {
      clearTimeout(timeoutRef.current);
      controller.abort();
    };
  }, [retryKey]);

  const handleRetry = () => setRetryKey((k) => k + 1);

  return (
    <div className="app-body">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Интерактивный сервис для школьников</h1>
          <p className="page-subtitle">
            SDR-трансляция — наблюдение за радиосигналами спутников в реальном времени
          </p>
        </div>
        <a href={SDR_PATH} target="_blank" rel="noreferrer" className="btn btn-primary">
          Открыть в новом окне ↗
        </a>
      </div>

      <div className="sdr-info-cards">
        <div className="metric-card col-cyan">
          <div className="metric-label">📡 Что это?</div>
          <div className="metric-sub" style={{ color: "var(--text)", fontSize: 12, marginTop: 4 }}>
            Сервис позволяет в реальном времени наблюдать за радиосигналами,
            принимаемыми наземной станцией СПбПУ. Вы увидите водопадную диаграмму —
            визуальное представление радиоволн.
          </div>
        </div>
        <div className="metric-card col-green">
          <div className="metric-label">🎓 Для кого?</div>
          <div className="metric-sub" style={{ color: "var(--text)", fontSize: 12, marginTop: 4 }}>
            Сервис разработан для школьников и студентов, интересующихся
            космическими технологиями и радиоприёмом. Не требует специальных знаний.
          </div>
        </div>
        <div className="metric-card col-yellow">
          <div className="metric-label">🔧 Как работает?</div>
          <div className="metric-sub" style={{ color: "var(--text)", fontSize: 12, marginTop: 4 }}>
            Антенна наземной станции принимает сигнал → SDR-приёмник оцифровывает его →
            GNU Radio обрабатывает данные → веб-интерфейс показывает спектр и водопад.
          </div>
        </div>
      </div>

      <div className="card sdr-iframe-container">
        {status === "connecting" && (
          <div className="sdr-loading">
            <span className="spinner" style={{ width: 24, height: 24 }} />
            <span>Подключение к SDR-сервису…</span>
          </div>
        )}

        {status === "offline" && (
          <div className="sdr-offline">
            <div style={{ fontSize: 52, marginBottom: 16 }}>📡</div>
            <h3>SDR-сервис временно недоступен</h3>
            <p style={{ maxWidth: 480, margin: "12px auto", color: "var(--text-dim)", lineHeight: 1.6 }}>
              Убедитесь, что основной API-сервис запущен. SDR встроен в основное приложение
              и не требует отдельного запуска.
            </p>
            {errorDetail && (
              <div style={{
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "8px 16px", fontFamily: "monospace",
                fontSize: 11, color: "var(--red, #f87171)", margin: "0 auto",
                maxWidth: 480, textAlign: "left", wordBreak: "break-all"
              }}>
                {errorDetail}
              </div>
            )}
            <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 8, maxWidth: 480, margin: "8px auto 0" }}>
              Если SDR-приёмник не подключён — сервис автоматически воспроизводит
              файл-заглушку{" "}
              <code style={{ color: "var(--yellow)" }}>nothing.iq</code> для демонстрации.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={handleRetry}>
                Попробовать снова
              </button>
            </div>
          </div>
        )}

        {status === "online" && (
          <iframe
            key={retryKey}
            src={SDR_PATH}
            title="SDR Service"
            className="sdr-iframe"
          />
        )}
      </div>
    </div>
  );
}
