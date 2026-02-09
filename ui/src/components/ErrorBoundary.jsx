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
        <div className="card" style={{ padding: 12 }}>
          <b>UI crashed in this widget</b>
          <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
            {this.state.err}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}