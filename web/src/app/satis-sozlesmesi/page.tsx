'use client'

import React, { useMemo, useState, useEffect, useRef, Suspense } from 'react'
import { CheckCircle2, FileText, Loader2, ShieldCheck, Search, ChevronRight, Check, Printer, Signature, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const phoneTestItems = [
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

const tabletTestItems = [
  'Cihaz açıldı / kapandı',
  'Ekran / Dokunmatik kontrol edildi',
  'Kalem desteği / Dokunmatik hassasiyeti',
  'Ön & Arka kamera kontrol edildi',
  'Hoparlör & Mikrofon kontrol edildi',
  'Wi-Fi & Bluetooth kontrol edildi',
  'Şebeke / SIM (Cellular model ise)',
  'Batarya / Şarj soketi kontrol edildi',
  'iCloud / Google hesap kilidi kontrol edildi',
]

const computerTestItems = [
  'Cihaz açıldı / kapandı',
  'Ekran panelinde piksel / görüntü kontrolü',
  'Tüm klavye tuşları kontrol edildi',
  'Trackpad / Mouse kontrolleri',
  'Kamera / Webcam kontrol edildi',
  'Hoparlörler & Mikrofon kontrol edildi',
  'Wi-Fi & Bluetooth kontrolleri',
  'USB / Type-C ve HDMI portları kontrol edildi',
  'Şarj adaptörü ve pil şarj performansı',
  'Isınma / Fan sesi kontrol edildi',
  'Menteşeler ve fiziki aksam kontrol edildi',
  'BitLocker / BIOS / Find My hesap kontrolü',
]

const sealedCheckItems = [
  'Kutu tamamen kapalı ve jelatinli / mühürlü mü?',
  'Kutu üzerindeki jelatin / güvenlik etiketi sağlam mı?',
  'Kutu üzerindeki IMEI / Seri numarası kontrol edildi mi?',
  'Ürün faturası düzenlendi mi?',
  'Garanti belgesi / üretici garanti koşulları alıcıya iletildi mi?',
  'Müşteri cihazı sıfır kapalı kutu olarak teslim almayı onayladı mı?',
]

const defaultDeclarationUsed = 'Cihazı mevcut teknik ve kozmetik durumu ile görerek, test ederek teslim aldım. Belirtilen hususları kabul ediyorum.'
const defaultDeclarationSealed = 'Cihazı sıfır ve kapalı kutu olarak teslim aldım. Cihazın kutusu HurCELL tarafından açılıp test edilmemiştir. Satış sonrası işlemlerin yetkili servis kararına bağlı olduğunu biliyorum.'

const conditionLabels: Record<string, string> = {
  new_sealed: 'Sıfır Kapalı Kutu',
  new_open_box: 'Sıfır Açık Kutu',
  display: 'Teşhir Ürünü',
  used: 'İkinci El',
  refurbished: 'Yenilenmiş',
  authorized_refurbished: 'Yetkili Onarıcı Raporlu',
}

type Product = {
  id: string
  barcode: string
  name: string
  category: string
  brand: string
  model: string
  color: string
  sell_price: number
  stock: number
  ram?: string
  storage?: string
  processor?: string
  screen_size?: string
  device_condition_type?: string
  device_category?: string
}

type Result = {
  ok: boolean
  saleCode?: string
  contractText?: string
  message?: string
}

export default function DeviceSaleContractPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#F8FAFC] pt-28 text-slate-900 pb-20 font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500 font-semibold">Protokol yükleniyor...</p>
        </div>
      </main>
    }>
      <DeviceSaleContractForm />
    </Suspense>
  )
}

