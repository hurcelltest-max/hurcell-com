# HurCELL Satışa Çıkış Master Kontrol Listesi (Master Launch Checklist)

Bu belge, HurCELL sisteminin 15 Temmuz 2026 Çarşamba günü satışa çıkışı için hazır bulunuşluk denetimi durumlarını listelemektedir.

## 15 Maddelik Ana Sistem Durumu

| No | Sistem | Durum | Kanıt | Satışa Engel mi? | Sonraki Geliştirme Paketi | Son Doğrulama Tarihi |
|---|---|---|---|---|---|---|
| 1 | Site / Vitrin | ✅ PASS | [sitemap.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/sitemap.ts) | Hayır | - | 14.07.2026 |
| 2 | Kapıda Ödeme / Sipariş | ✅ PASS | [checkout/page.tsx](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/checkout/page.tsx) | Hayır | - | 14.07.2026 |
| 3 | Veresiye Güvenliği | 🟡 PARTIAL | [credit_system_tables.sql](file:///C:/Users/hurce/Documents/hurcell-com/supabase/migrations/20260708135124_credit_system_tables.sql) | Hayır (Pasif kalacak) | Hukukçu incelemesi beklenmektedir. Teknik veri güvenliği ve RLS tamdır. | 14.07.2026 |
| 4 | Sözleşme/OTP Teknik Delil | ✅ PASS | [accept-agreement/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/cari/accept-agreement/route.ts) | Hayır | Teknik delil altyapısı güçlü, hukukçu incelemesi bekleniyor. | 14.07.2026 |
| 5 | Taksit Sistemi | ❌ MISSING | Uygulama kodu veya tablo mevcut değil | Hayır (Pasif kalacak) | Taksit tabloları, hesap kesim günleri ve admin taksit takip ekranı eklenecektir. | 14.07.2026 |
| 6 | Finans / Taksit Kuralları | ❌ MISSING | Uygulama kodu mevcut değil | Hayır (Pasif kalacak) | 750 TL minimum, ön ödeme, vade farkı ve kalan tutarın 3'e bölünmesi uygulanacaktır. | 14.07.2026 |
| 7 | Borç/Gecikme SMS Bildirimleri | ❌ MISSING | [transactional.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/lib/sms/transactional.ts#L171) | Hayır (Pasif kalacak) | Cari bildirim SMS türleri ve şablonları aktif edilecektir. | 14.07.2026 |
| 8 | Finansal Raporlama | ❌ MISSING | Admin klasöründe rapor şeması yok | Hayır | Günlük satış, kâr, cari alacak ve gecikme raporları oluşturulacaktır. | 14.07.2026 |
| 9 | Servis Veresiye Sistemi | 🟡 PARTIAL | [TransactionForm.tsx](file:///C:/Users/hurce/Documents/hurcell-com/web/src/components/admin/cari/TransactionForm.tsx) | Hayır | Servis borçları admin tarafından manuel işlenebilir. | 14.07.2026 |
| 10 | Tüm Kanallarda Stok | 🟡 PARTIAL | [complete_device_sale](file:///C:/Users/hurce/Documents/hurcell-com/supabase/migrations/20260605120000_device_sales_contracts.sql#L165) | Hayır | Web siparişi ve fiziksel cihaz satışı stok düşer. Cari satışlarda manuel düşülmektedir. | 14.07.2026 |
| 11 | Instagram Mağaza / Katalog | ❌ MISSING | Katalog XML feed veya API kodu yok | Hayır | Facebook/Meta katalog feed entegrasyonu kurulacaktır. | 14.07.2026 |
| 12 | AG-Claude-Ollama AI | ❌ MISSING | Altyapı kodu mevcut değil | Hayır | Ollama/Claude entegrasyonu ile otomatik mesaj sınıflandırma. | 14.07.2026 |
| 13 | Otomatik Müşteri Cevap | ❌ MISSING | Altyapı kodu mevcut değil | Hayır | Webhook ve mesaj/yorum kuyruğu oluşturulacaktır. | 14.07.2026 |
| 14 | Güvenli Otomasyon Akışı | ❌ MISSING | Entegrasyon kodu mevcut değil | Hayır | AI asistan ve otomatik satış link entegrasyonu kurulacaktır. | 14.07.2026 |
| 15 | Mobil Uygulama Hazırlığı | 🟡 PARTIAL | [App.tsx](file:///C:/Users/hurce/Documents/hurcell-com/mobile/App.tsx) | Hayır | Expo React Native ve Capacitor konfigürasyonları mevcut, içi boştur. | 14.07.2026 |

---

## Güvenlik Stabilizasyonu Ek Maddesi

| No | Güvenlik İyileştirmesi | Durum | Kanıt / Değişen Dosyalar | Satışa Engel mi? | Çözüm Detayı |
|---|---|---|---|---|---|
| G1 | Public Service-Role API Açığı | ✅ FIXED | [require-admin-api.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/lib/admin/require-admin-api.ts)<br>[device/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/sales/device/route.ts)<br>[products/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/sales/products/route.ts)<br>[dhl/cancel-shipment/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/cancel-shipment/route.ts)<br>[dhl/update-shipment/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/update-shipment/route.ts)<br>[dhl/order-status/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/order-status/route.ts)<br>[dhl/shipment-detail/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/shipment-detail/route.ts)<br>[dhl/track-shipment/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/track-shipment/route.ts)<br>[dhl/test/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/test/route.ts)<br>[dhl/create-recipient/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/create-recipient/route.ts)<br>[dhl/create-order/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/create-order/route.ts)<br>[dhl/create-barcode/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/create-barcode/route.ts)<br>[dhl/create-shipment-flow/route.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/app/api/dhl/create-shipment-flow/route.ts)<br>[middleware.ts](file:///C:/Users/hurce/Documents/hurcell-com/web/src/middleware.ts) | Evet (Launch öncesi çözüldü) | `/api/sales/*` ve `/api/dhl/*` API endpointleri route düzeyinde `requireAdminApi` doğrulamasıyla kapatılmış ve middleware düzeyinde Basic Auth kapsamına alınmıştır. |
