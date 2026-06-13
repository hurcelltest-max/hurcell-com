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
  title: "HurCELL | Teknoloji Mağazası",
  description: "Minimalist, şık ve lüks teknoloji mağazası.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased min-h-screen bg-background font-sans flex flex-col`}>
        <Navbar />
        <main className="flex-1 flex flex-col">
          {children}
        </main>
        <Footer />
        <Toaster />
        <WhatsAppButton />
      </body>
    </html>
  );
}
