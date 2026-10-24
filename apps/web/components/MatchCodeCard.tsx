"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { getJoinUrl } from "@/lib/serverUrl";

type Props = {
  joinCode: string;
};

export function MatchCodeCard({ joinCode }: Props) {
  const [joinUrl, setJoinUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    setJoinUrl(getJoinUrl(joinCode));
    setLocalOnly(
      ["localhost", "127.0.0.1", "::1"].includes(
        window.location.hostname,
      ),
    );
  }, [joinCode]);

  useEffect(() => {
    if (!showQr || !joinUrl) {
      return;
    }

    let cancelled = false;
    setQrDataUrl(null);
    setQrError(null);

    void QRCode.toDataURL(joinUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 480,
      color: { dark: "#07101f", light: "#eef4ff" },
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError("Could not generate the QR code on this device.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinUrl, showQr]);

  async function copyLink(): Promise<void> {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is unavailable");
      }
      await navigator.clipboard.writeText(joinUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="card code-card" aria-labelledby="code-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Invite</p>
          <h2 className="section-title" id="code-title">
            Match code
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setShowQr((current) => !current)}
          aria-expanded={showQr}
        >
          {showQr ? "Hide QR" : "Show QR"}
        </button>
      </div>

      <div className="code-row">
        <span className="code-chars" aria-label={`Match code ${joinCode}`}>
          {joinCode}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => void copyLink()}
          disabled={!joinUrl}
        >
          Copy link
        </button>
      </div>

      <p className="copy-status" role="status">
        {copyStatus === "copied"
          ? "Invite link copied."
          : copyStatus === "failed"
            ? "Copy failed. Share the four-character code instead."
            : "Scan the QR or enter the code on another phone."}
      </p>

      {showQr ? (
        <div className="qr-wrap">
          {qrError ? (
            <p className="form-error" role="alert">
              {qrError}
            </p>
          ) : qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="qr-image"
              src={qrDataUrl}
              alt={`QR code to join match ${joinCode}`}
            />
          ) : (
            <p className="qr-placeholder">Generating QR code…</p>
          )}
          <p className="join-url">{joinUrl}</p>
        </div>
      ) : null}

      {localOnly ? (
        <p className="notice notice-warning" role="note">
          This page is open as localhost. The invite link will only work on
          this computer. Open FANTOM using the computer&apos;s LAN address
          before sharing it with phones.
        </p>
      ) : null}
    </section>
  );
}
