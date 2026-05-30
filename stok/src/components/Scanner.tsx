"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ScannerProps = {
  onDecode: (decodedText: string) => void;
  onError?: (message: string) => void;
  buttonLabel?: string;
};

export default function Scanner({
  onDecode,
  onError,
  buttonLabel = "Kamerayı Aç",
}: ScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Kamera kapalı. Butona basın."
  );
  
  // Library preload states
  const [qrCodeLib, setQrCodeLib] = useState<any>(null);
  const [libError, setLibError] = useState<string | null>(null);
  
  // Camera error details for troubleshooting UI
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  const html5QrCodeRef = useRef<any | null>(null);
  const lastDecodedRef = useRef<string | null>(null);
  
  const containerId = useMemo(
    () => `qr-reader-${Math.random().toString(36).slice(2)}`,
    []
  );

  // 1. Preload the library inside useEffect (client-side only, no SSR ReferenceError)
  useEffect(() => {
    let isMounted = true;
    console.log("[Scanner] html5-qrcode kütüphanesi istemci tarafında önden yükleniyor...");

    import("html5-qrcode")
      .then((module) => {
        if (isMounted) {
          setQrCodeLib(module);
          console.log("[Scanner] html5-qrcode başarıyla önden yüklendi (preloaded).");
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("[Scanner] html5-qrcode yükleme hatası:", err);
          setLibError(err.message || String(err));
        }
      });

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, []);

  const stopScanner = async () => {
    const html5QrCode = html5QrCodeRef.current;
    if (html5QrCode) {
      try {
        console.log("[Scanner] Kamera akışı sonlandırılıyor...");
        await html5QrCode.stop();
        await html5QrCode.clear();
      } catch (err) {
        console.warn("[Scanner] Kapatma temizlik uyarısı:", err);
      }
      html5QrCodeRef.current = null;
    }

    setIsScanning(false);
    setStatusMessage("Kamera kapalı. Butona basın.");
  };

  const startScanner = async () => {
    // If already scanning, clicking button will stop it
    if (isScanning) {
      await stopScanner();
      return;
    }

    setCameraError(null);
    setShowTroubleshoot(false);

    console.log("--- [Scanner] Kamera Başlatma Süreci Başladı ---");

    // Check if there was a library loading error
    if (libError) {
      const msg = `Kütüphane yüklenemedi: ${libError}. Lütfen sayfayı yenileyin.`;
      console.error(msg);
      setStatusMessage(msg);
      setCameraError(msg);
      return;
    }

    // Check if the library is not yet preloaded
    if (!qrCodeLib) {
      const msg = "Kamera bileşenleri yükleniyor, lütfen 1-2 saniye sonra tekrar deneyin.";
      console.warn(msg);
      setStatusMessage(msg);
      return;
    }

    // 2. Perform iOS, Safari, Chrome and WebRTC diagnostics
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isChrome = /CriOS/i.test(navigator.userAgent); // Chrome on iOS
    
    console.log("[Scanner] Tanımlanan Ortam:");
    console.log("  - iOS Cihazı mı:", isIOS);
    console.log("  - Safari Tarayıcı mı:", isSafari);
    console.log("  - Chrome iOS Tarayıcı mı:", isChrome);
    console.log("  - HTTPS Protokolü mü:", window.location.protocol === "https:");
    console.log("  - navigator.mediaDevices Desteği var mı:", !!navigator.mediaDevices);
    console.log("  - getUserMedia Desteği var mı:", !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = qrCodeLib;
      
      console.log("[Scanner] Html5Qrcode nesnesi oluşturuluyor. Hedef container:", containerId);
      const qrCode = new Html5Qrcode(containerId);
      html5QrCodeRef.current = qrCode;

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 280 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.PDF_417,
        ],
      };

      console.log("[Scanner] Kamera akışı senkron click handler içinden tetikleniyor...");
      
      // Since html5-qrcode is already preloaded, this async call is instantly executed
      // within the synchronous call stack of the user's click gesture.
      await qrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          if (!decodedText) return;
          if (lastDecodedRef.current === decodedText) return;

          lastDecodedRef.current = decodedText;
          setTimeout(() => {
            lastDecodedRef.current = null;
          }, 1400);

          onDecode(decodedText);
        },
        () => undefined
      );

      console.log("[Scanner] Kamera AKIŞI BAŞARIYLA BAŞLATILDI!");
      setIsScanning(true);
      setStatusMessage("Kamera aktif. Barkod veya QR okutun.");
    } catch (error: any) {
      console.error("[Scanner] Kamera Başlatılırken Kritik Hata Alındı:", error);
      
      let rawErrorMsg = "";
      if (error instanceof Error) {
        rawErrorMsg = error.message;
      } else if (typeof error === "string") {
        rawErrorMsg = error;
      } else if (error && typeof error === "object") {
        rawErrorMsg = error.message || JSON.stringify(error);
      } else {
        rawErrorMsg = "Bilinmeyen WebRTC veya Donanım hatası.";
      }

      setCameraError(rawErrorMsg);
      setShowTroubleshoot(true);

      let msg = `Kamera başlatılamadı. Hata: ${rawErrorMsg}`;
      setStatusMessage(msg);
      onError?.(msg);
      
      html5QrCodeRef.current = null;
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm shadow-slate-900/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={startScanner}
          className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60 active:scale-95 cursor-pointer shadow-md shadow-sky-500/10"
        >
          {isScanning ? "Kamerayı Kapat" : buttonLabel}
        </button>

        <p className="text-sm font-medium text-slate-700">{statusMessage}</p>
      </div>

      {/* Troubleshooting and Help UI for iOS / Chrome / Safari */}
      {showTroubleshoot && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 text-sm text-slate-700 backdrop-blur-sm animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <span className="text-lg">💡</span>
            <div className="space-y-3">
              <p className="font-semibold text-rose-800">
                Kamera İzni veya Erişim Problemi Teşhis Edildi
              </p>
              
              <div className="text-xs text-rose-700 font-mono bg-rose-50 p-2 rounded-lg border border-rose-100 break-all">
                Sistem Raporu: {cameraError}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                iPhone Safari veya Chrome üzerinde kamera açılmadığında lütfen aşağıdaki adımları kontrol edin:
              </p>
              
              <ul className="list-disc pl-4 space-y-1.5 text-xs text-slate-600">
                <li>
                  <strong className="text-slate-800">Safari Kamera İznini Kontrol Edin:</strong> iPhone ayarlarınızdan <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">Ayarlar &gt; Safari &gt; Kamera</code> yolunu izleyin ve izin durumunun "Sor" veya "İzin Ver" olarak ayarlandığından emin olun.
                </li>
                <li>
                  <strong className="text-slate-800">Chrome iOS Kamera İznini Kontrol Edin:</strong> <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">Ayarlar &gt; Chrome</code> menüsüne giderek Kamera seçeneğinin aktif olduğunu kontrol edin.
                </li>
                <li>
                  <strong className="text-slate-800">Sayfayı Yenileyin:</strong> Bazen tarayıcılar donanımı serbest bırakmaz. Sayfayı tamamen yenileyip tekrar "Kamerayı Aç" butonuna basın.
                </li>
                <li>
                  <strong className="text-slate-800">Başka Sekmeleri Kapatın:</strong> Arka planda kamerayı kullanan başka bir tarayıcı sekmesi veya uygulama (örneğin WhatsApp Web, WebRTC test siteleri) açıksa kapatın.
                </li>
                <li>
                  <strong className="text-slate-800">HTTPS Bağlantısı:</strong> Kameranın açılabilmesi için sitenin güvenli bağlantı (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">https://</code>) ile açılmış olması zorunludur.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Always-sized relative container holding both the real html5-qrcode container and the absolute React placeholder */}
      <div className="relative min-h-[320px] rounded-3xl bg-slate-100 overflow-hidden border border-dashed border-slate-200">
        
        {/* 1. Real html5-qrcode container - always present, always block, always full size */}
        <div
          id={containerId}
          className="w-full min-h-[320px] rounded-3xl"
        />

        {/* 2. React-managed placeholder - overlays absolutely when not scanning */}
        {!isScanning && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-slate-400 text-xs bg-slate-100 pointer-events-none">
            <div className="text-center space-y-2 p-6">
              <span className="text-2xl block animate-bounce">📷</span>
              <p className="font-semibold text-slate-500">Kamera Önizlemesi Burada Görünecektir</p>
              <p className="text-[10px] text-slate-400">Butona bastığınızda tarayıcı kamera izni isteyecektir.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

