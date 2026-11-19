import type { Metadata, Viewport } from "next";
import { Inter, Montserrat, IBM_Plex_Sans_Arabic } from "next/font/google";
import { getDict } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { BRAND } from "@/config/brand";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Montserrat({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"], display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: BRAND.product, template: `%s · ${BRAND.product}` },
  description: `${BRAND.subtitle} — ${BRAND.tagline}`,
  applicationName: BRAND.product,
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: BRAND.colors.navy, width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const i18n = await getDict();
  return (
    <html lang={i18n.locale} dir={i18n.dir} className={`${sans.variable} ${display.variable} ${arabic.variable}`}>
      <body>
        <I18nProvider value={i18n}>
          <TooltipProvider>{children}<Toaster /></TooltipProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
