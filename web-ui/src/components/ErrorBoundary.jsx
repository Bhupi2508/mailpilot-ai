import { Component } from "react";

/** Shows a recoverable message instead of a blank page if a screen crashes. */
class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page page--narrow" style={{ paddingTop: "15vh" }}>
        <div className="card">
          <h2>Something went wrong on this screen</h2>
          <p className="muted" style={{ margin: "8px 0 16px" }}>
            {this.state.error.message || "Unexpected error."} Your sent emails are not affected.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.assign("/dashboard")}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
