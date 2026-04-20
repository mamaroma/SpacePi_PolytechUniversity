import React from "react";

export default function CreatorsPage() {
  return (
    <div className="app-body">
      <div className="placeholder-page">
        <div className="placeholder-icon">👨‍🚀</div>
        <h1 className="placeholder-title">Создатели</h1>
        <p className="placeholder-text">
          Раздел о команде проекта находится в разработке.
        </p>
        <div className="placeholder-items">
          <div className="placeholder-item">
            <span className="placeholder-item-icon">🏛</span>
            <div>
              <div className="placeholder-item-title">СПбПУ Петра Великого</div>
              <div className="placeholder-item-desc">Санкт-Петербургский политехнический университет</div>
            </div>
          </div>
          <div className="placeholder-item">
            <span className="placeholder-item-icon">🔬</span>
            <div>
              <div className="placeholder-item-title">Технополис Политех</div>
              <div className="placeholder-item-desc">Научно-исследовательский комплекс</div>
            </div>
          </div>
          <div className="placeholder-item">
            <span className="placeholder-item-icon">🛰</span>
            <div>
              <div className="placeholder-item-title">Команда PolySpace</div>
              <div className="placeholder-item-desc">Разработчики наземной станции и спутниковых систем</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
