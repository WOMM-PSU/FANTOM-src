"use client";

import jsQR from "jsqr";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  CAMERA_CENTER_TOLERANCE,
  CAMERA_MIN_MARKER_SIZE,
  normalizeJoinCode,
  parsePlayerMarker,
  type MatchPlayerSnapshot,
  type OrientationReading,
  type ShotEvidence,
} from "@fantom/shared";

export type CameraAimStatus =
  | "idle"
  | "starting"
  | "active"
  | "error"
  | "stopped";

export type CameraAimTarget = {
  playerId: string;
  markerId: string;
  displayName: string;
  offsetX: number;
  offsetY: number;
  distanceMeters: number;
  confidence: number;
  sizeRatio: number;
  centered: boolean;
  lastSeenAt: number;
};

export type CameraAimState = {
  supported: boolean;
  status: CameraAimStatus;
  error: string | null;
  target: CameraAimTarget | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
};

type Options = {
  enabled: boolean;
  joinCode: string;
  players: MatchPlayerSnapshot[];
  currentPlayerId: string;
  requestOrientationPermission: () => Promise<boolean>;
};

const SCAN_INTERVAL_MS = 160;
const TARGET_TIMEOUT_MS = 650;
const SCAN_WIDTH = 480;
const APPROXIMATE_FOV_DEGREES = 60;
const MARKER_WIDTH_METERS = 0.16;

export function buildCameraEvidence(
  target: CameraAimTarget,
  orientation: OrientationReading | null,
): ShotEvidence | null {
  if (!orientation) {
    return null;
  }
  return {
    source: "camera",
    markerId: target.markerId,
    offsetX: target.offsetX,
    offsetY: target.offsetY,
    confidence: target.confidence,
    distanceMeters: target.distanceMeters,
    capturedAt: Date.now(),
    orientation,
  };
}

export function useCameraAim({
  enabled,
  joinCode,
  players,
  currentPlayerId,
  requestOrientationPermission,
}: Options): CameraAimState {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<CameraAimStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<CameraAimTarget | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastMarkerRef = useRef<string | null>(null);
  const stableCountRef = useRef(0);
  const lastSeenRef = useRef(0);
  const playersRef = useRef(players);
  const joinCodeRef = useRef(normalizeJoinCode(joinCode));
  const currentPlayerIdRef = useRef(currentPlayerId);

  useEffect(() => {
    playersRef.current = players;
    currentPlayerIdRef.current = currentPlayerId;
  }, [currentPlayerId, players]);

  useEffect(() => {
    joinCodeRef.current = normalizeJoinCode(joinCode);
  }, [joinCode]);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function",
    );
  }, []);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    lastMarkerRef.current = null;
    stableCountRef.current = 0;
    lastSeenRef.current = 0;
    setTarget(null);
    setStatus((current) => (current === "idle" ? "idle" : "stopped"));
  }, []);

  const start = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.mediaDevices?.getUserMedia !== "function"
    ) {
      setStatus("error");
      setError(
        "This browser does not expose a camera API. Use practice targeting if the host enabled it.",
      );
      return;
    }

    setStatus("starting");
    setError(null);
    setTarget(null);

    // Both prompts are tied to the user gesture that started aiming. The
    // orientation request is intentionally not awaited before getUserMedia.
    void requestOrientationPermission();

    const previous = streamRef.current;
    if (previous) {
      for (const track of previous.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === "OverconstrainedError" ||
            error.name === "NotFoundError")
        ) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } else {
          throw error;
        }
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // play() can reject until metadata arrives; the scanning effect retries.
        }
      }
      setStatus("active");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus("error");
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow the camera and try again."
          : name === "NotReadableError"
            ? "The camera is already in use by another app. Close it and try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : "The camera could not be started. Check permissions and try again.",
      );
      setTarget(null);
    }
  }, [requestOrientationPermission]);

  // Attach the stream after the video element has rendered.
  useEffect(() => {
    if (status !== "active") {
      return;
    }
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        setError("Tap the camera preview to resume the preview.");
      });
    }
  }, [status]);

  useEffect(() => {
    if (status !== "active") {
      return;
    }

    const scan = (): void => {
      const video = videoRef.current;
      if (
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return;
      }

      const width = SCAN_WIDTH;
      const height = Math.max(
        1,
        Math.round((video.videoHeight / video.videoWidth) * width),
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const code = jsQR(image.data, width, height, {
        inversionAttempts: "dontInvert",
      });

      const now = Date.now();
      const parsed = code ? parsePlayerMarker(code.data) : null;
      const player =
        parsed && parsed.joinCode === joinCodeRef.current
          ? playersRef.current.find(
              (candidate) =>
                candidate.markerId === parsed.markerId &&
                candidate.id !== currentPlayerIdRef.current &&
                candidate.status === "alive" &&
                candidate.connected,
            )
          : undefined;

      if (code && parsed && player) {
        const xs = [
          code.location.topLeftCorner.x,
          code.location.topRightCorner.x,
          code.location.bottomRightCorner.x,
          code.location.bottomLeftCorner.x,
        ];
        const ys = [
          code.location.topLeftCorner.y,
          code.location.topRightCorner.y,
          code.location.bottomRightCorner.y,
          code.location.bottomLeftCorner.y,
        ];
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const boxWidth = Math.max(1, maxX - minX);
        const boxHeight = Math.max(1, maxY - minY);
        const sizeRatio = Math.max(boxWidth / width, boxHeight / height);

        if (sizeRatio < CAMERA_MIN_MARKER_SIZE) {
          setTarget(null);
          return;
        }

        if (lastMarkerRef.current === parsed.markerId) {
          stableCountRef.current += 1;
        } else {
          lastMarkerRef.current = parsed.markerId;
          stableCountRef.current = 1;
        }
        lastSeenRef.current = now;

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const offsetX = (centerX / width) * 2 - 1;
        const offsetY = (centerY / height) * 2 - 1;
        const focal =
          width / 2 / Math.tan((APPROXIMATE_FOV_DEGREES * Math.PI) / 360);
        const distanceMeters = Math.max(
          0.5,
          Math.min(99, (MARKER_WIDTH_METERS * focal) / boxWidth),
        );
        const confidence = Math.min(
          1,
          0.4 + stableCountRef.current * 0.15 + sizeRatio,
        );

        setTarget({
          playerId: player.id,
          markerId: parsed.markerId,
          displayName: player.displayName,
          offsetX,
          offsetY,
          distanceMeters,
          confidence,
          sizeRatio,
          centered:
            Math.abs(offsetX) <= CAMERA_CENTER_TOLERANCE &&
            Math.abs(offsetY) <= CAMERA_CENTER_TOLERANCE,
          lastSeenAt: now,
        });
        return;
      }

      if (now - lastSeenRef.current > TARGET_TIMEOUT_MS) {
        lastMarkerRef.current = null;
        stableCountRef.current = 0;
        setTarget(null);
      }
    };

    const timer = window.setInterval(scan, SCAN_INTERVAL_MS);
    scan();
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!enabled) {
      stop();
    }
  }, [enabled, stop]);

  useEffect(() => {
    return () => {
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, []);

  return {
    supported,
    status,
    error,
    target,
    videoRef,
    start,
    stop,
  };
}
