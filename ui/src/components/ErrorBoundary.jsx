import React from "react";

/**
 * Граница ошибок. По умолчанию — компактная карточка для виджетов.
 * С пропом `page` — полноэкранная заглушка раздела с кнопкой перезагрузки,
 * чтобы падение одного раздела не превращало весь сайт в чёрный экран.
 * Чтобы сбрасываться при переходе между разделами, передавайте `key`
 * (например, `key={location.pathname}`).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: "" };
  }
  static getDerivedStateFromError(error) {
    return { err: String(error?.message ?? error) };
  }
  componentDidCatch(error, info) {
    console.error("UI ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.err) {
      if (this.props.page) {
        return (
          <div className="error-card error-card--page">
            <div className="err-title">⚠ Раздел не удалось загрузить</div>
            <div className="err-detail">
              Произошла ошибка при отображении этой страницы. Попробуйте обновить её —
              если не поможет, напишите нам через форму внизу сайта.
            </div>
            <div className="err-tech">{this.state.err}</div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Обновить страницу
            </button>
          </div>
        );
      }
      return (
        <div className="error-card">
          <div className="err-title">⚠ Widget crashed</div>
          <div className="err-detail">{this.state.err}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
