import { Hero } from "@/components/site/hero";
import { Zap, ArrowUpRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-[#020203]">
      <Hero />
      
      <section className="py-32 container px-4 relative">
        <div className="flex items-center justify-between mb-16">
          <div>
            <h2 className="text-4xl font-black tracking-tighter text-white mb-2">ÖZEL SEÇKİ DONANIMLAR</h2>
            <p className="text-blue-400/60 font-mono text-sm uppercase tracking-widest">FAZ 01 // TEMEL BİLEŞENLER</p>
          </div>
          <div className="hidden md:block h-px flex-1 mx-12 bg-gradient-to-r from-blue-500/50 to-transparent" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            { name: "NÖRAL LİNK V.1", price: "2.499", desc: "Sıfır gecikmeli senkronizasyon ile gelişmiş beyin arayüzü." },
            { name: "CORE PULSE X", price: "1.850", desc: "Uzun süreli mobilite için yüksek yoğunluklu enerji hücresi." },
            { name: "OPTİK SENSE 360", price: "3.200", desc: "Artırılmış gerçeklik görsel işleme ünitesi." }
          ].map((product, i) => (
            <div 
              key={i} 
              className="group relative glass rounded-none p-1 border-white/5 overflow-hidden cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/0 to-blue-600/0 group-hover:from-blue-600/10 group-hover:to-cyan-600/10 transition-all duration-500" />
              
              <div className="relative p-8 h-[450px] flex flex-col justify-between z-10 border border-white/5 group-hover:border-blue-500/50 transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(37,99,235,0.2)]">
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:border-blue-400 transition-colors">
                    <Zap size={20} className="text-white/20 group-hover:text-blue-400 transition-colors" />
                  </div>
                  <ArrowUpRight className="text-white/20 group-hover:text-white transition-all transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                </div>

                <div>
                  <div className="mb-6 aspect-square w-full bg-gradient-to-t from-white/5 to-transparent flex items-center justify-center overflow-hidden">
                     <div className="w-3/4 h-3/4 border border-white/5 bg-white/5 rotate-45 group-hover:rotate-90 transition-transform duration-700 ease-in-out" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">{product.name}</h3>
                  <p className="text-white/40 text-sm mb-6 line-clamp-2 font-light">{product.desc}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-blue-400 font-mono font-bold text-xl">${product.price}.00</p>
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">ŞİMDİ ALINABİLİR</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20 border-t border-white/5 bg-[#050507]">
        <div className="container px-4 text-center">
          <p className="text-white/10 font-mono text-[80px] md:text-[150px] font-black tracking-[0.2em] leading-none select-none">
            HURCELL
          </p>
        </div>
      </section>
    </div>
  );
}
