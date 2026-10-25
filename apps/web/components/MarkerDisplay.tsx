"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { encodePlayerMarker } from "@fantom/shared";

type Props = {
  open: boolean;
  joinCode: string;
  markerId: string;
  displayName: string;
  eliminated: boolean;
  onClose: () => void;
};

export function MarkerDisplay({
  open,
  joinCode,
  markerId,
  displayName,
  eliminated,
  onClose,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setDataUrl(null);
    setError(null);

    let payload: string;
    try {
      payload = encodePlayerMarker(joinCode, markerId);
    } catch {
      setError("This match marker is not valid.");
      return;
    }

    void QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 3,
      width: 720,
      color: { dark: "#05080f", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("The marker could not be rendered on this device.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinCode, markerId, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="marker-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="marker-title"
    >
      <div className="marker-sheet">
        <div className="marker-heading">
          <div>
            <p className="eyebrow">Your target marker</p>
            <h2 className="panel-title" id="marker-title">
              {displayName}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={onClose}
            autoFocus
          >
            Close
          </button>
        </div>

        {eliminated ? (
          <div className="notice notice-warning" role="note">
            You are eliminated. Your marker is hidden until you respawn.
          </div>
        ) : error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : dataUrl ? (
          <>
            <div className="marker-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="marker-qr"
                src={dataUrl}
                alt={`Target marker for ${displayName}`}
              />
            </div>
            <p className="marker-hint">
              Hold this screen steady toward the shooter. Keep the whole code
              visible and avoid glare.
            </p>
          </>
        ) : (
          <p className="qr-placeholder">Rendering marker…</p>
        )}

        <p className="safety-note">
          <span aria-hidden="true">◎</span>
          Do not walk while holding the phone out. Stand in a safe, open area.
        </p>
      </div>
    </div>
  );
}
