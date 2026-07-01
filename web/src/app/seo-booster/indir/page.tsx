import type { Metadata } from "next";
import { Download, CheckCircle2, ShieldAlert, HelpCircle, Mail, Terminal, ShieldCheck, FileCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "HurCELL SEO Booster İndir - Web Sitesi SEO Analiz Programı",
  description: "HurCELL SEO Booster, web sitenizi teknik SEO, içerik, sosyal medya etiketleri ve yapılandırılmış veri açısından analiz eden lisanslı Windows SEO raporlama programıdır.",
};

export default function DownloadPage() {
  const finalSha256 = "D6353DEBBFC5FF6CEE6A1EA749C43FFD06EF901ACA91A7AB4BD8DCBBA01C6BA9";

  const faqs = [
    {
      q: "Kurulumda Windows SmartScreen uyarısı aldım, dosya güvenli mi?",
      a: "Evet, yazılımımız tamamen güvenlidir. SmartScreen uyarısı, kod imzalama sertifikası yeni olduğu veya indirme sayısı henüz gelişme aşamasında olduğu için Windows'un gösterdiği varsayılan bir uyarıdır. 'Ek Bilgi' linkine tıklayıp 'Yine de Çalıştır' seçeneğiyle güvenle kurabilirsiniz."
    },
    {
      q: "Lisans anahtarımı başka bir bilgisayara taşıyabilir miyim?",
      a: "Evet. Bilgisayarınızı değiştirmek istediğinizde destek@hurcell.com adresine sipariş numaranızla birlikte e-posta göndererek eski cihaz kaydınızı ücretsiz sıfırlatabilir ve yeni bilgisayarınızda aynı lisansı aktifleştirebilirsiniz."
    },
    {
      q: "Programın çalışması için anlık internet bağlantısı gerekir mi?",
      a: "Lisans aktivasyonu yaparken ve web sitenizi analiz ederken (canlı tarama yapıldığından) internet bağlantınızın olması gereklidir."
    },
    {
      q: "Lisansım ne kadar süre geçerlidir?",
      a: "Pazaryerimizden (Trendyol, Hepsiburada vb.) satın aldığınız Lifetime sürümü süresiz (ömür boyu) kullanım hakkı tanımaktadır."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium">
            <Terminal size={14} />
            <span>Versiyon 1.0.0 Yayınlandı</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-fill-transparent text-transparent">
            HurCELL SEO Booster'ı İndirin
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Web sitenizi teknik SEO, meta etiketleri, içerik kalitesi ve yapısal veriler açısından analiz eden gelişmiş Windows masaüstü uygulaması.
          </p>
        </div>

        {/* Download & Verification Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-3 text-center md:text-left">
              <h2 className="text-2xl font-bold text-slate-100">Windows Kurulum Paketi</h2>
              <div className="text-sm text-slate-400 space-y-1">
                <p><strong>Dosya Adı:</strong> HurCELL-SEO-Booster-Setup.exe</p>
                <p><strong>İşletim Sistemi:</strong> Windows 10 / 11 (64-bit)</p>
                <p><strong>Dosya Boyutu:</strong> ~60 MB</p>
              </div>
            </div>
            
            <div className="w-full md:w-auto">
              <a
                href="/downloads/HurCELL-SEO-Booster-Setup.exe"
                className="inline-flex items-center justify-center gap-3 w-full md:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold transition-all duration-200 transform hover:-translate-y-0.5 shadow-lg shadow-indigo-500/20 active:translate-y-0"
              >
                <Download size={20} />
                <span>Hemen İndir (Windows)</span>
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <ShieldCheck className="text-indigo-400" size={18} />
              <span>SHA256 Checksum Doğrulama</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              İndirdiğiniz dosyanın orijinalliğini doğrulamak için aşağıdaki SHA256 kodunu kullanabilirsiniz:
            </p>
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 font-mono text-xs text-indigo-400 break-all select-all">
              {finalSha256}
            </div>
            <p className="text-xs text-amber-500/90 font-medium">
              ⚠️ Güvenliğiniz için kurulum dosyasını yalnızca resmî sitemiz olan hurcell.com üzerinden indirin.
            </p>
          </div>
        </div>

        {/* Digital License Notice */}
        <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-4 flex items-start gap-3">
          <FileCheck className="text-indigo-400 shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-indigo-300">
            <strong>Dijital Lisans Teslimatı:</strong> Bu ürün tamamen dijital yazılım lisansı olarak teslim edilir. Adresinize fiziksel kargo veya kutu gönderimi yapılmamaktadır.
          </p>
        </div>

        {/* Setup and Activation Guide */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-400" size={18} />
              <span>Kurulum Adımları</span>
            </h3>
            <ol className="list-decimal pl-5 text-sm text-slate-400 space-y-2.5">
              <li>Yukarıdaki butona tıklayarak kurulum dosyasını indirin.</li>
              <li>İndirdiğiniz <code className="text-slate-200">HurCELL-SEO-Booster-Setup.exe</code> dosyasına çift tıklayın.</li>
              <li>Sihirbaz yönergelerini takip ederek kurulumu tamamlayın. (Program yönetici yetkisi gerektirmeden Local AppData altına kurulacaktır).</li>
              <li>Masaüstünde oluşan <strong>HurCELL SEO Booster</strong> simgesine tıklayarak programı çalıştırın. Tarayıcı penceresi otomatik olarak açılacaktır.</li>
            </ol>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-400" size={18} />
              <span>Lisans Aktivasyon Adımları</span>
            </h3>
            <ol className="list-decimal pl-5 text-sm text-slate-400 space-y-2.5">
              <li>Program açıldığında karşınıza gelen kilitli aktivasyon ekranını göreceksiniz.</li>
              <li>Trendyol veya Hepsiburada siparişinizin ardından size gönderilen <code className="text-slate-200">HRC-XXXX-XXXX-XXXX-XXXX-XXXX</code> formatındaki 28 haneli anahtarı kopyalayın.</li>
              <li>Aktivasyon alanına yapıştırın ve <strong>"Aktifleştir"</strong> butonuna tıklayın.</li>
              <li>Süresiz (LIFETIME) kilitleri anında açılacak ve tarama yapmaya başlayabileceksiniz.</li>
            </ol>
          </div>
        </div>

        {/* Windows Security Alert Notice */}
        <div className="bg-amber-950/25 border border-amber-900/40 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
            <ShieldAlert size={18} />
            <span>Windows Defender / SmartScreen Uyarısı Hakkında</span>
          </h3>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              Kurulum sırasında <strong className="text-amber-300">"Windows kişisel bilgisayarınızı korudu"</strong> veya Microsoft Defender SmartScreen uyarı ekranıyla karşılaşabilirsiniz.
            </p>
            <p className="text-slate-400 text-xs">
              Bu uyarı, uygulamamız yeni yayınlandığı ve henüz Microsoft SmartScreen veri tabanı tarafından dünya genelinde yaygın olarak tanınmadığı için gösterilen standart bir Windows güvenlik uyarısıdır (Güvenilir Yayıncı Sertifikası başvuru süreçlerimiz devam etmektedir).
            </p>
            <p className="text-slate-400 text-xs font-semibold">
              Eğer kurulum dosyasını yalnızca bu resmî HurCELL sayfasından indirdiyseniz, güvenle devam edebilirsiniz.
            </p>
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-lg p-4 space-y-2 text-slate-300 text-xs">
              <p className="font-bold text-slate-200">Kuruluma devam etmek için:</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-slate-400">
                <li>Uyarı ekranındaki <strong className="text-slate-200">"Ek bilgi"</strong> (More Info) bağlantısına tıklayın.</li>
                <li>Pencerenin altında beliren <strong className="text-slate-200">"Yine de çalıştır"</strong> (Run anyway) butonuna basın.</li>
                <li>Kurulum sihirbazı adımlarını takip edin.</li>
              </ol>
            </div>
            <p className="text-xs text-indigo-400 leading-normal">
              🛡️ <strong>Güvenlik Notu:</strong> Güvenliğiniz için kurulum dosyasını yalnızca hurcell.com resmî indirme sayfasından indirmenizi öneririz. Dosya bütünlüğünü kontrol etmek isteyen kullanıcılar yukarıdaki SHA256 kodunu indirilen dosya ile karşılaştırabilir.
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <HelpCircle className="text-indigo-400" size={22} />
            <span>Sıkça Sorulan Sorular</span>
          </h3>
          <div className="grid sm:grid-cols-2 gap-6">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-5 space-y-2">
                <h4 className="font-semibold text-slate-200 text-sm">{faq.q}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Support Section */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Mail size={20} />
          </div>
          <h3 className="text-lg font-bold text-slate-100">Teknik Desteğe mi İhtiyacınız Var?</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Aktivasyon sorunları, lisans sıfırlama veya kullanım soruları için destek ekibimizle iletişime geçebilirsiniz.
          </p>
          <p className="text-sm font-semibold text-indigo-400">
            <a href="mailto:destek@hurcell.com" className="hover:underline">destek@hurcell.com</a>
          </p>
        </div>

      </div>
    </div>
  );
}
