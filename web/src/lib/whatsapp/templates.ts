/**
 * WhatsApp Mesaj Şablonları (Paket O5 - Standart Türkçe Şablonlar - Gerçek Şema Hizalı)
 */

export const WhatsAppMessageTemplates = {
  // A. Kayıtlı Müşteri Karşılama
  REGISTERED_WELCOME: (name: string) =>
    `Merhaba ${name}, kaydınızı buldum. Hangi ürünü almak istiyorsunuz?`,

  // B. Yeni Müşteri Kayıt Çağrısı
  UNREGISTERED_PROMPT: () =>
    `Bu telefon numarasıyla kayıtlı müşteri bulamadım. Alışverişe devam etmek için kısa kayıt işlemini tamamlamamız gerekiyor.`,

  // C. Ürün Stok Bilgilendirme
  PRODUCT_STOCK_INFO: (productName: string, price: number, stock: number) =>
    `${productName} şu anda stokta. Fiyatı ${price.toLocaleString('tr-TR')} TL, mevcut stok ${stock} adet. Kaç adet almak istiyorsunuz?`,

  // C2. Ürün Stokta Yok Bilgilendirme
  PRODUCT_OUT_OF_STOCK: (productName: string) =>
    `Üzgünüz, ${productName} ürünü şu anda stoklarımızda tükenmiştir. Alternatif ürünler veya stok güncellendiğinde bilgi almak için mağazamızla görüşebilirsiniz.`,

  // D. Kredili Müşteri Kaydı Bulundu — Manuel Onay Gerekli (Gerçek Şema Hizası)
  CREDIT_RECORD_FOUND_MANUAL_REVIEW: () =>
    `Kredi/cari kaydınızı buldum. Talebiniz limit ve hesap durumu kontrolü için HurCELL ekibinin manuel onayına gönderilecektir.`,

  // E. Kredi Başvurusu İncelemede (pending_review)
  CREDIT_PENDING_REVIEW: () =>
    `Kredi/cari başvurunuz henüz inceleme aşamasındadır (pending_review). Talebiniz değerlendirilmek üzere HurCELL yönetici onayına sunulacaktır.`,

  // F. Onaya Gönderildi
  ORDER_SUBMITTED_FOR_APPROVAL: () =>
    `Talebiniz HurCELL ekibinin onayına gönderildi. Sonucu buradan size bildireceğiz.`,

  // G. Onaylandı
  ORDER_APPROVED: () =>
    `Talebiniz onaylandı. Siparişiniz hazırlanıyor.`,

  // H. Reddedildi
  ORDER_REJECTED: () =>
    `Talebiniz şu anda onaylanamadı. HurCELL ekibi sizinle iletişime geçecek.`,
};