function DeviceSaleContractForm() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Form states
  const [channel, setChannel] = useState<'store' | 'online'>('store')
  const [deviceCategory, setDeviceCategory] = useState<'phone' | 'tablet' | 'computer' | 'accessory' | 'other'>('phone')
  const [deviceConditionType, setDeviceConditionType] = useState<
    'new_sealed' | 'new_open_box' | 'display' | 'used' | 'refurbished' | 'authorized_refurbished' | null
  >('used')
  
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [storageRam, setStorageRam] = useState('')
  const [color, setColor] = useState('')

  // Specs specific to Tablet/PC
  const [wifiCellular, setWifiCellular] = useState('')
  const [hasPenKeyboard, setHasPenKeyboard] = useState('')
  const [processor, setProcessor] = useState('')
  const [ssdCapacity, setSsdCapacity] = useState('')
  const [screenSize, setScreenSize] = useState('')
  const [batteryCycle, setBatteryCycle] = useState('')
  const [os, setOs] = useState('')
  const [adapterIncluded, setAdapterIncluded] = useState('')

  const [knownIssues, setKnownIssues] = useState('')
  const [includedItems, setIncludedItems] = useState('Fatura\nŞarj Kablosu')
  const [tests, setTests] = useState<Record<string, boolean>>({})
  const [accepted, setAccepted] = useState(false)

  // Signature state
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  // Determine active test checklist items
  const activeTestItems = useMemo(() => {
    if (deviceConditionType === 'new_sealed') {
      return sealedCheckItems
    }
    if (deviceCategory === 'phone') return phoneTestItems
    if (deviceCategory === 'tablet') return tabletTestItems
    if (deviceCategory === 'computer') return computerTestItems
    return []
  }, [deviceCategory, deviceConditionType])

  const checkedCount = useMemo(() => {
    return activeTestItems.filter(item => tests[item]).length
  }, [tests, activeTestItems])

  // Reset tests when category or condition type changes
  useEffect(() => {
    setTests({})
  }, [deviceCategory, deviceConditionType])

  // Dynamic default customer declaration
  const computedDeclaration = useMemo(() => {
    if (deviceCategory === 'accessory') return 'Aksesuar ürünü teslim aldım.'
    return deviceConditionType === 'new_sealed' ? defaultDeclarationSealed : defaultDeclarationUsed
  }, [deviceConditionType, deviceCategory])

  // Search autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/sales/products?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        if (data.ok) {
          setSearchResults(data.products || [])
        }
      } catch (err) {
        console.error('Ürün arama hatası:', err)
      } finally {
        setSearching(false)
      }
    }, 400)

    return () => clearTimeout(delayDebounce)
  }, [searchQuery])

  // Pre-fill parameters when redirecting from shop/catalog
  useEffect(() => {
    const pId = searchParams.get('productId')
    const pBrand = searchParams.get('brand')
    const pModel = searchParams.get('model')
    const pPrice = searchParams.get('price')
    const pColor = searchParams.get('color')
    const pChannel = searchParams.get('channel')
    const pType = searchParams.get('type')
    const pCondition = searchParams.get('condition')

    if (pId) {
      setSelectedProduct({
        id: pId,
        barcode: pId,
        name: pModel || '',
        brand: pBrand || '',
        model: pModel || '',
        color: pColor || '',
        sell_price: pPrice ? Number(pPrice) : 0,
        category: pType || 'phone',
        stock: 1,
        device_condition_type: pCondition || 'used',
        device_category: pType || 'phone',
      })
    }
    if (pBrand) setBrand(pBrand)
    if (pModel) setModel(pModel)
    if (pPrice) setSalePrice(pPrice)
    if (pColor) setColor(pColor)
    if (pChannel === 'online') setChannel('online')
    if (pType) setDeviceCategory(pType as any)
    if (pCondition) setDeviceConditionType(pCondition as any)
  }, [searchParams])

  // Select autocomplete product
  function handleSelectProduct(prod: Product) {
    setSelectedProduct(prod)
    setBrand(prod.brand || '')
    setModel(prod.name || prod.model || '')
    setSalePrice(prod.sell_price ? prod.sell_price.toString() : '')
    setColor(prod.color || '')
    
    // Automatically map category
    const cat = prod.category?.toLowerCase() || ''
    if (cat.includes('telefon') || cat.includes('cep')) {
      setDeviceCategory('phone')
    } else if (cat.includes('tablet')) {
      setDeviceCategory('tablet')
    } else if (cat.includes('bilgisayar') || cat.includes('laptop') || cat.includes('pc')) {
      setDeviceCategory('computer')
    } else if (cat.includes('aksesuar') || cat.includes('şarj') || cat.includes('kablo')) {
      setDeviceCategory('accessory')
    } else {
      setDeviceCategory('other')
    }

    // Map device condition type from database (defaulting to 'used')
    if (isAcc) {
      setDeviceConditionType(null)
    } else if (prod.device_condition_type) {
      setDeviceConditionType(prod.device_condition_type as any)
    } else {
      setDeviceConditionType('used')
    }

    // Set storage ram from specs
    let specs = ''
    if (prod.storage) specs += `${prod.storage}`
    if (prod.ram) specs += specs ? ` / ${prod.ram} RAM` : `${prod.ram} RAM`
    setStorageRam(specs)

    // Fill spec fields if tablet/PC
    if (prod.processor) setProcessor(prod.processor)
    if (prod.screen_size) setScreenSize(prod.screen_size)

    setSearchQuery('')
    setSearchResults([])
  }

  // Signature canvas setup and drawing helpers
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    let clientX, clientY
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
    ctx.strokeStyle = '#0F172A'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    setIsDrawing(true)
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    let clientX, clientY
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
    setHasSignature(true)
  }

  function stopDrawing() {
    setIsDrawing(false)
  }

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setResult(null)

    // Capture signature if drawn
    let signatureDataUrl = ''
    if (hasSignature && canvasRef.current) {
      signatureDataUrl = canvasRef.current.toDataURL('image/png')
    }

    const form = new FormData(event.currentTarget)
    const productIdVal = selectedProduct ? selectedProduct.id : (form.get('productId') as string)

    const payload = {
      channel,
      productId: productIdVal,
      quantity: Number(form.get('quantity') || 1),
      salePrice: salePrice ? Number(salePrice) : undefined,
      deviceConditionType: deviceCategory === 'accessory' ? null : deviceConditionType,
      deviceCategory,
      customer: {
        fullName: form.get('customerFullName'),
        nationalId: form.get('customerNationalId') || '',
        phone: form.get('customerPhone'),
        email: form.get('customerEmail') || '',
        address: form.get('customerAddress') || '',
      },
      device: {
        type: deviceCategory,
        condition: deviceCategory === 'accessory' ? null : (deviceConditionType === 'new_sealed' ? 'new' : deviceConditionType === 'new_open_box' ? 'new' : deviceConditionType as any),
        brand,
        model,
        imeiOrSerial: form.get('imeiOrSerial') || '',
        color,
        storageRam,
        batteryHealth: (deviceCategory === 'accessory' || deviceConditionType === 'new_sealed') ? 'Fabrika Çıkışlı' : (form.get('batteryHealth') || ''),
        boxStatus: (deviceCategory === 'accessory' || deviceConditionType === 'new_sealed') ? 'Orijinal Kapalı Kutu' : (form.get('boxStatus') || ''),
        supplierReportNo: form.get('supplierReportNo') || '',
        wifiCellular,
        hasPenKeyboard,
        processor,
        ssdCapacity,
        screenSize,
        batteryCycle,
        os,
        adapterIncluded,
      },
      cosmetic: {
        screen: (deviceCategory === 'accessory' || deviceConditionType === 'new_sealed') ? 'Kusursuz (Kapalı Kutu)' : (form.get('screen') || ''),
        body: (deviceCategory === 'accessory' || deviceConditionType === 'new_sealed') ? 'Kusursuz (Kapalı Kutu)' : (form.get('body') || ''),
        backCover: (deviceCategory === 'accessory' || deviceConditionType === 'new_sealed') ? 'Kusursuz (Kapalı Kutu)' : (form.get('backCover') || ''),
        cameraLens: (deviceCategory === 'accessory' || deviceConditionType === 'new_sealed') ? 'Kusursuz (Kapalı Kutu)' : (form.get('cameraLens') || ''),
        notes: form.get('cosmeticNotes') || '',
      },
      tests: deviceCategory === 'accessory' ? {} : tests,
      knownIssues: deviceCategory === 'accessory' ? [] : knownIssues.split('\n').map((item) => item.trim()).filter(Boolean),
      includedItems: deviceCategory === 'accessory' ? [] : includedItems.split('\n').map((item) => item.trim()).filter(Boolean),
      customerDeclaration: form.get('customerDeclaration'),
      acceptedLegalNotice: accepted,
      signatureDataUrl,
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
      setResult({ ok: false, message: 'Bağlantı hatası oluştu. Protokol kaydedilemedi.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] pt-28 text-slate-900 pb-20 font-sans">
      <section className="mx-auto max-w-5xl px-4 md:px-8">
        
        {/* Banner */}
        <div className="mb-8 rounded-3xl border border-blue-100 bg-white/90 p-6 shadow-sm md:p-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <ShieldCheck className="h-4 w-4" /> HurCELL Satış ve Teslim Protokolü
            </span>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              {deviceConditionType === 'new_sealed' ? 'Sıfır Kapalı Kutu Protokolü' : 'Cihaz Kabul & Satış Protokolü'}
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
              Cihaz durumunun hukuki statüsüne (Kapalı Kutu / Kullanılmış / Teşhir / Yenilenmiş) uygun satış ve teslimat akışı.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <Link href="/shop" className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors">Mağaza</Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-bold text-blue-600">Protokol Sistemi</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Arama */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">1. Stok Eşleştirme (Arama)</h2>
              <span className="text-xs text-slate-500">Stok veri tabanından hızlı ürün getir</span>
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Barkod, model, marka veya isim ile ürün arayın..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
              {searching && (
                <div className="absolute right-3 top-3.5">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                </div>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="border border-slate-100 rounded-2xl bg-white shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100 z-10 relative">
                {searchResults.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectProduct(prod)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{prod.brand} {prod.name}</p>
                      <p className="text-xs text-slate-500">
                        Barkod: {prod.barcode || '-'} • Stok: {prod.stock} Adet • Durum: {conditionLabels[prod.device_condition_type as any] || 'İkinci El'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{prod.sell_price.toLocaleString('tr-TR')} TL</span>
                  </button>
                ))}
              </div>
            )}

            {selectedProduct && (
              <div className="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                    {selectedProduct.brand?.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{selectedProduct.brand} {selectedProduct.name}</p>
                    <p className="text-xs text-slate-600">
                      ID: {selectedProduct.id} • Statü: <span className="font-bold text-blue-700">{conditionLabels[selectedProduct.device_condition_type as any] || 'Belirtilmedi'}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                >
                  <Trash2 className="h-4 w-4" /> Eşleşmeyi Kaldır
                </button>
              </div>
            )}
          </section>

          {/* Genel Satış Bilgisi */}
          <Card title="2. Protokol ve Cihaz Sınıfı">
            <div className="grid gap-5 md:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Satış Kanalı</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as 'store' | 'online')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition"
                >
                  <option value="store">Mağaza Satışı</option>
                  <option value="online">Dijital / İnternet Satışı</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Cihaz Kategorisi</label>
                <select
                  value={deviceCategory}
                  onChange={(e) => {
                    const cat = e.target.value as any
                    setDeviceCategory(cat)
                    if (cat === 'accessory') {
                      setDeviceConditionType(null)
                    } else if (deviceConditionType === null) {
                      setDeviceConditionType('used')
                    }
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition"
                >
                  <option value="phone">Cep Telefonu</option>
                  <option value="tablet">Tablet</option>
                  <option value="computer">Bilgisayar</option>
                  <option value="accessory">Aksesuar / Diğer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Cihaz Hukuki Durumu</label>
                <select
                  value={deviceConditionType || ''}
                  onChange={(e) => setDeviceConditionType(e.target.value ? e.target.value as any : null)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition font-semibold text-blue-700"
                  disabled={deviceCategory === 'accessory'}
                >
                  <option value="">Aksesuar (Durum Yok)</option>
                  <option value="used">İkinci El</option>
                  <option value="new_sealed">Sıfır Kapalı Kutu</option>
                  <option value="new_open_box">Sıfır Açık Kutu</option>
                  <option value="display">Teşhir Ürünü</option>
                  <option value="refurbished">Yenilenmiş</option>
                  <option value="authorized_refurbished">Yetkili Onarıcı Raporlu</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Satış Bedeli (TL)</label>
                <input
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  type="number"
                  placeholder="Fiyat girin"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="grid gap-5 md:grid-cols-2 mt-4">
              <Input name="productId" label="Ürün Barkodu / SKU *" defaultValue={selectedProduct?.barcode || selectedProduct?.id || ''} required />
              <Input name="quantity" label="Satış Adedi" type="number" defaultValue="1" min="1" required />
            </div>
          </Card>

          {/* Müşteri Bilgileri */}
          <Card title="3. Müşteri Bilgileri">
            <div className="grid gap-5 md:grid-cols-2">
              <Input name="customerFullName" label="Müşteri Adı Soyadı *" required placeholder="Ad Soyad" />
              <Input name="customerNationalId" label="T.C. Kimlik / Pasaport No" placeholder="Kimlik no" />
              <Input name="customerPhone" label="Telefon Numarası *" required placeholder="Telefon" />
              <Input name="customerEmail" label="E-posta Adresi" type="email" placeholder="E-posta" />
              <Textarea name="customerAddress" label="İkametgah Adresi" className="md:col-span-2" placeholder="Adres" />
            </div>
          </Card>

          {/* Cihaz Özellikleri */}
          <Card title="4. Cihaz Donanım Detayları">
            <div className="grid gap-5 md:grid-cols-3">
              <Input label="Marka *" value={brand} onChange={(e) => setBrand(e.target.value)} required placeholder="Örn: Apple" />
              <Input label="Model *" value={model} onChange={(e) => setModel(e.target.value)} required placeholder="Örn: iPhone 15 Pro" />
              <Input
                name="imeiOrSerial"
                label={deviceCategory === 'accessory' ? "IMEI / Seri Numarası" : "IMEI / Seri Numarası *"}
                required={deviceCategory !== 'accessory'}
                placeholder={deviceCategory === 'accessory' ? "İsteğe bağlı" : "IMEI veya Seri No"}
              />
              <Input label="Renk" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Renk" />
              <Input label="Hafıza / RAM" value={storageRam} onChange={(e) => setStorageRam(e.target.value)} placeholder="Hafıza" />
              
              {deviceConditionType !== 'new_sealed' && (
                <>
                  <Input name="batteryHealth" label="Batarya Durumu / Sağlığı" placeholder="Örn: %85" />
                  <Input name="boxStatus" label="Kutu Durumu" placeholder="Örn: Kutu Var" />
                  <Input name="supplierReportNo" label="Servis / Tedarikçi Rapor No" placeholder="Rapor no" />
                </>
              )}

              {/* Tablet Specifics */}
              {deviceCategory === 'tablet' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Wi-Fi / Cellular</label>
                    <input value={wifiCellular} onChange={(e) => setWifiCellular(e.target.value)} placeholder="Wi-Fi veya Cellular" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Kalem / Klavye Dahil mi</label>
                    <input value={hasPenKeyboard} onChange={(e) => setHasPenKeyboard(e.target.value)} placeholder="Örn: Kalem dahil" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition" />
                  </div>
                </>
              )}

              {/* Laptop Specifics */}
              {deviceCategory === 'computer' && (
                <>
                  <Input label="İşlemci" value={processor} onChange={(e) => setProcessor(e.target.value)} placeholder="Örn: Apple M3" />
                  <Input label="SSD / HDD Kapasitesi" value={ssdCapacity} onChange={(e) => setSsdCapacity(e.target.value)} placeholder="Örn: 512GB SSD" />
                  <Input label="Ekran Boyutu" value={screenSize} onChange={(e) => setScreenSize(e.target.value)} placeholder="Örn: 16 inç" />
                  <Input label="Batarya Döngüsü" value={batteryCycle} onChange={(e) => setBatteryCycle(e.target.value)} placeholder="Örn: 42" />
                  <Input label="İşletim Sistemi" value={os} onChange={(e) => setOs(e.target.value)} placeholder="Örn: macOS" />
                  <Input label="Adaptör Dahil mi" value={adapterIncluded} onChange={(e) => setAdapterIncluded(e.target.value)} placeholder="Örn: Evet (96W)" />
                </>
              )}
            </div>
          </Card>

          {/* Kozmetik Kabul (Sıfır Kapalı Kutu Değilse ve Cihaz İse Gösterilir) */}
          {deviceCategory !== 'accessory' && deviceConditionType !== 'new_sealed' && (
            <Card title="5. Kozmetik Teslim Ayrıntıları">
              <div className="grid gap-5 md:grid-cols-2">
                <Input name="screen" label="Ekran Durumu" placeholder="Temiz / Çizikler var" />
                <Input name="body" label="Kasa / Gövde" placeholder="Kenarlarda ufak izler" />
                <Input name="backCover" label="Arka Kapak" />
                <Input name="cameraLens" label="Kamera Camı / Lens" />
                <Textarea name="cosmeticNotes" label="Genel Çizik / Leke Notları" className="md:col-span-2" placeholder="Diğer detaylar..." />
              </div>
            </Card>
          )}

          {/* Test Formu / Sealed Checklist (Sadece Cihaz İse Gösterilir) */}
          {deviceCategory !== 'accessory' && (
            <Card title={deviceConditionType === 'new_sealed' ? `5. Kutu & Ambalaj Doğrulama (${checkedCount}/${activeTestItems.length})` : `6. Cihaz Fonksiyonel Test Raporu (${checkedCount}/${activeTestItems.length})`}>
              <p className="text-xs text-slate-500 mb-4">
                {deviceConditionType === 'new_sealed' 
                  ? 'Sıfır kapalı kutu ürün doğrulama adımlarını işaretleyin.' 
                  : 'Cihazın test edilip onaylanan donanım fonksiyonlarını işaretleyin.'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {activeTestItems.map((item) => (
                  <label
                    key={item}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-xs font-medium cursor-pointer transition-all ${
                      tests[item]
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!tests[item]}
                      onChange={(event) => setTests((current) => ({ ...current, [item]: event.target.checked }))}
                      className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {/* Bilinen Kusurlar (Kapalı Kutu Değilse ve Cihaz İse Gösterilir) */}
          {deviceCategory !== 'accessory' && deviceConditionType !== 'new_sealed' && (
            <Card title="7. Kusurlar & Beraberinde Verilenler">
              <div className="grid gap-5 md:grid-cols-2">
                <Textarea
                  label="Bilinen Kusurlar"
                  value={knownIssues}
                  onChange={(event) => setKnownIssues(event.target.value)}
                  placeholder="Her satıra bir madde yazın"
                  rows={5}
                />
                <Textarea
                  label="Beraberinde Verilen Aksesuarlar"
                  value={includedItems}
                  onChange={(event) => setIncludedItems(event.target.value)}
                  placeholder="Kutu\nŞarj cihazı"
                  rows={5}
                />
              </div>
            </Card>
          )}

          {/* Müşteri Beyanı */}
          <Card title="8. Müşteri Beyanı ve İmza">
            <div className="space-y-5">
              <Textarea
                key={computedDeclaration}
                name="customerDeclaration"
                label="Müşteri Açık Beyanı"
                defaultValue={computedDeclaration}
                rows={3}
                required
              />
              
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Signature className="h-4 w-4 text-slate-400" /> Müşteri / Yetkili İmzası
                </span>
                <div className="relative border border-slate-200 bg-slate-50 rounded-2xl overflow-hidden h-44 w-full md:w-96">
                  <canvas
                    ref={canvasRef}
                    width={384}
                    height={176}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-full cursor-crosshair touch-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="absolute right-3 bottom-3 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-xl transition-all font-semibold"
                  >
                    Temizle
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  className="mt-0.5 h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="leading-relaxed">
                  <strong>Koşulları Kabul Ediyorum:</strong> Müşteri cihazı durumuna uygun şekilde teslim aldığını, yasal bildirimleri ve protokolü onayladığını beyan eder.
                </span>
              </label>
            </div>
          </Card>

          {/* Form Actions */}
          <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between border border-slate-200">
            <p className="text-xs text-slate-500 max-w-lg leading-relaxed">
              * Kaydet butonuna bastığınızda, cihaz stoktan düşecek ve yasal protokol kaydı Supabase veritabanına güvenli şekilde işlenecektir.
            </p>
            <button
              type="submit"
              disabled={loading || !accepted}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Protokolü ve Satışı Tamamla
            </button>
          </div>
        </form>

        {result && (
          <div className={`mt-8 rounded-3xl border p-6 ${result.ok ? 'border-green-200 bg-green-50/70' : 'border-red-200 bg-red-50/70'}`}>
            <div className="flex items-center gap-3">
              {result.ok ? (
                <div className="h-10 w-10 bg-green-100 text-green-700 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              ) : (
                <div className="h-10 w-10 bg-red-100 text-red-700 rounded-full flex items-center justify-center font-bold">
                  !
                </div>
              )}
              <div>
                <h3 className="font-bold text-slate-900">{result.ok ? 'Protokol Başarıyla Kaydedildi' : 'Hata Oluştu'}</h3>
                {result.saleCode && (
                  <p className="text-sm text-slate-700 mt-0.5">
                    Protokol Kodu: <strong className="font-mono text-blue-700">{result.saleCode}</strong>
                  </p>
                )}
              </div>
            </div>
            {result.message && <p className="mt-3 text-sm text-slate-700 font-medium">{result.message}</p>}
            
            {result.ok && result.saleCode && (
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/satis-sozlesmesi/${result.saleCode}`}
                  className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 py-2.5 px-5 rounded-xl text-xs font-semibold shadow-sm transition-all"
                >
                  <Printer className="h-4 w-4 text-slate-500" /> Detayları Gör / Yazdır
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">{title}</h2>
      {children}
    </section>
  )
}

function Input({ label, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      <input {...props} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
    </label>
  )
}

function Textarea({ label, className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      <textarea {...props} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
    </label>
  )
}
