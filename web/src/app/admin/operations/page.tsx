'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Package,
  Users,
  MessageSquare,
  ShieldCheck,
  Printer,
  Award,
  ShoppingCart,
  Settings,
  Search,
  Plus,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Layers,
  Filter,
  Eye,
  EyeOff,
  History,
  MapPin,
  Info,
  RefreshCw,
  CheckCircle2,
  Database,
  Loader2,
  Send,
  UserCheck,
  Clock,
  Zap,
  CreditCard,
} from 'lucide-react';
import {
  parseMovementQuantity,
  toQuantityDelta,
  calculatePreviewStock,
  buildStockMovementPayload,
  validateDualConsistency,
} from '@/lib/operations/stock-movement-input';
import {
  MOCK_ACCESSORY_CATEGORIES,
  MOCK_CUSTOMERS,
  MOCK_APPROVALS,
  MOCK_PRINT_JOBS,
} from './mock-data';
import { OperationsProduct } from '@/app/api/admin/operations/products/route';
import { WhatsAppSimulationResult } from '@/lib/whatsapp/types';

type MovementTypeKey = 'STOCK_IN' | 'SALE' | 'RETURN' | 'DAMAGE' | 'INTERNAL_USE' | 'PRINT_MATERIAL_USE';

export default function HurcellOperationsDashboard() {
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'stock'
    | 'whatsapp'
    | 'products'
    | 'customers'
    | 'sms'
    | 'approvals'
    | 'print'
    | 'loyalty'
    | 'orders'
    | 'revolving_credit'
    | 'settings'
  >('overview');

  // Feedback Toast Banner State
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Filter States for Stock Screen
  const [stockCategoryFilter, setStockCategoryFilter] = useState('Tüm Aksesuarlar');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'critical' | 'out' | 'in'>('all');
  const [whatsappFilter, setWhatsappFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // WhatsApp Pilot Simulation State (Manual Click Only - Zero Automatic useEffect Fetch)
  const [activeSimulationScenario, setActiveSimulationScenario] = useState<string>('SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW');
  const simulatedPhone = '+90 555 123 45 67';
  const simulatedMessage = 'Şarj kablosu almak istiyorum.';
  const [isSimulatingWhatsApp, setIsSimulatingWhatsApp] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<WhatsAppSimulationResult | null>(null);

  const handleRunWhatsAppSimulation = async (scenarioOverride?: string) => {
    const scenario = scenarioOverride || activeSimulationScenario;
    setIsSimulatingWhatsApp(true);
    try {
      const res = await fetch('/api/admin/operations/whatsapp/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: simulatedPhone,
          message: simulatedMessage,
          scenario_fixture: scenario,
        }),
      });

      if (res.status === 404) {
        throw new Error('WhatsApp simülatörü bu ortamda devre dışı.');
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'WhatsApp simülasyonu başarısız oldu.');
      }

      setSimulationResult(json.simulation);
      showToast(`Simülasyon çalıştırıldı: ${json.simulation.scenario_id}`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simülasyon çalıştırılırken hata oluştu.';
      showToast(msg, 'error');
    } finally {
      setIsSubmittingMovement(false);
      setIsSimulatingWhatsApp(false);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);

  // Real Production Products State (Connected to GET /api/admin/operations/products)
  const [realProducts, setRealProducts] = useState<OperationsProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [paginationInfo, setPaginationInfo] = useState({ page: 1, limit: 25, total: 0, total_pages: 1 });

  // Selected Product for Stock Movement Drawer
  const [selectedProductForMovement, setSelectedProductForMovement] = useState<OperationsProduct | null>(null);
  const [movementType, setMovementType] = useState<MovementTypeKey>('STOCK_IN');
  const [movementQty, setMovementQty] = useState<number>(10);
  const [movementNotes, setMovementNotes] = useState<string>('');
  const [isSubmittingMovement, setIsSubmittingMovement] = useState<boolean>(false);
  const [movementSubmitError, setMovementSubmitError] = useState<string | null>(null);

  // Idempotency Key state per payload/session
  const [formIdempotencyKey, setFormIdempotencyKey] = useState<string>('');

  // Automatically refresh idempotency key when payload parameters change
  const refreshIdempotencyKey = useCallback(() => {
    setFormIdempotencyKey(crypto.randomUUID());
  }, []);

  // Fetch Real Production Products from API Route
  const fetchRealProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setProductsError(null);

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '25',
      });

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (stockCategoryFilter !== 'Tüm Aksesuarlar' && stockCategoryFilter !== 'Tüm Kategoriler') {
        params.append('category', stockCategoryFilter);
      }

      if (stockStatusFilter === 'critical') params.append('stock', 'low_stock');
      else if (stockStatusFilter === 'out') params.append('stock', 'out_of_stock');
      else if (stockStatusFilter === 'in') params.append('stock', 'in_stock');

      if (whatsappFilter === 'enabled') params.append('whatsapp_enabled', 'true');
      else if (whatsappFilter === 'disabled') params.append('whatsapp_enabled', 'false');

      const res = await fetch(`/api/admin/operations/products?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.request_id) setErrorRequestId(json.request_id);
        throw new Error(json.error || 'Stok ürün listesi alınamadı.');
      }

      setRealProducts(json.data || []);
      setPaginationInfo(json.pagination || { page: 1, limit: 25, total: 0, total_pages: 1 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ürün listesi yüklenirken bağlantı hatası oluştu.';
      setProductsError(msg);
      setRealProducts([]); // Clear list on error, never fallback silently to mock
    } finally {
      setIsLoadingProducts(false);
    }
  }, [currentPage, searchQuery, stockCategoryFilter, stockStatusFilter, whatsappFilter]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!isMounted) return;
      await fetchRealProducts();
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [fetchRealProducts]);

  // Open Movement Drawer with fresh Idempotency Key
  const handleOpenMovementDrawer = (product: OperationsProduct) => {
    setSelectedProductForMovement(product);
    setMovementType('STOCK_IN');
    setMovementQty(10);
    setMovementNotes('');
    setMovementSubmitError(null);
    setFormIdempotencyKey(crypto.randomUUID());
  };

  // Change Movement Type handler (regenerates idempotency key to prevent payload conflict)
  const handleMovementTypeChange = (newType: MovementTypeKey) => {
    setMovementType(newType);
    refreshIdempotencyKey();
  };

  // Change Quantity handler
  const handleMovementQtyChange = (newQty: number) => {
    setMovementQty(newQty);
    refreshIdempotencyKey();
  };

  // Execute Stock Movement Submit
  const handleExecuteStockMovement = async () => {
    if (!selectedProductForMovement) return;

    try {
      const parsedQty = parseMovementQuantity(movementQty);
      const delta = toQuantityDelta(movementType, parsedQty);
      const projectedStock = calculatePreviewStock(selectedProductForMovement.stock, delta);

      if (projectedStock < 0) {
        setMovementSubmitError(`Yetersiz stok! Mevcut stok (${selectedProductForMovement.stock}) düşülecek miktardan (${parsedQty}) azdır.`);
        return;
      }

      const targetProductId = selectedProductForMovement.id;

      const payload = buildStockMovementPayload({
        productId: targetProductId,
        movementType,
        quantity: parsedQty,
        idempotencyKey: formIdempotencyKey,
        notes: movementNotes,
      });

      setIsSubmittingMovement(true);
      setMovementSubmitError(null);

      const res = await fetch('/api/admin/operations/stock-movements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Stok hareketi gerçekleştirilemedi.');
      }

      // Operational Dual Consistency Guard: Check A & Check B
      const dualCheck = validateDualConsistency(payload.quantity_delta, {
        stock_before: json.stock_before,
        stock_after: json.stock_after,
        quantity_delta: json.quantity_delta,
      });

      if (!dualCheck.isConsistent) {
        showToast(
          `UYARI: Sunucu stok doğrulaması başarısız! ${dualCheck.failureReason || 'Veriler yenilendi.'}`,
          'error'
        );
        fetchRealProducts();
        return;
      }

      // Success feedback: Use ONLY server returned stock_after value
      const updatedStock = json.stock_after;
      showToast(
        `Stok hareketi başarıyla işlendi! (Mevcut: ${json.stock_before} → Yeni: ${updatedStock})`,
        'success'
      );

      // Update local state exclusively with server response using immutable targetProductId
      setRealProducts((prev) =>
        prev.map((p) => (p.id === targetProductId ? { ...p, stock: updatedStock } : p))
      );

      setSelectedProductForMovement(null);
      fetchRealProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Stok hareketi işlenirken bir hata oluştu.';
      setMovementSubmitError(msg);
    } finally {
      setIsSubmittingMovement(false);
    }
  };

  // Metrics derived from real database products
  const totalAccessories = paginationInfo.total || realProducts.length;
  const criticalStockCount = realProducts.filter(
    (p) => p.stock > 0 && p.stock <= (p.min_stock_level || 5)
  ).length;
  const outOfStockCount = realProducts.filter((p) => p.stock === 0).length;
  const whatsappEnabledCount = realProducts.filter((p) => p.whatsapp_enabled).length;
  const pendingApprovalsCount = MOCK_APPROVALS.filter((a) => a.status === 'PENDING').length;
  const pendingPrintCount = MOCK_PRINT_JOBS.filter(
    (pj) => pj.status !== 'DELIVERED' && pj.status !== 'CANCELLED'
  ).length;

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      {/* Toast Feedback Notification Banner */}
      {toast && (
        <div
          className={`fixed top-24 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border text-white animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-600 border-emerald-400/30'
              : toast.type === 'error'
              ? 'bg-rose-600 border-rose-400/30'
              : 'bg-blue-600 border-blue-400/30'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : toast.type === 'error' ? (
            <XCircle size={18} />
          ) : (
            <Info size={18} />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header & Subdomain Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              HurCELL Operasyon Merkezi
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <Database size={12} /> Live API Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Production Supabase Veritabanı ve Güvenli RPC Katmanına Bağlı Operasyon Paneli
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 text-xs text-slate-300">
          <span className="font-semibold text-slate-400">Hedef URL:</span>
          <span className="font-mono text-blue-400">operasyon.hurcell.com</span>
          <ExternalLink size={14} className="text-slate-500" />
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800 scrollbar-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <LayoutDashboard size={16} /> Genel Bakış
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 border ${
            activeTab === 'whatsapp'
              ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 shadow-md shadow-purple-900/20'
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800/80 hover:text-slate-200'
          }`}
        >
          <Zap size={14} className={activeTab === 'whatsapp' ? 'text-purple-400 animate-pulse' : 'text-slate-500'} />
          WhatsApp Sipariş Akışı Simülatörü
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            O5 SIMÜLATOR
          </span>
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'stock'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Package size={16} /> Stok (Gerçek Veri)
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'products'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Layers size={16} /> Ürünler & Form
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'customers'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users size={16} /> Müşteriler (Prototip)
        </button>

        <button
          onClick={() => setActiveTab('sms')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'sms'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <MessageSquare size={16} /> SMS (Prototip)
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'approvals'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <ShieldCheck size={16} /> Onaylar ({pendingApprovalsCount})
        </button>

        <button
          onClick={() => setActiveTab('print')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'print'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Printer size={16} /> Baskı İşleri
        </button>

        <button
          onClick={() => setActiveTab('loyalty')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'loyalty'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Award size={16} /> Sadakat
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'orders'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <ShoppingCart size={16} /> Siparişler
        </button>

        <button
          onClick={() => setActiveTab('revolving_credit')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 border ${
            activeTab === 'revolving_credit'
              ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 shadow-md shadow-purple-900/20'
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800/80 hover:text-slate-200'
          }`}
        >
          <CreditCard size={14} className={activeTab === 'revolving_credit' ? 'text-purple-400 animate-pulse' : 'text-slate-500'} />
          Döner Kredi & Borç Ledger (Demo)
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            O7 DEMO
          </span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
              : 'bg-slate-900 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Settings size={16} /> Ayarlar
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. GENEL BAKIŞ (OVERVIEW DASHBOARD) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Live Data High-Contrast Info Banner */}
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-950 shadow-sm">
            <div className="flex items-center gap-3">
              <Database size={20} className="shrink-0 text-emerald-700" />
              <span className="text-xs font-medium text-slate-800">
                <strong className="text-emerald-950 font-bold">Production Stok Verisi Bağlantısı Aktif:</strong> Stok ekranı doğrudan Supabase veritabanına bağlıdır. Müşteri, SMS, Baskı ve Sadakat modülleri prototip aşamasındadır.
              </span>
            </div>
            <button
              onClick={() => fetchRealProducts()}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-600 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm"
            >
              <RefreshCw size={14} className={isLoadingProducts ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>

          {/* Metric KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Toplam Ürün Kataloğu</span>
                <Package size={16} className="text-blue-400" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-white">{totalAccessories}</div>
              <div className="text-[11px] text-slate-500">Production DB Ürün Sayısı</div>
            </div>

            <div className="bg-slate-900 border border-amber-500/20 p-5 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-amber-400 text-xs">
                <span>Kritik Stoklu Ürün</span>
                <AlertTriangle size={16} className="text-amber-400" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-amber-400">{criticalStockCount}</div>
              <div className="text-[11px] text-amber-500/70">Eşik Seviyesi Altında</div>
            </div>

            <div className="bg-slate-900 border border-rose-500/20 p-5 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-rose-400 text-xs">
                <span>Tükenen Stok</span>
                <XCircle size={16} className="text-rose-400" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-rose-400">{outOfStockCount}</div>
              <div className="text-[11px] text-rose-500/70">Stok Miktarı 0</div>
            </div>

            <div className="bg-slate-900 border border-emerald-500/20 p-5 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-emerald-400 text-xs">
                <span>WhatsApp Açık Ürün</span>
                <MessageSquare size={16} className="text-emerald-400" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-emerald-400">{whatsappEnabledCount}</div>
              <div className="text-[11px] text-emerald-500/70">Katalogda Satışa Açık</div>
            </div>
          </div>

          {/* Quick Operational Sub-sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Approvals Summary Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ShieldCheck size={18} className="text-blue-400" /> Bekleyen Onay Talepleri ({pendingApprovalsCount})
                </h3>
                <button
                  onClick={() => setActiveTab('approvals')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                >
                  Tümünü Gör →
                </button>
              </div>

              <div className="space-y-3">
                {MOCK_APPROVALS.filter((a) => a.status === 'PENDING').map((approval) => (
                  <div key={approval.id} className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">{approval.description}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Talep Eden: {approval.requested_by} • {approval.requested_at}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      PENDING
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Print Jobs Summary Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Printer size={18} className="text-purple-400" /> Aktif Baskı İşleri ({pendingPrintCount})
                </h3>
                <button
                  onClick={() => setActiveTab('print')}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
                >
                  Tümünü Gör →
                </button>
              </div>

              <div className="space-y-3">
                {MOCK_PRINT_JOBS.map((job) => (
                  <div key={job.id} className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {job.job_number} • {job.customer_name} ({job.print_type})
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {job.page_count} Sayfa x {job.copy_count} Kopya • {job.price} TL
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {job.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. STOK EKRANI — PRODUCTION GERÇEK VERİ BAĞLANTISI */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          {/* High-Contrast Light Blue Banner */}
          <div className="bg-blue-50 border border-blue-300 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm text-blue-950">
            <div className="flex items-center gap-3">
              <Database className="text-blue-700 shrink-0" size={20} />
              <div>
                <h4 className="text-xs font-extrabold text-blue-950 flex items-center gap-2">
                  Production Stok Verisi Katmanı
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-900 border border-blue-300">
                    Live Server-Side API
                  </span>
                </h4>
                <p className="text-xs font-medium text-slate-800 mt-0.5">
                  Bu tablodaki ürünler ve stok miktarları doğrudan `public.products` veritabanından çekilmektedir.
                </p>
              </div>
            </div>
            <button
              onClick={() => fetchRealProducts()}
              disabled={isLoadingProducts}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm border border-blue-600 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoadingProducts ? 'animate-spin' : ''} /> Refetch
            </button>
          </div>

          {/* Controls Header & Action Bar */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="relative w-full md:w-80">
                <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ürün adı, SKU veya raf ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-2xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
                <button
                  onClick={() => setActiveTab('products')}
                  className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <Plus size={16} /> Yeni Ürün Tanımla (O5)
                </button>
              </div>
            </div>

            {/* Filter Bar Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400 font-semibold mr-1 flex items-center gap-1">
                <Filter size={14} /> Kategori:
              </span>
              {MOCK_ACCESSORY_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setStockCategoryFilter(cat);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                    stockCategoryFilter === cat
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Sub-Filters: Stock Status & WhatsApp Status */}
            <div className="flex flex-wrap items-center gap-4 text-xs pt-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold">Stok Filtresi:</span>
                <select
                  value={stockStatusFilter}
                  onChange={(e) => {
                    setStockStatusFilter(e.target.value as 'all' | 'critical' | 'out' | 'in');
                    setCurrentPage(1);
                  }}
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-1 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="all">Tüm Ürünler</option>
                  <option value="critical">Kritik Stok (Eşik Altı)</option>
                  <option value="out">Stokta Yok (0)</option>
                  <option value="in">Normal Stok (&gt;0)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold">WhatsApp Görünürlük:</span>
                <select
                  value={whatsappFilter}
                  onChange={(e) => {
                    setWhatsappFilter(e.target.value as 'all' | 'enabled' | 'disabled');
                    setCurrentPage(1);
                  }}
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-1 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="all">Tümü</option>
                  <option value="enabled">Satışa Açık</option>
                  <option value="disabled">Kapalı</option>
                </select>
              </div>
            </div>
          </div>

          {/* Products Data Container — Strict State Machine Order: loading -> error -> empty -> data */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
            {isLoadingProducts ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="animate-spin text-blue-400" />
                <span className="text-xs font-semibold">Production veritabanından stok verileri yükleniyor...</span>
              </div>
            ) : productsError ? (
              <div className="p-6 bg-red-50 border border-red-400 m-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-red-900 shadow-md">
                <div className="flex items-center gap-3">
                  <XCircle size={24} className="text-red-700 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-red-900">{productsError}</div>
                    {errorRequestId && (
                      <div className="text-xs font-mono text-red-800 mt-0.5">Request ID: {errorRequestId}</div>
                    )}
                    <p className="text-xs font-medium text-red-800 mt-1">
                      Lütfen ağ bağlantınızı kontrol edin veya &apos;Tekrar Dene&apos; butonuna basın.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => fetchRealProducts()}
                  className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold shrink-0 transition-all cursor-pointer shadow-sm"
                >
                  Tekrar Dene
                </button>
              </div>
            ) : realProducts.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Package size={36} className="mx-auto text-slate-600" />
                <div className="font-semibold text-white text-sm">Filtrelere Uygun Ürün Bulunamadı</div>
                <p className="text-xs text-slate-500">Arama kriterlerinizi değiştirmeyi veya filtreleri temizlemeyi deneyin.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/80 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-4">Ürün Adı & SKU</th>
                      <th className="px-4 py-4">Kategori</th>
                      <th className="px-4 py-4 text-right">Fiyat</th>
                      <th className="px-4 py-4 text-center">Mevcut Stok</th>
                      <th className="px-4 py-4 text-center">Min Eşik</th>
                      <th className="px-4 py-4">Konum</th>
                      <th className="px-4 py-4 text-center">Kanal Rozetleri</th>
                      <th className="px-5 py-4 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {realProducts.map((p) => {
                      const minThreshold = p.min_stock_level || 5;
                      const isCritical = p.stock > 0 && p.stock <= minThreshold;
                      const isOut = p.stock === 0;

                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-white text-xs">{p.name}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              SKU: {p.sku || '-'} • Barkod: {p.barcode || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                              {p.category || 'Genel'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right font-mono">
                            <div className="text-white font-bold">{p.price.toLocaleString('tr-TR')} TL</div>
                            {p.cost_price !== null && (
                              <div className="text-[10px] text-slate-400">Maliyet: {p.cost_price} TL</div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span
                              className={`px-3 py-1 rounded-full font-bold font-mono text-xs ${
                                isOut
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : isCritical
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {p.stock} {p.unit || 'Adet'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center font-mono text-slate-400">{minThreshold}</td>
                          <td className="px-4 py-4 font-mono text-xs text-slate-300">
                            <span className="flex items-center gap-1">
                              <MapPin size={12} className="text-slate-500" /> {p.shelf_location || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {p.is_web_visible ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                  <Eye size={10} /> Web
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700 flex items-center gap-1">
                                  <EyeOff size={10} /> Web
                                </span>
                              )}

                              {p.whatsapp_enabled && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                  <MessageSquare size={10} /> WA
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleOpenMovementDrawer(p)}
                              className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 text-xs font-semibold border border-blue-500/30 flex items-center gap-1 ml-auto cursor-pointer transition-all"
                            >
                              <History size={12} /> Stok Hareket İşle
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {paginationInfo.total_pages > 1 && (
              <div className="p-4 bg-slate-800/40 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Toplam <strong>{paginationInfo.total}</strong> üründen Sayfa <strong>{paginationInfo.page}</strong> / <strong>{paginationInfo.total_pages}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || isLoadingProducts}
                    className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    Önceki
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(paginationInfo.total_pages, p + 1))}
                    disabled={currentPage >= paginationInfo.total_pages || isLoadingProducts}
                    className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Stock Movement Drawer Modal (Connected to Server POST API) */}
          {selectedProductForMovement && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-6 shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <Package size={18} className="text-blue-400" /> Stok Harekatı İşleme (RPC)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedProductForMovement.name}</p>
                  </div>
                  <button
                    onClick={() => setSelectedProductForMovement(null)}
                    disabled={isSubmittingMovement}
                    className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>

                {/* Error Banner inside Modal */}
                {movementSubmitError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-2xl flex items-center gap-2 text-rose-300 text-xs">
                    <AlertTriangle size={16} className="text-rose-400 shrink-0" />
                    <span>{movementSubmitError}</span>
                  </div>
                )}

                {/* Calculated Delta Math Display */}
                {(() => {
                  const qty = Math.abs(movementQty);
                  let signedDelta = qty;
                  if (['SALE', 'DAMAGE', 'INTERNAL_USE', 'PRINT_MATERIAL_USE'].includes(movementType)) {
                    signedDelta = -qty;
                  }
                  const projectedStock = selectedProductForMovement.stock + signedDelta;

                  return (
                    <div className="grid grid-cols-3 gap-3 bg-slate-800/60 p-4 rounded-2xl border border-slate-700">
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold">Mevcut Stok</div>
                        <div className="text-lg font-extrabold text-white font-mono">{selectedProductForMovement.stock}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold">Hesaplanan Değişim</div>
                        <div className={`text-lg font-extrabold font-mono ${signedDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {signedDelta > 0 ? `+${signedDelta}` : signedDelta}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold">Tahmini Yeni Stok</div>
                        <div className={`text-lg font-extrabold font-mono ${projectedStock < 0 ? 'text-rose-500 animate-pulse' : 'text-blue-400'}`}>
                          {projectedStock}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Movement Form Inputs */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Hareket Türü *</label>
                    <select
                      value={movementType}
                      onChange={(e) => handleMovementTypeChange(e.target.value as MovementTypeKey)}
                      disabled={isSubmittingMovement}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none"
                    >
                      <option value="STOCK_IN">STOCK_IN (+ Stok Girişi / Mal Alımı)</option>
                      <option value="RETURN">RETURN (+ Müşteri İadesi)</option>
                      <option value="SALE">SALE (- Satış Düşümü)</option>
                      <option value="DAMAGE">DAMAGE (- Hasarlı / Zayi Düşümü)</option>
                      <option value="INTERNAL_USE">INTERNAL_USE (- Mağaza İçi Sarf / Kullanım)</option>
                      <option value="PRINT_MATERIAL_USE">PRINT_MATERIAL_USE (- Baskı Kağıdı / Sarf)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">Miktar (Pozitif Tam Sayı) *</label>
                    <input
                      type="number"
                      min="1"
                      value={movementQty}
                      onChange={(e) => handleMovementQtyChange(Math.max(1, parseInt(e.target.value, 10) || 0))}
                      disabled={isSubmittingMovement}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">Açıklama / İrsaliye / Notlar</label>
                    <textarea
                      value={movementNotes}
                      onChange={(e) => setMovementNotes(e.target.value)}
                      placeholder="Stok hareket nedeni, tedarikçi irsaliye no veya açıklama..."
                      disabled={isSubmittingMovement}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs h-20 focus:outline-none"
                    />
                  </div>

                  <div className="text-[10px] font-mono text-slate-500 bg-slate-950 p-2 rounded-xl border border-slate-800 truncate">
                    Idempotency Token: {formIdempotencyKey}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => setSelectedProductForMovement(null)}
                    disabled={isSubmittingMovement}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    İptal
                  </button>

                  <button
                    onClick={handleExecuteStockMovement}
                    disabled={
                      isSubmittingMovement ||
                      movementQty <= 0 ||
                      (selectedProductForMovement.stock +
                        (['SALE', 'DAMAGE', 'INTERNAL_USE', 'PRINT_MATERIAL_USE'].includes(movementType)
                          ? -Math.abs(movementQty)
                          : Math.abs(movementQty)) < 0)
                    }
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isSubmittingMovement ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> İşleniyor...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Stok Hareketini Kaydet (RPC)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. ÜRÜNLER MODÜLÜ VE EKLEME FORMU (PRODUCTS & FORM) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="font-bold text-white text-base">Ürün Kayıt & Düzenleme Formu (O5 Taslağı)</h3>
            <p className="text-xs text-slate-400 mt-1">
              Yeni aksesuar ekleme ve toplu güncelleme işlemleri Paket O5 kapsamında aktif edilecektir.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300">Ürün Adı *</label>
              <input
                type="text"
                placeholder="Örn: HurCELL Type-C Örgülü Şarj Kablosu"
                className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">SKU / Kod *</label>
              <input
                type="text"
                placeholder="AKS-KBL-001"
                className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Barkod *</label>
              <input
                type="text"
                placeholder="8680001122334"
                className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={() => showToast('Paket O5: Yeni ürün oluşturma bir sonraki pakette aktifleşecektir.', 'info')}
              className="px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 cursor-pointer"
            >
              Ürünü Kaydet (O5 Hazırlık)
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. MÜŞTERİLER (CUSTOMERS PROTOTYPE) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-white text-base">Genel Müşteri Listesi (public.customers)</h3>
              <p className="text-xs text-slate-400">Telefon numaraları PII güvenliği için maskelenmiştir.</p>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Prototip Veri
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Ad Soyad</th>
                  <th className="px-4 py-3">Telefon</th>
                  <th className="px-4 py-3">E-Posta</th>
                  <th className="px-4 py-3">Kayıt Kaynağı</th>
                  <th className="px-4 py-3 text-center">Durum</th>
                  <th className="px-4 py-3 text-right">Puan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {MOCK_CUSTOMERS.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-white">{c.full_name}</td>
                    <td className="px-4 py-3 font-mono">{c.phone_masked}</td>
                    <td className="px-4 py-3 text-slate-400">{c.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">
                        {c.registration_source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">{c.loyalty_points} Puan</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. WHATSAPP PILOT DASHBOARD (PAKET O5 SIMÜLATOR) */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <div className="bg-blue-950/50 border border-blue-800/60 rounded-2xl p-4 flex items-center justify-between gap-4 text-blue-100 shadow-sm">
            <div className="flex items-center gap-3">
              <Zap className="text-blue-400 shrink-0" size={22} />
              <div>
                <h4 className="text-xs font-extrabold text-blue-200 flex items-center gap-2">
                  Paket O5 — WhatsApp Müşteri, Kredi, Stok & Onay Pilotu (Simülatör)
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-900/80 text-blue-300 border border-blue-700/60">
                    DEMO SIMÜLATOR
                  </span>
                </h4>
                <p className="text-xs font-medium text-blue-300/90 mt-0.5">
                  Yerel/demo simülasyonudur. Gerçek WhatsApp mesajı gönderilmez, veritabanına yazılmaz. Yalnızca buton tıklaması ile manuel simülasyon çalışır.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 p-5 rounded-3xl space-y-4 shadow-md">
            <div className="text-xs font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Send size={16} className="text-emerald-400" /> Senaryo Seçimi & Manuel Simülasyon Çalıştır:
              </span>
              <span className="text-[11px] text-slate-400 font-mono font-normal">
                Otomatik ağ çağrısı yok (Tıklama gereklidir)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW', label: '1. Kayıtlı Müşteri — Kredi Onay Bekliyor' },
                { id: 'SCENARIO_2_REGISTERED_CASH_OPTION', label: '2. Kayıtlı Müşteri — Nakit/Havale Opsiyonu' },
                { id: 'SCENARIO_3_UNREGISTERED_PROMPT', label: '3. Kayıtsız Müşteri — Kayıt Çağrısı' },
                { id: 'SCENARIO_4_OUT_OF_STOCK', label: '4. Stok Yetersiz Senaryosu' },
              ].map((s) => (
                <button
                  key={s.id}
                  disabled={isSimulatingWhatsApp}
                  onClick={() => {
                    setActiveSimulationScenario(s.id);
                    handleRunWhatsAppSimulation(s.id);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 ${
                    activeSimulationScenario === s.id
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                disabled={isSimulatingWhatsApp}
                onClick={() => handleRunWhatsAppSimulation()}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-900/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap size={14} className={isSimulatingWhatsApp ? 'animate-spin' : ''} />
                {isSimulatingWhatsApp ? 'Simülasyon Çalışıyor...' : 'Simülasyonu Çalıştır (Demo İsteği)'}
              </button>
            </div>
          </div>

          {simulationResult && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    Simülasyon Çıktısı: <span className="text-purple-400 font-mono">{simulationResult.scenario_id}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{simulationResult.lookup_method || 'Senaryo Adımı'}</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  State: {simulationResult.current_state}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider flex items-center gap-2">
                    <UserCheck size={14} className="text-blue-400" /> Müşteri & Kredi Karar Önizlemesi
                  </h4>
                  <div className="text-xs space-y-1.5 text-slate-300">
                    <div><span className="text-slate-400">Telefon:</span> <span className="font-mono text-white">{simulationResult.customer?.phone_masked || simulationResult.phone_canonical}</span></div>
                    <div><span className="text-slate-400">Müşteri Adı:</span> <span className="font-semibold text-white">{simulationResult.customer?.full_name || 'Kayıtsız'}</span></div>
                    <div><span className="text-slate-400">Kayıtlı Müşteri mi?:</span> <span className="font-bold text-emerald-400">{simulationResult.customer?.is_registered ? 'EVET' : 'HAYIR'}</span></div>
                    <div><span className="text-slate-400">Kredi Kararı:</span> <span className="font-mono text-amber-400">{simulationResult.credit_decision}</span></div>
                  </div>
                </div>

                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider flex items-center gap-2">
                    <Clock size={14} className="text-purple-400" /> Yapılandırılmış Mesaj Yanıtı (Simüle)
                  </h4>
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-700/80 font-mono text-xs text-emerald-300 whitespace-pre-wrap leading-relaxed">
                    {simulationResult.outgoing_whatsapp_message}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* 3. DÖNER KREDİ & BORÇ LEDGER DASHBOARD (PAKET O7 DEMO) */}
      {activeTab === 'revolving_credit' && (
        <div className="space-y-6">
          <div className="bg-purple-950/40 border border-purple-800/50 rounded-2xl p-4 flex items-center justify-between gap-4 text-purple-100 shadow-sm">
            <div className="flex items-center gap-3">
              <CreditCard className="text-purple-400 shrink-0" size={22} />
              <div>
                <h4 className="text-xs font-extrabold text-purple-200 flex items-center gap-2">
                  Paket O7 — Döner Kredi Motoru & Borç Takip Ledger (Demo / Simülasyon)
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-900/60 text-purple-300 border border-purple-700/50">
                    LOKAL MOCK DEMO
                  </span>
                </h4>
                <p className="text-xs font-medium text-purple-300/80 mt-0.5">
                  Demo / Simülasyon — Gerçek müşteri limiti veya bakiyesi değildir. Veritabanına yazılmaz, finansal kayıt veya RPC işlemi oluşturmaz.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-semibold">Örnek Kredi Limiti</div>
              <div className="text-lg font-bold font-mono text-white">10.000,00 TL</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-semibold">Örnek Borç Bakiye</div>
              <div className="text-lg font-bold font-mono text-amber-400">3.500,00 TL</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-semibold">Örnek Kullanılabilir Limit</div>
              <div className="text-lg font-bold font-mono text-emerald-400">6.500,00 TL</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-semibold">Hesap Durumu</div>
              <div className="text-lg font-bold font-mono text-blue-400">ACTIVE</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold text-white text-base">Örnek Döner Kredi Hareket Ledger (Mock Engine Audit)</h3>
                <p className="text-xs text-slate-400">Tüm hareketler <code className="text-purple-300 font-mono">quantity_delta</code> ve idempotency matematiği ile simüle edilir.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                24 TEST PASSED
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">İşlem Tipi</th>
                    <th className="px-4 py-3">Tutar</th>
                    <th className="px-4 py-3 font-mono">Önceki Bakiye</th>
                    <th className="px-4 py-3 font-mono">Sonraki Bakiye</th>
                    <th className="px-4 py-3 font-mono">Kullanılabilir Limit</th>
                    <th className="px-4 py-3">Referans</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="hover:bg-slate-800/40 font-mono">
                    <td className="px-4 py-3 font-bold text-amber-400">SALE_DEBIT</td>
                    <td className="px-4 py-3 text-white font-bold">+5.000,00 TL</td>
                    <td className="px-4 py-3 text-slate-400">0,00 TL</td>
                    <td className="px-4 py-3 text-amber-400">5.000,00 TL</td>
                    <td className="px-4 py-3 text-emerald-400">5.000,00 TL</td>
                    <td className="px-4 py-3 text-slate-400">ORD-2026-001</td>
                  </tr>
                  <tr className="hover:bg-slate-800/40 font-mono">
                    <td className="px-4 py-3 font-bold text-emerald-400">PAYMENT_CREDIT</td>
                    <td className="px-4 py-3 text-emerald-400 font-bold">-1.500,00 TL</td>
                    <td className="px-4 py-3 text-slate-400">5.000,00 TL</td>
                    <td className="px-4 py-3 text-amber-400">3.500,00 TL</td>
                    <td className="px-4 py-3 text-emerald-400">6.500,00 TL</td>
                    <td className="px-4 py-3 text-slate-400">PAY-2026-089</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
