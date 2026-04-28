import React from "react";

export default function SnapshotsPage() {
  return (
    <div className="app-body">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Снимки</h1>
          <p className="page-subtitle">
            Раздел в разработке — здесь появятся снимки с бортовых камер спутников
          </p>
        </div>
      </div>

      <div className="card" style={{ minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)", maxWidth: 480 }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 18px", opacity: 0.6 }}>
            <rect x="3" y="6" width="18" height="14" rx="2"/>
            <circle cx="12" cy="13" r="4"/>
            <path d="M8 6l1-2h6l1 2"/>
          </svg>
          <h3 style={{ color: "var(--text)", fontSize: 18, marginBottom: 10, fontWeight: 600 }}>
            Скоро появится
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Здесь будут публиковаться снимки Земли и космоса, полученные с
            бортовых камер спутников Polytech&nbsp;Universe.
          </p>
        </div>
      </div>
    </div>
  );
}
