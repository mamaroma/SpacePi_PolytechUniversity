import React from "react";

export default function DocumentationPage() {
  return (
    <div className="page-wrap">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Документация</h1>
          <p className="page-subtitle">
            Технические руководства, описания форматов протоколов и API.
          </p>
        </div>
      </div>

      <div
        style={{
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          border: "1px dashed var(--border)",
          background: "var(--surface-1)",
          padding: 40,
        }}
      >
        <div style={{ textAlign: "center", color: "var(--text-muted)", maxWidth: 460 }}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent-2, #9460b8)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: "0 auto 18px", opacity: 0.55 }}
          >
            <path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z" />
            <line x1="8" y1="9" x2="16" y2="9" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
          <h2 style={{ color: "var(--text-dim)", marginBottom: 10, fontWeight: 600, fontSize: 18 }}>
            Раздел в разработке
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4 }}>
            Здесь скоро появится подробная документация по форматам пакетов телеметрии,
            API наземной станции, протоколам обмена и другим техническим деталям проекта.
          </p>
        </div>
      </div>
    </div>
  );
}
