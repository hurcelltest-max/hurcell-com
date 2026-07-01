# Windows SmartScreen ve Güvenlik Uyarıları Kılavuzu

HurCELL SEO Booster'ı indirirken veya kurarken Windows Defender SmartScreen koruması nedeniyle bir uyarı ekranı ile karşılaşabilirsiniz. Bu kılavuzda, bu uyarının neden çıktığını, nasıl güvenle devam edeceğinizi ve dosya orijinalliğini nasıl doğrulayacağınızı bulabilirsiniz.

---

## 1. Windows SmartScreen Uyarısı Nedir ve Neden Görünüyor?

İnternetten indirilen yeni programlar (`.exe` kurulum dosyaları) henüz Microsoft veri tabanında yüksek indirilme sayılarına ve bilinirliğe (reputation) ulaşmamışsa, Windows Defender SmartScreen varsayılan olarak **"Windows kişisel bilgisayarınızı korudu"** uyarısını gösterir.

Bu durum, programda bir hata veya virüs olduğu anlamına gelmez. HurCELL SEO Booster, tamamen güvenlidir ve arka planda siteleri taramak için lokal bir sunucu katmanı çalıştırdığından bu uyarının alınması normaldir. İlerleyen süreçte yazılıma eklenecek **resmî yayıncı imzalama sertifikaları (Code Signing)** ile bu uyarı tamamen ortadan kalkacaktır.

---

## 2. Kuruluma Nasıl Devam Edilir? (Adım Adım)

Eğer kurulum sırasında SmartScreen uyarısı alırsanız aşağıdaki basit adımları uygulayarak kuruluma devam edebilirsiniz:

1. Karşınıza gelen mavi uyarı penceresinde sol tarafta yer alan **"Ek bilgi"** (More Info) bağlantısına tıklayın.
2. Bağlantıya tıkladığınızda pencerenin altında **"Yine de çalıştır"** (Run anyway) butonu belirecektir.
3. **"Yine de çalıştır"** butonuna basarak kurulum sihirbazını başlatın ve yönergeleri takip edin.

*Not: Eğer dosya tamamen engellenirse, setup dosyasına sağ tıklayıp **Özellikler** penceresini açın. En alttaki Güvenlik bölümünden **"Engellemeyi Kaldır"** (Unblock) seçeneğini işaretleyip Uygula / Tamam butonlarına basarak dosyayı tekrar çalıştırmayı deneyin.*

---

## 3. Resmi Kaynak ve Güvenlik Kontrolü

> [!IMPORTANT]
> Güvenliğiniz için HurCELL SEO Booster kurulum dosyasını **sadece** resmî web sitemiz olan **[hurcell.com/seo-booster/indir](https://hurcell.com/seo-booster/indir)** sayfasından indirdiğinizden emin olun. Başka forumlar, e-posta ekleri veya üçüncü taraf paylaşım sitelerinden indirilen dosyaları çalıştırmayın.

---

## 4. SHA256 Checksum Doğrulaması Nasıl Yapılır?

İndirdiğiniz dosyanın bizim tarafımızdan yayınlanan orijinal dosya ile birebir aynı olup olmadığını (araya hiçbir müdahale girmediğini) kontrol etmek için SHA256 hash doğrulamasını yapabilirsiniz.

### PowerShell ile Doğrulama Adımları:
1. Windows arama çubuğuna **PowerShell** yazıp çalıştırın.
2. Aşağıdaki komutu, dosyanın indiği konuma göre düzenleyip çalıştırın:
   ```powershell
   Get-FileHash -Path "$HOME\Downloads\HurCELL-SEO-Booster-Setup.exe" -Algorithm SHA256
   ```
3. Konsolda üretilen uzun kod (Hash) ile resmî web sitemizde ilan edilen aşağıdaki kodu karşılaştırın:
   **`D6353DEBBFC5FF6CEE6A1EA749C43FFD06EF901ACA91A7AB4BD8DCBBA01C6BA9`**
4. Kodlar harfiyen eşleşiyorsa indirdiğiniz dosya tamamen güvenlidir ve orijinaldir.

---

## 5. Teknik Destek ve Yardım
Herhangi bir kurulum sorusunda veya takıldığınız bir adımda destek ekibimize ulaşabilirsiniz:
* **E-Posta:** [destek@hurcell.com](mailto:destek@hurcell.com)
* **Web:** [hurcell.com](https://hurcell.com)
