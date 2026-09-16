import type { Metadata, Viewport } from "next";
import "./globals.css";

const themeInitScript = `
(() => {
  try {
    const saved = localStorage.getItem("theme");
    const shouldUseDark = saved ? saved === "dark" : true;
    document.documentElement.classList.toggle("dark", shouldUseDark);

    const savedPalette = localStorage.getItem("paletteTheme");
    const palette = savedPalette === "blue" || savedPalette === "light-blue" ? savedPalette : "light-blue";
    document.documentElement.setAttribute("data-theme", palette);
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: {
    default: "Amitzi Finance",
    template: "%s · Amitzi Finance"
  },
  description: "Amitzi Finance: claridad y control para tus finanzas personales.",
  icons: { icon: "/icon.svg" }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07111f" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7f6" }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
