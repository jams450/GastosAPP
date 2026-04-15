import type { Metadata } from "next";
import "./globals.css";

const themeInitScript = `
(() => {
  try {
    const saved = localStorage.getItem("theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = saved ? saved === "dark" : systemDark;
    document.documentElement.classList.toggle("dark", shouldUseDark);
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: "GastosApp",
  description: "GastosApp Web"
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
