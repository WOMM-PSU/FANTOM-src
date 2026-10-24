import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FANTOM — real-world laser tag",
    template: "%s · FANTOM",
  },
  description:
    "Turn phones into real-world laser tag equipment. Create a match, invite friends, and get everyone into the same live lobby.",
  applicationName: "FANTOM",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080f",
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
