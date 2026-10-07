import type { Metadata } from "next";
import "./globals.css";

/**
 * app/layout.tsx
 * -----------------------------------------------------------------------
 * page.tsx es un Client Component ("use client"), y Next.js no permite
 * exportar `metadata` desde un Client Component. Por eso los metadatos
 * SEO van aquí, en el layout (Server Component), que envuelve a page.tsx.
 *
 * IMPORTANTE: el import "./globals.css" de arriba es el que carga las
 * reglas de Tailwind (@tailwind base/components/utilities). Sin esa línea,
 * todas las clases de Tailwind en page.tsx quedan "sin efecto" y la app se
 * ve sin estilo, aunque el código esté bien escrito.
 * -----------------------------------------------------------------------
 */

export const metadata: Metadata = {
  title: "Calculadora Laboral Chile: Sueldo Líquido, Finiquito y Vacaciones",
  description:
    "Calcula tu sueldo líquido, tu finiquito y tus vacaciones proporcionales en Chile. Desglose de AFP, salud, seguro de cesantía e impuesto único. Gratis y actualizado.",
  keywords: [
    "calculadora sueldo líquido chile",
    "calculadora finiquito chile",
    "vacaciones proporcionales chile",
    "sueldo bruto a líquido",
    "calculadora afp chile",
  ],
  openGraph: {
    title: "Calculadora Laboral Chile: Sueldo Líquido, Finiquito y Vacaciones",
    description:
      "Sueldo líquido, finiquito y vacaciones proporcionales en una sola herramienta, con desglose de AFP, salud, cesantía e impuesto único.",
    locale: "es_CL",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
