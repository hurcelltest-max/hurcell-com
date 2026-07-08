'use client';

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Phone, MapPin, AlertCircle, FileText, Calendar, CreditCard, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CariKartPage({ params }: { params: { card_token: string } }) {
  const router = useRouter();
  const token = params.card_token;
  const [customer, setCustomer] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);

  useEffect(() => {
    fetchCustomer();
  }, [token]);

  const fetchCustomer = async () => {
    try {
      const res = await fetch(`/api/cari/musteri/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCustomer(data.customer);
      fetchNotes(data.customer.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async (customerId: string) => {
    try {
      const res = await fetch(`/api/cari/notlar?customerId=${customerId}`);
      const data = await res.json();
      if (res.ok) setNotes(data.notes);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNoteLoading(true);
    try {
      const res = await fetch('/api/cari/notlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customer.id, note: newNote })
      });
      if (res.ok) {
        setNewNote('');
        fetchNotes(customer.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setNoteLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;
  if (error || !customer) return <div className="p-8 text-center text-red-500">{error || 'Bulunamadı'}</div>;

  const account = customer.credit_accounts?.[0];
  const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/cari/kart/${token}`;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <Link href="/admin/cari" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" />
        Aramaya Dön
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Kolon: Profil & QR */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center">
              <div className="bg-white/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/20">
                <span className="text-2xl font-bold text-white">
                  {customer.full_name?.substring(0, 2).toUpperCase() || 'MR'}
                </span>
              </div>
              <h1 className="text-xl font-bold text-white mb-1">{customer.full_name}</h1>
              <p className="text-blue-100 font-mono tracking-wider">{customer.customer_card_code}</p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <span>{customer.phone}</span>
                </div>
                {customer.city && (
                  <div className="flex items-start gap-3 text-gray-600">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span>{customer.address}, {customer.district}/{customer.city}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-gray-600">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <span className={customer.credit_agreement_acceptances?.length ? "text-green-600 font-medium" : "text-amber-500 font-medium"}>
                    {customer.credit_agreement_acceptances?.length ? 'Sözleşme Onaylı' : 'Sözleşme Bekliyor'}
                  </span>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-gray-100 flex flex-col items-center">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Müşteri QR Kodu</h3>
                <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                  <QRCodeSVG value={qrUrl} size={150} level="M" />
                </div>
                <p className="text-xs text-center text-gray-500 mt-4 leading-relaxed max-w-[200px]">
                  Mağaza içi işlemlerde bu QR kodu okutarak hızlı erişim sağlayabilirsiniz.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sağ Kolon: Finans & Geçmiş */}
        <div className="lg:col-span-2 space-y-6">
          {/* Finansal Özet */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-6">
              <CreditCard className="w-5 h-5 text-blue-500" />
              Finansal Özet
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">Cari Limit</p>
                <p className="text-xl font-bold text-gray-900">₺{account?.credit_limit || 0}</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-sm text-blue-600 mb-1">Kullanılan</p>
                <p className="text-xl font-bold text-blue-700">₺{account?.current_balance || 0}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                <p className="text-sm text-green-600 mb-1">Kalan Limit</p>
                <p className="text-xl font-bold text-green-700">₺{(account?.credit_limit || 0) - (account?.current_balance || 0)}</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-sm text-amber-600 mb-1">Hesap Kesim</p>
                <p className="text-lg font-bold text-amber-700 flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> Her ayın {account?.statement_day || 10}'u
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Admin Notları */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-indigo-500" />
                Yönetici Notları
              </h2>
              <form onSubmit={handleAddNote} className="mb-4 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Müşteri hakkında not ekle..."
                    className="flex-1 text-sm border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={noteLoading || !newNote.trim()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Ekle
                  </button>
                </div>
              </form>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {notes.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">Henüz not eklenmemiş.</p>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                      <p className="text-sm text-gray-800">{note.note}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(note.created_at).toLocaleString('tr-TR')} (Admin Sadece)
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Geçmiş İşlemler */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex flex-col">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">İşlem Geçmişi</h2>
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <FileText className="w-8 h-8 text-gray-400 mb-3" />
                <h3 className="text-sm font-medium text-gray-900 mb-1">Henüz kayıt yok</h3>
                <p className="text-xs text-gray-500 max-w-[200px] leading-relaxed">
                  Alışveriş ve ödeme geçmişi Phase 2 ile birlikte aktif edilecektir.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
