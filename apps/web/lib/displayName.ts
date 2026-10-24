const DISPLAY_NAME_KEY = "fantom.displayName";

export function loadDisplayName(): string {
  try {
    return window.localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveDisplayName(displayName: string): void {
  try {
    window.localStorage.setItem(DISPLAY_NAME_KEY, displayName);
  } catch {
    // The call sign is a convenience preference; session storage errors are
    // handled separately where they can invalidate the match session.
  }
}
