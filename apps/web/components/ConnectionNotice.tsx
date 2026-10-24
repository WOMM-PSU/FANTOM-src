"use client";

import type {
  ConnectionStatus,
  UiError,
} from "@/hooks/useMatchConnection";

type Props = {
  status: ConnectionStatus;
  error: UiError | null;
  onRetry: () => void;
  onDismiss: () => void;
};

export function ConnectionNotice({
  status,
  error,
  onRetry,
  onDismiss,
}: Props) {
  if (status === "reconnecting") {
    return (
      <div className="notice notice-warning" role="status">
        <span className="notice-dot" aria-hidden="true" />
        <span>Connection lost. Reconnecting to the match…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notice notice-danger" role="alert">
        <div className="notice-body">{error.message}</div>
        <div className="notice-actions">
          {status === "offline" ? (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onDismiss}
            aria-label="Dismiss message"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div className="notice notice-danger" role="alert">
        <div className="notice-body">
          Lost connection to the game server.
        </div>
        <div className="notice-actions">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}
