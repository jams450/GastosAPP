import type { Metadata, Viewport } from "next";
import "./globals.css";

const themeInitScript = `
(() => {
  try {
    const saved = localStorage.getItem("theme");
    const shouldUseDark = saved ? saved === "dark" : true;
    document.documentElement.classList.toggle("dark", shouldUseDark);

    // Las variantes data-theme (blue / light-blue) ya no existen: el contrato
    // de diseño tiene un solo tema claro y uno oscuro. Se limpia el atributo
    // por si quedó guardado de una sesión anterior.
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("paletteTheme");
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: "Finanzas personales",
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
