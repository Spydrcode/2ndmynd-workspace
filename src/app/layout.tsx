import type { Metadata } from "next";
import "./globals.css";

/**
 * Font Configuration
 * 
 * Uses IBM Plex family from Google Fonts by default.
 * For offline/CI builds, set NEXT_OFFLINE_BUILD=true to use system font stack.
 */
const useSystemFonts = process.env.NEXT_OFFLINE_BUILD === "true";

let plexSans: any;
let plexSerif: any;
let plexMono: any;

if (!useSystemFonts) {
  const {
    IBM_Plex_Mono,
    IBM_Plex_Sans,
    IBM_Plex_Serif,
  } = require("next/font/google");

  plexSans = IBM_Plex_Sans({
    variable: "--font-ibm-plex-sans",
    subsets: ["latin"],
    weight: ["300", "400", "500", "600"],
  });

  plexSerif = IBM_Plex_Serif({
    variable: "--font-ibm-plex-serif",
    subsets: ["latin"],
    weight: ["400", "500", "600"],
  });

  plexMono = IBM_Plex_Mono({
    variable: "--font-ibm-plex-mono",
    subsets: ["latin"],
    weight: ["400", "500"],
  });
}

export const metadata: Metadata = {
  title: "2ndmynd Workspace",
  description: "Finite decision artifacts and next steps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontClasses = useSystemFonts 
    ? "font-sans antialiased" 
    : `${plexSans.variable} ${plexSerif.variable} ${plexMono.variable} font-sans antialiased`;
  
  return (
    <html lang="en">
      <body className={fontClasses}>
        {children}
      </body>
    </html>
  );
}
