import type { Metadata } from "next";
import { Big_Shoulders, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

const DESCRIPTION =
  "Five hand gestures drive a theatrical lighting rig. Markerless, browser-based, running on the CPU.";

export const metadata: Metadata = {
  // Needed for absolute og:image URLs — without it Next emits a relative path
  // and most scrapers refuse to resolve it.
  metadataBase: new URL("https://lights.amoghbajpai.com"),
  title: "Lights — gesture cue control",
  description: DESCRIPTION,
  openGraph: {
    title: "Lights — gesture cue control",
    description: DESCRIPTION,
    url: "https://lights.amoghbajpai.com",
    siteName: "Lights",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lights — gesture cue control",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
