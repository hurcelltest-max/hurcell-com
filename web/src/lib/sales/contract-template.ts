import type { DeviceSaleInput } from './schema'

const conditionLabels: Record<DeviceSaleInput['deviceConditionType'], string> = {
  new_sealed: 'Sıfır Kapalı Kutu',
  new_open_box: 'Sıfır Açık Kutu',
  display: 'Teşhir Ürünü',
  used: 'İkinci El',
  refurbished: 'Yenilenmiş',
  authorized_refurbished: 'Yetkili Onarıcı Raporlu Yenilenmiş',
}

const typeLabels: Record<DeviceSaleInput['deviceCategory'], string> = {
  phone: 'Cep Telefonu',
  tablet: 'Tablet',
  computer: 'Bilgisayar',
  accessory: 'Aksesuar / Diğer',
  other: 'Diğer',
}

function line(value?: string) {
  return value && value.trim() ? value.trim() : '-'
}

export function buildDeviceSaleContractText(input: DeviceSaleInput, saleCode: string) {
  const isSealed = input.deviceConditionType === 'new_sealed'
  const knownIssues = input.knownIssues.filter(Boolean)
  const includedItems = input.includedItems.filter(Boolean)
  
  const passedTests = Object.entries(input.tests)
    .filter(([, passed]) => passed)
    .map(([name]) => name)

  const failedTests = Object.entries(input.tests)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  const isAuthorizedRefurbished = input.deviceConditionType === 'authorized_refurbished'

  // Dynamic Title
  let title = 'CİHAZ SATIŞ, TEST VE TESLİM PROTOKOLÜ'
  if (isSealed) {
    title = 'SIFIR KAPALI KUTU CİHAZ SATIŞ VE TESLİM PROTOKOLÜ'
  } else if (isAuthorizedRefurbished) {
    title = 'YETKİLİ ONARICI RAPORLU YENİLENMİŞ CİHAZ SATIŞ, TEST VE TESLİM PROTOKOLÜ'
  }

  let deviceDetailsSection = `
Kategori: ${typeLabels[input.deviceCategory]}
Durum: ${conditionLabels[input.deviceConditionType]}
Marka/Model: ${line(input.device.brand)} ${line(input.device.model)}
IMEI / Seri No: ${line(input.device.imeiOrSerial)}
Renk: ${line(input.device.color)}
Depolama / RAM: ${line(input.device.storageRam)}
`

  // Add specific fields based on category
  if (input.deviceCategory === 'tablet') {
    deviceDetailsSection += `Wi-Fi / Cellular: ${line(input.device.wifiCellular)}
Kalem / Klavye Dahil mi: ${line(input.device.hasPenKeyboard)}
`
  } else if (input.deviceCategory === 'computer') {
    deviceDetailsSection += `İşlemci: ${line(input.device.processor)}
SSD/HDD Kapasitesi: ${line(input.device.ssdCapacity)}
Ekran Boyutu: ${line(input.device.screenSize)}
Batarya Döngüsü: ${line(input.device.batteryCycle)}
İşletim Sistemi: ${line(input.device.os)}
Adaptör Dahil mi: ${line(input.device.adapterIncluded)}
`
  }

  deviceDetailsSection += `Kutu Durumu: ${line(input.device.boxStatus)}
Batarya Sağlığı: ${line(input.device.batteryHealth)}
Tedarikçi / Servis Rapor No: ${line(input.device.supplierReportNo)}
Satış Bedeli: ${typeof input.salePrice === 'number' ? input.salePrice.toLocaleString('tr-TR') + ' TL' : '-'}
Adet: ${input.quantity}
`

  if (isSealed) {
    // A) Sıfır Kapalı Kutu Cihaz Satış Protokolü Metni
    return `${title}

Protokol Kodu: ${saleCode}
Tarih: ${new Date().toLocaleString('tr-TR')}
Kanal: ${input.channel === 'store' ? 'Mağaza Satışı' : 'Online / Dijital Satış'}

1. MÜŞTERİ BİLGİLERİ
Ad Soyad: ${line(input.customer.fullName)}
T.C. Kimlik No: ${line(input.customer.nationalId)}
Telefon: ${line(input.customer.phone)}
E-posta: ${line(input.customer.email)}
Adres: ${line(input.customer.address)}

2. CİHAZ BİLGİLERİ
${deviceDetailsSection}
3. SIFIR KAPALI KUTU TAAHHÜTNAMESİ VE ŞARTLAR
A. Teslim edilen cihaz, üretici veya distribütör firma tarafından orijinal fabrika ortamında paketlenmiş, güvenlik bantları veya jelatinleri açılmamış sıfır ve kapalı kutu üründür.
B. HurCELL, cihaz teslimi öncesinde kutuyu açmamış, cihaz üzerinde herhangi bir donanımsal veya yazılımsal teknik test yapmamıştır. 
C. Kutu üzerindeki IMEI ve seri numarası alıcı ile birlikte gözle kontrol edilerek faturaya ve bu teslim protokolüne işlenmiş olup, doğruluğu teyit edilmiştir.
D. Cihazın fabrika çıkışlı üretim veya yazılım hataları (ayıp), doğrudan üretici, ithalatçı veya ilgili markanın yetkili servislerinin garanti prosedürlerine tabidir. Alıcı, olası arıza veya ayıplı mal bildirimlerinde, yetkili servis istasyonu tarafından verilecek teknik raporun esas alınacağını kabul eder.
E. Kapalı kutu açıldıktan sonra oluşabilecek düşme, darbe, kırılma, sıvı teması, yetkisiz servis veya şahıs müdahaleleri, kullanıcı hesap kilitleri (Apple ID, iCloud, Google vb.) ve veri kayıplarından HurCELL sorumlu tutulamaz. Olası tüm yazılımsal ve donanımsal arıza süreçleri garanti belgesi hükümleri dairesinde yetkili servislerce yürütülür.
F. Bu protokol müşterinin kanuni haklarını kaldırmaz; ancak müşterinin kapalı kutu olarak teslim almayı kabul ettiği ve satış anında teknik test yapılmadığı hususunda bilgilendirildiğini kayıt altına alır.

4. KUTU VE BELGE KONTROLLÜ DOĞRULAMA (SEALED CHECK)
${passedTests.length ? passedTests.map((item) => `- [OK] ${item}`).join('\n') : '- Belirtilmedi'}

5. AKSESUAR VE VERİLEN BELGELER
${includedItems.length ? includedItems.map((item) => `- ${item}`).join('\n') : '- Ek belge belirtilmedi.'}

6. MÜŞTERİ BEYANI VE ONAY
Müşteri Açık Beyanı: "${input.customerDeclaration}"

Alıcı, yukarıda yazılı seri numaralı ürünü sıfır, kapalı kutulu ve ambalajı hasarsız şekilde teslim aldığını, yetkili servis ve garanti süreçleri hakkında tam bilgi sahibi olduğunu beyan ve kabul eder.
`
  }

  // B) Açılmış / İkinci El / Teşhir / Yenilenmiş Cihaz Satış Teslim Protokolü Metni
  return `${title}

Protokol Kodu: ${saleCode}
Tarih: ${new Date().toLocaleString('tr-TR')}
Kanal: ${input.channel === 'store' ? 'Mağaza Satışı' : 'Online / Dijital Satış'}

1. MÜŞTERİ BİLGİLERİ
Ad Soyad: ${line(input.customer.fullName)}
T.C. Kimlik No: ${line(input.customer.nationalId)}
Telefon: ${line(input.customer.phone)}
E-posta: ${line(input.customer.email)}
Adres: ${line(input.customer.address)}

2. CİHAZ BİLGİLERİ
${deviceDetailsSection}
3. KOZMETİK KABUL DURUMU
Ekran: ${line(input.cosmetic.screen)}
Kasa / Gövde: ${line(input.cosmetic.body)}
Arka Kapak: ${line(input.cosmetic.backCover)}
Kamera Camı / Lens: ${line(input.cosmetic.cameraLens)}
Kozmetik Notlar: ${line(input.cosmetic.notes)}

4. SATIŞ ANINDAKİ TEKNİK FONKSİYON TESTLERİ
ÇALIŞAN / ONAYLANAN HUSUSLAR:
${passedTests.length ? passedTests.map((item) => `- [OK] ${item}`).join('\n') : '- Çalışan fonksiyon işaretlenmedi.'}

TEST EDİLEMEYEN VEYA ÇALIŞMAYAN HUSUSLAR:
${failedTests.length ? failedTests.map((item) => `- [FAIL/NOT TESTED] ${item}`).join('\n') : '- Yok (Tüm testler başarılı).'}

5. BİLİNEN KUSUR / BİLDİRİLEN DURUMLAR
${knownIssues.length ? knownIssues.map((item, index) => `${index + 1}. ${item}`).join('\n') : '- Belirtilmedi.'}

6. BERABERİNDE TESLİM EDİLENLER
${includedItems.length ? includedItems.map((item) => `- ${item}`).join('\n') : '- Yok.'}

7. GARANTİ VE HUKUKİ HÜKÜMLER
A. Cihazın teslim anındaki kozmetik ve teknik durumu alıcı tarafından bizzat görülerek ve test edilerek kabul edilmiş, teslimat bu doğrultuda gerçekleştirilmiştir.
B. Teslimden sonra oluşacak kırılma, darbe, sıvı teması, orijinal olmayan şarj ekipmanları kullanımı, yazılımsal root/jailbreak işlemleri ve yetkisiz servis müdahaleleri garanti dışıdır.
C. İkinci el, teşhir veya yenilenmiş statüsündeki ürünlerin doğası gereği oluşabilecek batarya ömrü azalması veya kozmetik çizikler olağan kabul edilir. Bu protokolde açıkça belirtilen kusurlar için sonradan ayıp iddiasında bulunulamaz.
D. Apple ID / iCloud / Google hesap şifrelerinin muhafazası alıcıya ait olup, hesap kaldırılmadan arıza veya iade işlemleri yapılamaz. Veri yedeklemesi tamamen alıcının sorumluluğundadır; veri kaybından HurCELL sorumlu değildir.
E. Bu protokol müşterinin kanuni haklarını kaldırmaz. Ancak müşteriye açıkça bildirilen, test formunda işaretlenen ve alıcı tarafından onaylanan durumlar için sonradan "bilmiyordum" denilerek hak talebinde bulunulamaz.

8. MÜŞTERİ BEYANI VE ONAY
Müşteri Açık Beyanı: "${input.customerDeclaration}"

Alıcı, yukarıda detayları verilen cihazı mevcut fiziksel ve teknik fonksiyonel durumuyla görerek ve test ederek onayladığını, protokol şartlarını okuyup kabul ettiğini beyan eder.
`
}
