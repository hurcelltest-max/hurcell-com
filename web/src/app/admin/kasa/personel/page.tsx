'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserPlus, CheckCircle, AlertCircle, Shield, User } from 'lucide-react';

interface KasaUser {
  id: string;
  username: string;
  full_name: string;
  role: 'yonetici' | 'personel';
  is_active: boolean;
  created_at: string;
}

export default function AdminKasaPersonelPage() {
  const [users, setUsers] = useState<KasaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Yeni Kullanıcı Form State
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'personel' | 'yonetici'>('personel');
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/kasa/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kullanıcılar alınamadı.');
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormMsg(null);

    try {
      setFormLoading(true);
      const res = await fetch('/api/admin/kasa/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, full_name: fullName, password, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kullanıcı oluşturulamadı.');

      setFormMsg(`Kullanıcı "${data.user.full_name}" başarıyla eklendi.`);
      setUsername('');
      setFullName('');
      setPassword('');
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const toggleUserActive = async (user: KasaUser) => {
    try {
      const res = await fetch('/api/admin/kasa/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
      });

      if (!res.ok) throw new Error('Kullanıcı durumu güncellenemedi.');
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/kasa"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kasa Personel Yönetimi</h1>
          <p className="text-sm text-slate-500">Personel ve yönetici hesapları tanımlama ve yetkilendirme</p>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200">{error}</div>}
      {formMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-sm font-semibold border border-emerald-200 flex items-center gap-2">
          <CheckCircle size={18} /> {formMsg}
        </div>
      )}

      {/* YENİ KULLANICI EKLEME FORMU */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2">
          <UserPlus size={20} className="text-blue-600" /> Yeni Kasa Kullanıcısı Ekle
        </h2>

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Kullanıcı Adı *
            </label>
            <input
              type="text"
              required
              placeholder="Örn: ahmet"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Ad Soyad *
            </label>
            <input
              type="text"
              required
              placeholder="Ahmet Yılmaz"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Şifre / PIN *
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Yetki Rolü *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'personel' | 'yonetici')}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:bg-white"
            >
              <option value="personel">Personel (Sınırlı)</option>
              <option value="yonetici">Yönetici (Tam Yetki)</option>
            </select>
          </div>

          <div className="sm:col-span-4 pt-2">
            <button
              type="submit"
              disabled={formLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
            >
              {formLoading ? 'Eklenecek...' : 'Kullanıcıyı Kaydet'}
            </button>
          </div>
        </form>
      </div>

      {/* MAVİ KULLANICI LİSTESİ TABLOSU */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-bold text-lg text-slate-900">Tanımlı Kullanıcılar</h2>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
              <th className="py-3.5 px-6">Kullanıcı Adı</th>
              <th className="py-3.5 px-6">Ad Soyad</th>
              <th className="py-3.5 px-6 text-center">Rol</th>
              <th className="py-3.5 px-6 text-center">Durum</th>
              <th className="py-3.5 px-6 text-center">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm font-medium">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  Yükleniyor...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  Henüz kayıtlı kullanıcı yok.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="py-3.5 px-6 font-mono font-bold text-slate-900">{u.username}</td>
                  <td className="py-3.5 px-6 text-slate-800">{u.full_name}</td>
                  <td className="py-3.5 px-6 text-center">
                    {u.role === 'yonetici' ? (
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold flex items-center justify-center gap-1 w-max mx-auto">
                        <Shield size={12} /> Yönetici
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold flex items-center justify-center gap-1 w-max mx-auto">
                        <User size={12} /> Personel
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-6 text-center">
                    {u.is_active ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold">
                        Pasif
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-6 text-center">
                    <button
                      onClick={() => toggleUserActive(u)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                        u.is_active
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                      }`}
                    >
                      {u.is_active ? 'Pasife Al' : 'Aktif Et'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
