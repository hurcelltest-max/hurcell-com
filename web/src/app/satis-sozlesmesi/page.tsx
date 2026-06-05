'use client'

import React, { useMemo, useState } from 'react'
import { CheckCircle2, FileText, Loader2, ShieldCheck } from 'lucide-react'

const testItems = [
  'Cihaz açıldı / kapandı',
  'Ekran görüntüsü kontrol edildi',
  'Dokunmatik kontrol edildi',
  'Face ID / Touch ID / Parmak izi kontrol edildi',
  'Ön kamera kontrol edildi',
  'Arka kamera kontrol edildi',
  'Hoparlör kontrol edildi',
  'Ahize kontrol edildi',
  'Mikrofon kontrol edildi',
  'Şarj soketi kontrol edildi',
  'Wi-Fi kontrol edildi',
  'Bluetooth kontrol edildi',
  'Şebeke / SIM kontrol edildi',
  'Batarya durumu kontrol edildi',
  'IMEI / seri numarası kontrol edildi',
  'iCloud / Apple ID / Google hesap kilidi kontrol edildi',
]

const defaultDeclaration = 'Cihazı gördüm, test ettim, yukarıdaki açıklamaları okudum ve anladım.'

type Result = {
  ok: boolean
  saleCode?: string
  contractText?: string
  message?: string
}

