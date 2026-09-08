import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: (errorId: string) => ReactNode;
  onError?: (errorId: string) => void;
}

interface State {
  errorId: string | null;
}

export class AvatarErrorBoundary extends Component<Props, State> {
  override state: State = { errorId: null };

  static getDerivedStateFromError(): State {
    return { errorId: `AV-${Date.now().toString(36).toUpperCase()}` };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = this.state.errorId ?? "AV-UNKNOWN";
    console.error("Avatar renderer failed", { errorId, error, componentStack: info.componentStack });
    this.props.onError?.(errorId);
  }

  override render() {
    if (this.state.errorId) return this.props.fallback(this.state.errorId);
    return this.props.children;
  }
}