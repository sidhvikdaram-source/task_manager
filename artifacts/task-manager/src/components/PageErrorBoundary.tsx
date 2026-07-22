import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type State = { error: Error | null };

export class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="bento-card mx-auto max-w-xl p-6 text-center" role="alert">
        <AlertTriangle className="mx-auto h-7 w-7 text-destructive" />
        <h1 className="mt-3 text-xl font-black">This page hit a problem</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your data is still safe. Reload this view to try the request again.
        </p>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null });
            window.location.reload();
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground"
        >
          <RotateCcw className="h-4 w-4" /> Reload view
        </button>
      </section>
    );
  }
}
