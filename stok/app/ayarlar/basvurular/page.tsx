'use client';

import React, { useEffect, useState } from 'react';

type Application = {
  id: string;
  email: string;
  company_name: string;
  contact_name: string;
  phone: string;
  tax_number: string | null;
  city: string | null;
  note: string | null;
  status: string;
  created_at: string;
};

export default function B2bApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/b2b/applications');
      if (!res.ok) {
        throw new Error('Başvurular alınamadı.');
      }
      const data = await res.json();
      setApplications(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleApprove = async (id: string) => {
    if (!window.confirm('Bu başvuruyu onaylamak ve kullanıcıya şifre daveti göndermek istediğinize emin misiniz?')) return;
    
    try {
      const res = await fetch('/api/b2b/applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: id })
      });
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || 'Onaylama başarısız.');
      } else {
        alert('Başvuru başarıyla onaylandı.');
        setApplications(apps => apps.filter(a => a.id !== id));
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm('Bu başvuruyu reddetmek istediğinize emin misiniz?')) return;
    
    try {
      const res = await fetch('/api/b2b/applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: id })
      });
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || 'Reddetme başarısız.');
      } else {
        alert('Başvuru başarıyla reddedildi.');
        setApplications(apps => apps.filter(a => a.id !== id));
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">B2B Bayi Başvuruları</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sistemde bekleyen onaylanmamış bayi başvuruları listelenmektedir.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">{errorMsg}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-slate-500 text-sm">Yükleniyor...</p>
        ) : applications.length === 0 ? (
          <p className="text-slate-500 text-sm">Bekleyen başvuru bulunmamaktadır.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Firma</th>
                  <th className="px-4 py-3">Yetkili</th>
                  <th className="px-4 py-3">İletişim</th>
                  <th className="px-4 py-3">Lokasyon/Vergi</th>
                  <th className="px-4 py-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {applications.map(app => (
                  <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 font-medium text-slate-900">{app.company_name}</td>
                    <td className="px-4 py-4">{app.contact_name}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span>{app.email}</span>
                        <span className="text-slate-400">{app.phone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span>{app.city || '-'}</span>
                        <span className="text-slate-400">{app.tax_number || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleApprove(app.id)}
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 shadow-sm"
                      >
                        Onayla
                      </button>
                      <button
                        onClick={() => handleReject(app.id)}
                        className="inline-flex items-center justify-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 shadow-sm"
                      >
                        Reddet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
