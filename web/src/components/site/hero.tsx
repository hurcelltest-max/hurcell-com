'use client'

import React, { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, Cpu, ShieldCheck, Zap } from 'lucide-react'

export const Hero = () => {
  const ref = useRef<HTMLDivElement>(null)
  
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useSpring(x)
  const mouseYSpring = useSpring(y)

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <section 
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 bg-[#020203]"
    >
      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#1e3a8a_0%,transparent_50%)]" />
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-600/20 rounded-full blur-[100px]" />
      </div>

      <motion.div 
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="container relative z-10 px-4 text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ translateZ: "50px" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-mono mb-8 backdrop-blur-xl">
            <Zap size={14} className="animate-pulse" /> SİSTEM DURUMU: OPTİMİZE EDİLDİ
          </div>
          
          <h1 className="text-6xl md:text-9xl font-black tracking-tighter mb-8 leading-none">
            <span className="block text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">HURCELL</span>
            <span className="block bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-600">
              TEKNOLOJİ
            </span>
          </h1>
          
          <p className="text-lg md:text-2xl text-blue-100/60 max-w-3xl mx-auto mb-12 font-light tracking-wide">
            Lüksün siber donanımlarla buluştuğu nokta. <br />
            Yeni nesil dijital öncüler için tasarlandı.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Button size="lg" className="h-16 px-10 rounded-none bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] border-none">
              SİSTEME GİR
              <ArrowRight className="ml-3 w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="h-16 px-10 rounded-none border-white/10 bg-white/5 backdrop-blur-2xl hover:bg-white/10 text-white font-bold tracking-widest uppercase transition-all">
              KOLEKSİYONLAR
            </Button>
          </div>
        </motion.div>

        <motion.div 
          style={{ translateZ: "100px" }}
          className="mt-20 grid grid-cols-2 md:grid-cols-3 gap-8 max-w-4xl mx-auto opacity-40"
        >
          <div className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.2em]">
            <Cpu size={14} /> NÖRAL İŞLEME
          </div>
          <div className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.2em]">
            <ShieldCheck size={14} /> BİYOMETRİK GÜVENLİK
          </div>
          <div className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.2em] col-span-2 md:col-span-1">
            <Zap size={14} /> ANLIK SENKRONİZASYON
          </div>
        </motion.div>
      </motion.div>

      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
    </section>
  )
}
