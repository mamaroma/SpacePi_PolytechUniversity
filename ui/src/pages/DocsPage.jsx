import React from "react";

export default function DocsPage() {
  return (
    <div className="app-body">
      <div className="placeholder-page">
        <div className="placeholder-icon">📚</div>
        <h1 className="placeholder-title">Документация</h1>
        <p className="placeholder-text">
          Раздел документации находится в разработке.
        </p>
        <div className="placeholder-items">
          <div className="placeholder-item">
            <span className="placeholder-item-icon">📖</span>
            <div>
              <div className="placeholder-item-title">Руководство пользователя</div>
              <div className="placeholder-item-desc">Описание интерфейса и возможностей платформы</div>
            </div>
          </div>
          <div className="placeholder-item">
            <span className="placeholder-item-icon">🔧</span>
            <div>
              <div className="placeholder-item-title">Техническая документация</div>
              <div className="placeholder-item-desc">API, архитектура, протоколы</div>
            </div>
          </div>
          <div className="placeholder-item">
            <span className="placeholder-item-icon">🛰</span>
            <div>
              <div className="placeholder-item-title">Спутники Polytech Universe</div>
              <div className="placeholder-item-desc">Характеристики и параметры орбит</div>
            </div>
          </div>
          <div className="placeholder-item">
            <span className="placeholder-item-icon">📡</span>
            <div>
              <div className="placeholder-item-title">Наземная станция</div>
              <div className="placeholder-item-desc">Оборудование, настройка, эксплуатация</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
