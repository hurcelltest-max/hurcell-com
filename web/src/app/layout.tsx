import { CartProvider } from "@/components/cart-provider";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Toaster } from "@/components/ui/sonner";
import { WhatsAppButton } from "@/components/site/whatsapp-button";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HurCELL | Telefon, Aksesuar, Teknik Servis ve Kargo Hizmetleri",
  description: "Ä°zmir'de telefon, tablet, bilgisayar, aksesuar, teknik servis, DHL gÃ¶nderi, Western Union ve baskÄ± hizmetleri sunan HurCELL'in online maÄŸazasÄ±.",
  keywords: "telefon, tablet, bilgisayar, aksesuar, teknik servis, Ä°zmir, DHL, Western Union",
  metadataBase: new URL("https://www.hurcell.com"),
  canonical: "https://www.hurcell.com",
  openGraph: {
    title: "HurCELL | Telefon, Aksesuar, Teknik Servis ve Kargo Hizmetleri",
    description: "Ä°zmir'de telefon, tablet, bilgisayar, aksesuar, teknik servis, DHL gÃ¶nderi, Western Union ve baskÄ± hizmetleri sunan HurCELL'in online maÄŸazasÄ±.",
    url: "https://www.hurcell.com",
    type: "website",
    siteName: "HurCELL",
    locale: "tr_TR",
  },
  twitter: {
    card: "summary_large_image",
    title: "HurCELL | Telefon, Aksesuar, Teknik Servis ve Kargo Hizmetleri",
    description: "Ä°zmir'de telefon, tablet, bilgisayar, aksesuar, teknik servis, DHL gÃ¶nderi, Western Union ve baskÄ± hizmetleri sunan HurCELL'in online maÄŸazasÄ±.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "HurCELL",
    description: "Ä°zmir'de telefon, tablet, bilgisayar, aksesuar, teknik servis, DHL gÃ¶nderi, Western Union ve baskÄ± hizmetleri sunan online maÄŸazasÄ±.",
    url: "https://www.hurcell.com",
    areaServed: {
      "@type": "City",
      name: "Ä°zmir",
      "@id": "https://www.wikidata.org/wiki/Q35928",
    },
    serviceArea: "TÃ¼rkiye",
  };

  return (
    <html lang="tr">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased min-h-screen bg-background font-sans flex flex-col`}>
        <CartProvider>
          <Navbar />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <Footer />
          <Toaster />
          <WhatsAppButton />
        </CartProvider>
      </body>
    </html>
  );
}

