import React from "react";

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
