'use client'

import React from 'react'
import { PlusCircle, Search, Users } from 'lucide-react'
import Link from 'next/link'

export default function AdminCariListPage() {
  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Cari Müşteriler
          </h1>
          <p className="text-sm text-gray-500 mt-1">Limitli alışveriş hesabı olan müşterileri yönetin.</p>
        </div>
        <Link 
          href="/admin/cari/yeni-musteri"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium flex items-center gap-2 transition-colors"
        >
          <PlusCircle className="w-5 h-5" />
          Yeni Cari Müşteri
        </Link>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Müşteri adı veya telefon ile ara..." 
            className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select className="border border-gray-200 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="all">Tüm Durumlar</option>
          <option value="active">Aktif</option>
          <option value="suspended">Askıya Alınmış</option>
          <option value="debt">Borçlu</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-12 text-center text-gray-500">
          <p>Müşteri listesi veri tabanına bağlandığında burada listelenecektir.</p>
          <p className="text-sm mt-2">(Phase 1 Taslak Ekranı)</p>
        </div>
      </div>
    </div>
  )
}
