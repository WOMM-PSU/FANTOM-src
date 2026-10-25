"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrientationReading } from "@fantom/shared";

type PermissionState = "unknown" | "granted" | "denied" | "unsupported";

type OrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export type DeviceOrientationState = {
  supported: boolean;
  permission: PermissionState;
  reading: OrientationReading | null;
  error: string | null;
  requestPermission: () => Promise<boolean>;
};

function normalizeAlpha(alpha: number): number {
  return ((alpha % 360) + 360) % 360;
}

export function useDeviceOrientation(): DeviceOrientationState {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [reading, setReading] = useState<OrientationReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setSupported(false);
      setPermission("unsupported");
      return;
    }

    setSupported(true);
    const constructor = window.DeviceOrientationEvent as
      | OrientationEventConstructor
      | undefined;
    if (!constructor?.requestPermission) {
      setPermission("granted");
    }

    const onOrientation = (event: DeviceOrientationEvent): void => {
      if (
        event.alpha === null ||
        event.beta === null ||
        event.gamma === null ||
        !Number.isFinite(event.alpha) ||
        !Number.isFinite(event.beta) ||
        !Number.isFinite(event.gamma)
      ) {
        return;
      }

      setReading({
        alpha: normalizeAlpha(event.alpha),
        beta: Math.max(-180, Math.min(180, event.beta)),
        gamma: Math.max(-90, Math.min(90, event.gamma)),
        absolute: event.absolute,
      });
      setError(null);
    };

    window.addEventListener("deviceorientation", onOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation, true);
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setPermission("unsupported");
      setError("This device does not expose motion orientation.");
      return false;
    }

    const constructor = window.DeviceOrientationEvent as
      | OrientationEventConstructor
      | undefined;
    if (!constructor?.requestPermission) {
      setPermission("granted");
      return true;
    }

    try {
      const result = await constructor.requestPermission();
      if (result === "granted") {
        setPermission("granted");
        setError(null);
        return true;
      }
      setPermission("denied");
      setError(
        "Motion access was denied. Allow motion access in your browser settings to use camera aiming.",
      );
      return false;
    } catch {
      setPermission("denied");
      setError(
        "Motion access could not be requested. Check your browser permissions.",
      );
      return false;
    }
  }, []);

  return {
    supported,
    permission,
    reading,
    error,
    requestPermission,
  };
}
