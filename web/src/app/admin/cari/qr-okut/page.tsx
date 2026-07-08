'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, QrCode, AlertCircle } from 'lucide-react';
import Link from 'next/link';

// Dynamically import html5-qrcode so it doesn't run on the server
// and doesn't bloat the main bundle.
let Html5QrcodeScanner: any;

export default function QrScannerPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [scannerReady, setScannerReady] = useState(false);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    // Dynamic import of the library
    import('html5-qrcode').then((module) => {
      Html5QrcodeScanner = module.Html5QrcodeScanner;
      setScannerReady(true);
    }).catch(err => {
      console.error("Failed to load html5-qrcode", err);
      setError("QR okuyucu yüklenemedi. Lütfen sayfayı yenileyin.");
    });
  }, []);

  const extractCardToken = (text: string) => {
    try {
      const url = new URL(text);
      // Ensure https for prod, http for local
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      
      const isProdHost = url.protocol === 'https:' && (url.host === 'www.hurcell.com' || url.host === 'hurcell.com');
      const isLocalHost = url.protocol === 'http:' && (url.host === 'localhost' || url.host === 'localhost:3000');
      
      if ((isProdHost || isLocalHost) && url.pathname.startsWith('/admin/cari/kart/')) {
        return url.pathname.split('/').pop() || null;
      }
      return null;
    } catch (e) {
      // Relative path handling
      if (text.startsWith('/admin/cari/kart/')) {
        return text.split('/').pop() || null;
      }
      return null;
    }
  };

  useEffect(() => {
    if (!scannerReady || !Html5QrcodeScanner) return;

    const onScanSuccess = (decodedText: string, decodedResult: any) => {
      if (hasScannedRef.current) return;

      const token = extractCardToken(decodedText);

      if (token && /^[a-f0-9\-]{36}$/i.test(token)) {
        hasScannedRef.current = true;
        
        // Stop scanner immediately on success
        scanner.clear().then(() => {
          router.push(`/admin/cari/kart/${token}`);
        }).catch((err: any) => {
          console.error("Failed to clear scanner", err);
          router.push(`/admin/cari/kart/${token}`); // proceed anyway
        });
      } else {
        setError('Geçersiz QR Kod. Lütfen sadece HurCELL müşteri kartı okutun.');
        setTimeout(() => setError(''), 5000);
      }
    };

    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    scanner.render(onScanSuccess, (error: any) => {
      // Ignore scan errors, they happen continuously when no QR is found
    });

    return () => {
      if (!hasScannedRef.current) {
        scanner.clear().catch((error: any) => {
          console.error("Failed to clear html5QrcodeScanner. ", error);
        });
      }
    };
  }, [scannerReady, router]);

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
      <Link href="/admin/cari" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" />
        Aramaya Dön
      </Link>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-900 p-6 text-center">
          <QrCode className="w-12 h-12 text-blue-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white mb-2">QR ile Müşteri Bul</h1>
          <p className="text-gray-400 text-sm">
            Müşterinin dijital kartındaki QR kodunu kameraya gösterin.
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="relative">
            {!scannerReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-xl z-10">
                <p className="text-gray-500">Kamera yükleniyor...</p>
              </div>
            )}
            <div id="reader" className="w-full bg-gray-50 rounded-xl overflow-hidden border border-gray-200"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