export default function DeviceSaleContractPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [knownIssues, setKnownIssues] = useState('')
  const [includedItems, setIncludedItems] = useState('Fatura')
  const [tests, setTests] = useState<Record<string, boolean>>({})
  const [accepted, setAccepted] = useState(false)

  const checkedCount = useMemo(() => Object.values(tests).filter(Boolean).length, [tests])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setResult(null)

    const form = new FormData(event.currentTarget)
    const payload = {
      channel: form.get('channel'),
      productId: form.get('productId'),
      quantity: Number(form.get('quantity') || 1),
      salePrice: form.get('salePrice') ? Number(form.get('salePrice')) : undefined,
      customer: {
        fullName: form.get('customerFullName'),
        nationalId: form.get('customerNationalId') || '',
        phone: form.get('customerPhone'),
        email: form.get('customerEmail') || '',
        address: form.get('customerAddress') || '',
      },
      device: {
        type: form.get('deviceType'),
        condition: form.get('deviceCondition'),
        brand: form.get('brand'),
        model: form.get('model'),
        imeiOrSerial: form.get('imeiOrSerial'),
        color: form.get('color') || '',
        storageRam: form.get('storageRam') || '',
        batteryHealth: form.get('batteryHealth') || '',
        boxStatus: form.get('boxStatus') || '',
        supplierReportNo: form.get('supplierReportNo') || '',
      },
      cosmetic: {
        screen: form.get('screen') || '',
        body: form.get('body') || '',
        backCover: form.get('backCover') || '',
        cameraLens: form.get('cameraLens') || '',
        notes: form.get('cosmeticNotes') || '',
      },
      tests,
      knownIssues: knownIssues.split('\n').map((item) => item.trim()).filter(Boolean),
      includedItems: includedItems.split('\n').map((item) => item.trim()).filter(Boolean),
      customerDeclaration: form.get('customerDeclaration'),
      acceptedLegalNotice: accepted,
      signatureDataUrl: '',
    }

    try {
      const response = await fetch('/api/sales/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      setResult(data)
    } catch {
      setResult({ ok: false, message: 'Bağlantı hatası oluştu. Satış tamamlanmadı.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-white pt-28 text-slate-900">
      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        <div className="mb-8 rounded-3xl border border-blue-100 bg-white/80 p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <ShieldCheck className="h-4 w-4" /> HurCELL güvenli satış akışı
              </span>
              <h1 className="text-3xl font-light tracking-tight md:text-5xl">Dijital cihaz satış sözleşmesi</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                Mağaza ve dijital satışlarda cihaz durumu, testler, müşteri beyanı ve stok düşme işlemi tek kayıt altında tutulur.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Satış tamamlanınca:</p>
              <p>1. Sözleşme kaydedilir</p>
              <p>2. Stok otomatik düşer</p>
              <p>3. Satış kodu oluşur</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card title="Satış bilgisi">
            <div className="grid gap-4 md:grid-cols-4">
              <Select name="channel" label="Satış kanalı" options={[['store', 'Mağaza'], ['online', 'Dijital']]} />
              <Input name="productId" label="Stok ürün ID / SKU" placeholder="Örn: 194253337331" required />
              <Input name="quantity" label="Adet" type="number" defaultValue="1" min="1" required />
              <Input name="salePrice" label="Satış bedeli" type="number" placeholder="TL" />
            </div>
          </Card>

          <Card title="Müşteri bilgileri">
            <div className="grid gap-4 md:grid-cols-2">
              <Input name="customerFullName" label="Ad soyad" required />
              <Input name="customerNationalId" label="T.C. kimlik no" />
              <Input name="customerPhone" label="Telefon" required />
              <Input name="customerEmail" label="E-posta" type="email" />
              <Textarea name="customerAddress" label="Adres" className="md:col-span-2" />
            </div>
          </Card>

          <Card title="Cihaz bilgileri">
            <div className="grid gap-4 md:grid-cols-3">
              <Select name="deviceType" label="Cihaz türü" options={[['phone', 'Telefon'], ['tablet', 'Tablet'], ['computer', 'Bilgisayar'], ['accessory', 'Aksesuar'], ['other', 'Diğer']]} />
              <Select name="deviceCondition" label="Ürün durumu" options={[['new', 'Sıfır'], ['display', 'Teşhir'], ['used', 'İkinci el'], ['refurbished', 'Yenilenmiş'], ['authorized_refurbished', 'Yetkili onarıcı raporlu']]} />
              <Input name="brand" label="Marka" required />
              <Input name="model" label="Model" required />
              <Input name="imeiOrSerial" label="IMEI / Seri no" required />
              <Input name="color" label="Renk" />
              <Input name="storageRam" label="Depolama / RAM" />
              <Input name="batteryHealth" label="Batarya durumu" />
              <Input name="boxStatus" label="Kutu durumu" />
              <Input name="supplierReportNo" label="Servis / tedarikçi rapor no" className="md:col-span-3" />
            </div>
          </Card>

          <Card title="Kozmetik durum">
            <div className="grid gap-4 md:grid-cols-2">
              <Input name="screen" label="Ekran" placeholder="Temiz / çizik var / leke var..." />
              <Input name="body" label="Kasa" placeholder="Temiz / darbe izi var..." />
              <Input name="backCover" label="Arka kapak" />
              <Input name="cameraLens" label="Kamera camı / lens" />
              <Textarea name="cosmeticNotes" label="Ek kozmetik notlar" className="md:col-span-2" />
            </div>
          </Card>

          <Card title={`Test formu (${checkedCount}/${testItems.length})`}>
            <div className="grid gap-3 md:grid-cols-2">
              {testItems.map((item) => (
                <label key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!tests[item]}
                    onChange={(event) => setTests((current) => ({ ...current, [item]: event.target.checked }))}
                    className="h-4 w-4"
                  />
                  {item}
                </label>
              ))}
            </div>
          </Card>

          <Card title="Bilinen kusurlar ve verilenler">
            <div className="grid gap-4 md:grid-cols-2">
              <Textarea label="Bilinen kusurlar / özel durumlar" value={knownIssues} onChange={(event) => setKnownIssues(event.target.value)} placeholder="Her satıra bir madde yazın" rows={6} />
              <Textarea label="Cihazla verilenler" value={includedItems} onChange={(event) => setIncludedItems(event.target.value)} placeholder="Fatura\nKablo\nKılıf" rows={6} />
            </div>
          </Card>

          <Card title="Müşteri açık beyanı">
            <Textarea name="customerDeclaration" label="Müşteri beyanı" defaultValue={defaultDeclaration} rows={4} required />
            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                Müşteri cihazı mevcut haliyle gördüğünü, test ettiğini, bilinen durumları kabul ettiğini ve kanuni hakları saklı kalmak üzere bu satış kaydının esas alınacağını onayladı.
              </span>
            </label>
          </Card>

          <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-600">Satışı tamamladığında stok düşer ve sözleşme kaydı oluşur.</p>
            <button
              type="submit"
              disabled={loading || !accepted}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Satışı ve sözleşmeyi tamamla
            </button>
          </div>
        </form>

        {result && (
          <div className={`mt-6 rounded-3xl border p-6 ${result.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2 font-medium">
              {result.ok && <CheckCircle2 className="h-5 w-5 text-green-700" />}
              {result.ok ? `Satış tamamlandı: ${result.saleCode}` : 'Satış tamamlanamadı'}
            </div>
            {result.message && <p className="mt-2 text-sm text-slate-700">{result.message}</p>}
            {result.contractText && (
              <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-white p-4 text-xs leading-5 text-slate-700 whitespace-pre-wrap">
                {result.contractText}
              </pre>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm md:p-6">
      <h2 className="mb-4 text-xl font-light text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function Input({ label, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm text-slate-600">{label}</span>
      <input {...props} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
    </label>
  )
}

function Textarea({ label, className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm text-slate-600">{label}</span>
      <textarea {...props} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
    </label>
  )
}

function Select({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-600">{label}</span>
      <select {...props} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  )
}
