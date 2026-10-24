const DEFAULT_SERVER_PORT = 4000;

export function getServerHttpUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return `http://localhost:${DEFAULT_SERVER_PORT}`;
  }

  const protocol =
    window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${window.location.hostname}:${DEFAULT_SERVER_PORT}`;
}

export function getWebSocketUrl(): string {
  return `${getServerHttpUrl().replace(/^http/, "ws")}/ws`;
}

export function getJoinUrl(joinCode: string): string {
  if (typeof window === "undefined") {
    return `/join/${joinCode}`;
  }
  return `${window.location.origin}/join/${joinCode}`;
}
