import type { DeviceSaleInput } from './schema'

const conditionLabels: Record<DeviceSaleInput['device']['condition'], string> = {
  new: 'Sıfır',
  display: 'Teşhir',
  used: 'İkinci el',
  refurbished: 'Yenilenmiş',
  authorized_refurbished: 'Yetkili onarıcı / yenileme raporlu',
}

const typeLabels: Record<DeviceSaleInput['device']['type'], string> = {
  phone: 'Telefon',
  tablet: 'Tablet',
  computer: 'Bilgisayar',
  accessory: 'Aksesuar',
  other: 'Diğer',
}

function line(value?: string) {
  return value && value.trim() ? value.trim() : '-'
}

export function buildDeviceSaleContractText(input: DeviceSaleInput, saleCode: string) {
  const knownIssues = input.knownIssues.filter(Boolean)
  const includedItems = input.includedItems.filter(Boolean)
  const passedTests = Object.entries(input.tests)
    .filter(([, passed]) => passed)
    .map(([name]) => name)

  return `HURCELL / HÜRSEL CİHAZ SATIŞ, TESLİM VE CİHAZ DURUMU KABUL SÖZLEŞMESİ

Satış Kodu: ${saleCode}
Satış Kanalı: ${input.channel === 'store' ? 'Mağaza satışı' : 'Dijital satış'}
Sözleşme Tarihi: ${new Date().toLocaleString('tr-TR')}

1. MÜŞTERİ BİLGİLERİ
Ad Soyad: ${line(input.customer.fullName)}
T.C. Kimlik No: ${line(input.customer.nationalId)}
Telefon: ${line(input.customer.phone)}
E-posta: ${line(input.customer.email || '')}
Adres: ${line(input.customer.address)}

2. CİHAZ BİLGİLERİ
Cihaz Türü: ${typeLabels[input.device.type]}
Durum: ${conditionLabels[input.device.condition]}
Marka: ${line(input.device.brand)}
Model: ${line(input.device.model)}
IMEI / Seri No: ${line(input.device.imeiOrSerial)}
Renk: ${line(input.device.color)}
Depolama / RAM: ${line(input.device.storageRam)}
Batarya Durumu: ${line(input.device.batteryHealth)}
Kutu Durumu: ${line(input.device.boxStatus)}
Tedarikçi / Yetkili Onarıcı Rapor No: ${line(input.device.supplierReportNo)}
Satış Bedeli: ${typeof input.salePrice === 'number' ? input.salePrice.toLocaleString('tr-TR') + ' TL' : '-'}
Adet: ${input.quantity}

3. MÜŞTERİYE AÇIK ÖZET
Müşteri, cihazın yukarıda yazılı durumda satıldığını, sıfır değilse daha önce kullanılmış olabileceğini, ikinci el / teşhir / yenilenmiş cihazlarda kullanım geçmişi, kozmetik iz, batarya yıpranması ve parça değişimi ihtimali bulunabileceğini kabul eder.

HurCELL yalnızca bu dijital sözleşmede, faturada, cihaz test formunda ve varsa servis / yenileme raporunda açıkça yazan bilgileri taahhüt eder. Bu belgelerde açıkça yazmıyorsa cihazın hiç açılmadığı, hiç parça değişmediği veya tüm parçalarının fabrika çıkışı olduğu garanti edilmiş sayılmaz.

Bu sözleşme müşterinin kanuni haklarını kaldırmaz. Ancak müşteriye açıkça bildirilen, bu sözleşmede yazan ve müşteri tarafından kabul edilen durumlar için sonradan 'bilmiyordum' denilerek haksız talepte bulunulamaz.

4. KOZMETİK DURUM
Ekran: ${line(input.cosmetic.screen)}
Kasa: ${line(input.cosmetic.body)}
Arka Kapak: ${line(input.cosmetic.backCover)}
Kamera Camı / Lens: ${line(input.cosmetic.cameraLens)}
Ek Notlar: ${line(input.cosmetic.notes)}

5. SATIŞ ANINDA YAPILAN TESTLER
${passedTests.length ? passedTests.map((item) => `- ${item}`).join('\n') : '- Test işaretlenmedi'}

6. BİLİNEN KUSUR / ÖZEL DURUMLAR
${knownIssues.length ? knownIssues.map((item, index) => `${index + 1}. ${item}`).join('\n') : '- Bilinen kusur belirtilmedi'}

7. TESLİM EDİLEN ÜRÜN / AKSESUARLAR
${includedItems.length ? includedItems.map((item) => `- ${item}`).join('\n') : '- Ek ürün belirtilmedi'}

8. GARANTİ VE SORUMLULUK DIŞI DURUMLAR
Cihaz tesliminden sonra düşme, darbe, kırılma, sıvı teması, oksitlenme, yetkisiz servis müdahalesi, yanlış şarj cihazı / kablo kullanımı, yazılım müdahalesi, hesap kilidi, kullanıcı şifresi, veri kaybı ve kullanım hatasından doğan sorunlar HurCELL sorumluluğunda değildir.

Ayıp iddiası varsa cihaz öncelikle HurCELL'e teslim edilir. HurCELL cihazı inceleme, teslim anındaki durumla karşılaştırma ve gerekli görürse teknik servis / uzman raporu alma hakkına sahiptir.

9. VERİLER VE HESAPLAR
Müşteri kişisel verilerinin, fotoğraflarının, rehberinin, WhatsApp / e-posta / banka uygulamalarının, Apple ID / iCloud / Google / Samsung / Microsoft hesaplarının ve şifrelerinin sorumluluğunun kendisine ait olduğunu kabul eder. Servis, iade veya değişim sürecinde veriler silinebilir.

10. MÜŞTERİ BEYANI
${input.customerDeclaration}

Müşteri sözleşmeyi okuduğunu, anladığını, cihazı mevcut haliyle teslim aldığını ve satışın bu beyana göre yapıldığını kabul eder.
`}
