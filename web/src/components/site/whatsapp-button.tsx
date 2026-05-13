'use client'

import React, { useState, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'

export const WhatsAppButton = () => {
  const [currentUrl, setCurrentUrl] = useState('')
  const phoneNumber = '905322362242'
  
  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

  const message = encodeURIComponent(`Merhaba, bu ürünle ilgili bilgi almak istiyorum. \n\nLink: ${currentUrl}`)
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`

  return (
    <motion.a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="fixed bottom-8 right-8 z-[100] flex items-center justify-center w-16 h-16 bg-green-500 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] text-white transition-all hover:shadow-[0_0_30px_rgba(34,197,94,0.6)]"
    >
      <MessageCircle size={32} fill="currentColor" />
    </motion.a>
  )
}
