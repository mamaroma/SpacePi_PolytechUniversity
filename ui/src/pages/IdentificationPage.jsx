import React from "react";

export default function IdentificationPage() {
  return (
    <div className="app-body">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Идентификация</h1>
          <p className="page-subtitle">
            Раздел в разработке — здесь появятся инструменты идентификации сигналов
          </p>
        </div>
      </div>

      <div className="card" style={{ minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)", maxWidth: 480 }}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent-2)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: "0 auto 18px", opacity: 0.6 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <h3 style={{ color: "var(--text)", fontSize: 18, marginBottom: 10, fontWeight: 600 }}>
            Скоро появится
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Здесь будет реализован модуль идентификации источников радиосигналов
            и сопоставления сигнатур с известными аппаратами.
          </p>
        </div>
      </div>
    </div>
  );
}
