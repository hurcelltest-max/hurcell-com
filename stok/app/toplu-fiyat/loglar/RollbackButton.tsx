'use client';

import { useState } from 'react';

export default function RollbackButton({ batchId }: { batchId: string }) {
  const [loading, setLoading] = useState(false);

  const handleRollback = async () => {
    if (!window.confirm('Bu işlemi geri almak istediğinize emin misiniz? Fiyatlar sonradan değiştiyse iptal edilecektir.')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/products/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bilinmeyen hata');
      
      alert('İşlem başarıyla geri alındı!');
      window.location.reload();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      alert('Hata: ' + errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleRollback} 
      disabled={loading}
      className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 disabled:opacity-50"
    >
      {loading ? 'İşleniyor...' : 'Geri Al'}
    </button>
  );
}
