import React from 'react'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Printer, Calendar, ArrowLeft, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  params: Promise<{
    saleCode: string
  }>
}

export default async function SaleContractDetailPage({ params }: PageProps) {
  const { saleCode } = await params
  
  // TODO: Yetkisiz erişimleri engellemek için oturum kontrolü eklenmeli.
  // Bu sayfa şu anda Server Side (SUPABASE_SERVICE_ROLE_KEY) ile güvenli sorgulanmaktadır ancak public URL'i tahmin eden herkes
  // sözleşmeyi görebilir. Canlı ortamda personelin oturum açıp açmadığı (örn. auth.getUser()) kontrol edilmeli, 
  // ya da müşterinin kendi satış koduna ait sorgusu için ek doğrulama (örn. telefon/T.C. No son 4 hanesi) istenmelidir.
  
  const supabase = createSupabaseAdminClient()

  // Query contract from database
  const { data: contract, error } = await supabase
    .from('device_sale_contracts')
    .select('*')
    .eq('sale_code', saleCode)
    .single()

  if (error || !contract) {
    notFound()
  }

  // Parse fields safely
  const customer = contract.customer as Record<string, any>
  const device = contract.device as Record<string, any>
  const cosmetic = contract.cosmetic as Record<string, any>
  const tests = (contract.tests || {}) as Record<string, boolean>
  const knownIssues = (contract.known_issues || []) as string[]
  const includedItems = (contract.included_items || []) as string[]
  const snapshot = (contract.stock_snapshot || {}) as Record<string, any>

  const conditionLabels: Record<string, string> = {
    new_sealed: 'Sıfır Kapalı Kutu',
    new_open_box: 'Sıfır Açık Kutu',
    display: 'Teşhir Ürünü',
    used: 'İkinci El',
    refurbished: 'Yenilenmiş',
    authorized_refurbished: 'Yetkili Onarıcı Raporlu Yenilenmiş',
  }

  const typeLabels: Record<string, string> = {
    phone: 'Cep Telefonu',
    tablet: 'Tablet',
    computer: 'Bilgisayar',
    accessory: 'Aksesuar / Diğer',
    other: 'Diğer',
  }

  const isSealed = contract.device_condition_type === 'new_sealed'
  const isAuthorizedRefurbished = contract.device_condition_type === 'authorized_refurbished'
  const isAccessory = contract.device_category === 'accessory' || device.type === 'accessory'

  let title = 'CİHAZ SATIŞ, TEST VE TESLİM PROTOKOLÜ'
  if (isAccessory) {
    title = 'ÜRÜN SATIŞ VE TESLİM PROTOKOLÜ'
  } else if (isSealed) {
    title = 'SIFIR KAPALI KUTU CİHAZ SATIŞ VE TESLİM PROTOKOLÜ'
  } else if (isAuthorizedRefurbished) {
    title = 'YETKİLİ ONARICI RAPORLU YENİLENMİŞ CİHAZ SATIŞ, TEST VE TESLİM PROTOKOLÜ'
  }

  return (
    <main className="min-h-screen bg-slate-50 pt-28 pb-20 font-sans print:bg-white print:pt-0 print:pb-0">
      <div className="mx-auto max-w-4xl px-4 md:px-8 print:px-0">
        
        {/* Actions bar */}
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link
            href="/cihaz-kabul-protokolu"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Geri Dön
          </Link>
          
          <button
            onClick={undefined}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-bold shadow-md transition"
          >
            <span onClick={() => {
              if (typeof window !== 'undefined') window.print()
            }} className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> Yazdır / PDF Olarak Kaydet
            </span>
          </button>
        </div>

        {/* Main Document */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 md:p-10 print:border-none print:shadow-none print:p-0">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between border-b border-slate-200 pb-6 mb-8 gap-4">
            <div>
              <div className="flex items-center gap-2 text-blue-600 font-bold text-2xl tracking-tighter mb-1">
                <span>HUR</span><span className="text-slate-800">CELL</span>
              </div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{title}</p>
            </div>
            <div className="md:text-right space-y-1">
              <p className="text-xs text-slate-500">Protokol Kodu</p>
              <p className="font-mono text-sm font-bold text-blue-700">{contract.sale_code}</p>
              <div className="flex items-center gap-1.5 md:justify-end text-xs text-slate-600 mt-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{new Date(contract.created_at).toLocaleString('tr-TR')}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Alıcı Bilgileri */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-1">1. Alıcı Bilgileri</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Ad Soyad:</dt><dd className="font-semibold text-slate-900">{customer.fullName}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">T.C. Kimlik:</dt><dd className="font-mono text-slate-900">{customer.nationalId || '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Telefon:</dt><dd className="text-slate-900">{customer.phone}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">E-posta:</dt><dd className="text-slate-900">{customer.email || '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Adres:</dt><dd className="text-slate-900 text-right max-w-[200px] truncate">{customer.address || '-'}</dd></div>
              </dl>
            </div>

            {/* Cihaz Bilgileri */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-1">2. Cihaz Bilgileri</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Kategori / Sınıf:</dt><dd className="font-semibold text-slate-900">{typeLabels[contract.device_category || device.type] || contract.device_category || 'Aksesuar'} / {conditionLabels[contract.device_condition_type || device.condition] || contract.device_condition_type || 'Standart'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Marka / Model:</dt><dd className="font-semibold text-slate-900">{device.brand} {device.model}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">IMEI / Seri No:</dt><dd className="font-mono text-slate-900">{device.imeiOrSerial}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Renk / Hafıza:</dt><dd className="text-slate-900">{device.color || '-'} / {device.storageRam || '-'}</dd></div>
                
                {device.wifiCellular && (
                  <div className="flex justify-between"><dt className="text-slate-500">Wi-Fi / Cellular:</dt><dd className="text-slate-900">{device.wifiCellular}</dd></div>
                )}
                {device.hasPenKeyboard && (
                  <div className="flex justify-between"><dt className="text-slate-500">Kalem & Klavye:</dt><dd className="text-slate-900">{device.hasPenKeyboard}</dd></div>
                )}
                {device.processor && (
                  <div className="flex justify-between"><dt className="text-slate-500">İşlemci:</dt><dd className="text-slate-900">{device.processor}</dd></div>
                )}
                {device.ssdCapacity && (
                  <div className="flex justify-between"><dt className="text-slate-500">SSD / HDD:</dt><dd className="text-slate-900">{device.ssdCapacity}</dd></div>
                )}
                {device.screenSize && (
                  <div className="flex justify-between"><dt className="text-slate-500">Ekran Boyutu:</dt><dd className="text-slate-900">{device.screenSize}</dd></div>
                )}
                {device.batteryCycle && (
                  <div className="flex justify-between"><dt className="text-slate-500">Batarya Döngüsü:</dt><dd className="text-slate-900">{device.batteryCycle}</dd></div>
                )}
                {device.os && (
                  <div className="flex justify-between"><dt className="text-slate-500">İşletim Sistemi:</dt><dd className="text-slate-900">{device.os}</dd></div>
                )}
              </dl>
            </div>
          </div>

          {!isAccessory && (
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              {/* Kozmetik Kabul Durumu (Kapalı kutu değilse gösterilir) */}
              {!isSealed ? (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-1">3. Kozmetik Durum</h3>
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between"><dt className="text-slate-500">Ekran:</dt><dd className="text-slate-900">{cosmetic.screen || '-'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Kasa / Gövde:</dt><dd className="text-slate-900">{cosmetic.body || '-'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Arka Kapak:</dt><dd className="text-slate-900">{cosmetic.backCover || '-'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Kamera Camı:</dt><dd className="text-slate-900">{cosmetic.cameraLens || '-'}</dd></div>
                    {cosmetic.notes && (
                      <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg leading-relaxed">
                        <strong>Notlar:</strong> {cosmetic.notes}
                      </div>
                    )}
                  </dl>
                </div>
              ) : (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-1">3. Kozmetik Durum</h3>
                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl">
                    Cihaz sıfır kapalı kutu (jelatinli/mühürlü) olarak teslim edildiğinden fiziki kozmetik inceleme kutu açılmadan yapılamamıştır. Kutu dış ambalajı hasarsızdır.
                  </p>
                </div>
              )}

              {/* Test Formu */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-1">
                  {isSealed ? '4. Kutu Doğrulama Kontrolleri' : '4. Teknik Fonksiyon Raporu'}
                </h3>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {Object.entries(tests).map(([testName, passed]) => (
                    <div key={testName} className="flex items-center gap-1.5">
                      {passed ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-red-500 font-bold">✗</span>
                      )}
                      <span className="text-slate-700 truncate">{testName}</span>
                    </div>
                  ))}
                  {Object.keys(tests).length === 0 && (
                    <p className="text-slate-500 italic col-span-2">Kontrol kaydı bulunmamaktadır.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isAccessory && (
            <div className="mt-8 grid gap-8 md:grid-cols-2 border-t border-slate-100 pt-6">
              {/* Bilinen Kusurlar (Sadece kullanılmış ise) */}
              {!isSealed ? (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">5. Bilinen Kusurlar</h3>
                  <ul className="space-y-1 text-xs text-slate-700 list-disc list-inside">
                    {knownIssues.map((issue, idx) => (
                      <li key={idx} className="leading-relaxed">{issue}</li>
                    ))}
                    {knownIssues.length === 0 && (
                      <li className="list-none italic text-slate-500">Bilinen kusur bildirilmemiştir.</li>
                    )}
                  </ul>
                </div>
              ) : (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">5. Garanti Kapsamı Notu</h3>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Cihaz orijinal mühürlü kutu olduğundan HurCELL teknik incelemesine tabi tutulmamıştır. Üretici distribütör sınırlı garantisine tabidir.
                  </p>
                </div>
              )}

              {/* Beraberinde Verilenler */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">6. Teslim Edilen Ekipmanlar</h3>
                <ul className="space-y-1 text-xs text-slate-700 list-disc list-inside">
                  {includedItems.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">{item}</li>
                  ))}
                  {includedItems.length === 0 && (
                    <li className="list-none italic text-slate-500">Ek ürün belirtilmemiştir.</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Snapshot verisi */}
          {snapshot && snapshot.name && (
            <div className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">7. Satış Anındaki Stok Snapshot Kaydı</h3>
              <div className="text-[10px] text-slate-600 bg-slate-50 p-4 rounded-2xl grid grid-cols-2 gap-2 print:bg-white">
                <div><strong>Ürün Adı:</strong> {snapshot.name}</div>
                <div><strong>Marka/Model:</strong> {snapshot.brand} {snapshot.model}</div>
                <div><strong>Barkod / SKU:</strong> {snapshot.barcode}</div>
                <div><strong>IMEI / Seri No:</strong> {snapshot.serial_number || snapshot.imei_1 || '-'}</div>
                <div><strong>Stok Durum Sınıfı:</strong> {conditionLabels[snapshot.device_condition_type] || snapshot.device_condition_type || 'Aksesuar / Standart'}</div>
                <div><strong>Garanti/Servis Bilgisi:</strong> {snapshot.warranty_status || snapshot.service_report_no || '-'}</div>
              </div>
            </div>
          )}

          {/* Protokol Metni */}
          <div className="mt-8 border-t border-slate-200 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">8. Protokol Metni & Yasal Taahhütler</h3>
            <div className="max-h-48 overflow-y-auto text-[10px] text-slate-600 bg-slate-50 p-4 rounded-2xl leading-relaxed whitespace-pre-wrap font-mono print:max-h-none print:bg-white print:p-0">
              {contract.contract_text}
            </div>
          </div>

          {/* İmzalar */}
          <div className="mt-10 border-t border-slate-200 pt-8 grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">HurCELL Teslim Eden Yetkili</p>
              <div className="h-24 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl flex items-center justify-center text-[10px] text-slate-500">
                Kaşe / İmza
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Alıcı / Müşteri İmzası</p>
              {contract.signature_data_url ? (
                <div className="h-24 border border-slate-200 rounded-2xl overflow-hidden bg-white flex items-center justify-center p-2">
                  <img
                    src={contract.signature_data_url}
                    alt="Müşteri İmzası"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="h-24 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl flex items-center justify-center text-[10px] text-slate-500">
                  Islak İmza
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  )
}
