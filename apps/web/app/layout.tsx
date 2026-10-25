import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./hud.css";

export const metadata: Metadata = {
  title: {
    default: "FANTOM — real-world laser tag",
    template: "%s · FANTOM",
  },
  description:
    "A real-world multiplayer laser-tag game on ordinary phones. Camera aim, live HUD, server-validated hits.",
  applicationName: "FANTOM",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#04070d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
