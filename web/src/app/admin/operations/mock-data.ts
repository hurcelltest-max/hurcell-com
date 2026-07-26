export interface AccessoryProduct {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  cost_price: number;
  price: number;
  stock: number;
  min_stock_level: number;
  unit: string;
  shelf_location: string;
  is_active: boolean;
  is_web_visible: boolean;
  whatsapp_enabled: boolean;
  whatsapp_price?: number;
  image_url: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  movement_type:
    | 'STOCK_IN'
    | 'SALE'
    | 'RETURN'
    | 'COUNT_INCREASE'
    | 'COUNT_DECREASE'
    | 'DAMAGE'
    | 'INTERNAL_USE'
    | 'PRINT_MATERIAL_USE'
    | 'MANUAL_ADJUSTMENT';
  quantity: number;
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  reference_type?: string;
  reference_id?: string;
  performed_by: string;
  created_at: string;
  note?: string;
}

export interface CustomerSummary {
  id: string;
  full_name: string;
  phone_masked: string;
  email: string;
  registration_source: 'WEB' | 'STORE' | 'WHATSAPP';
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  total_orders: number;
  total_spent: number;
  loyalty_points: number;
  last_activity: string;
}

export interface OperationApproval {
  id: string;
  approval_type:
    | 'MANUAL_ADJUSTMENT'
    | 'COUNT_INCREASE'
    | 'COUNT_DECREASE'
    | 'PRICE_CHANGE'
    | 'WEB_PUBLISH_CHANGE'
    | 'WHATSAPP_PUBLISH_CHANGE'
    | 'BULK_SMS'
    | 'RETURN_APPROVAL'
    | 'PRINT_JOB'
    | 'CUSTOMER_STATUS_CHANGE'
    | 'LOYALTY_ADJUSTMENT';
  requested_by: string;
  requested_at: string;
  description: string;
  old_value?: string;
  new_value?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

export interface PrintJobItem {
  id: string;
  job_number: string;
  customer_name: string;
  customer_phone_masked: string;
  print_type: 'DIGITAL' | 'PHOTO' | 'DOCUMENT' | 'LARGE_FORMAT';
  color_mode: 'BW' | 'COLOR';
  page_count: number;
  copy_count: number;
  paper_type: string;
  delivery_type: 'STORE_PICKUP' | 'CARGO';
  price: number;
  status:
    | 'NEW'
    | 'FILE_RECEIVED'
    | 'REVIEWING'
    | 'APPROVED'
    | 'PRINTING'
    | 'READY'
    | 'DELIVERED'
    | 'CANCELLED';
  created_at: string;
}

// Demo Prototype Mock Dataset
export const MOCK_ACCESSORY_CATEGORIES = [
  'Tüm Aksesuarlar',
  'Şarj Kablosu',
  'Adaptör',
  'Kulaklık',
  'Telefon Kılıfı',
  'Ekran Koruyucu',
  'Powerbank',
  'Araç Şarjı',
  'Telefon Standı',
  'Hafıza Kartı',
  'USB Bellek',
  'Pil',
  'Diğer Aksesuarlar',
];

export const MOCK_PRODUCTS: AccessoryProduct[] = [
  {
    id: 'prod-101',
    sku: 'AKS-KBL-001',
    barcode: '8680001122334',
    name: 'HurCELL Type-C Örgülü Hızlı Şarj Kablosu 1m',
    category: 'Aksesuar',
    subcategory: 'Şarj Kablosu',
    brand: 'HurCELL',
    cost_price: 65,
    price: 180,
    stock: 42,
    min_stock_level: 10,
    unit: 'Adet',
    shelf_location: 'A-01-04',
    is_active: true,
    is_web_visible: true,
    whatsapp_enabled: true,
    whatsapp_price: 175,
    image_url: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400',
    updated_at: '2026-07-26 14:30',
  },
  {
    id: 'prod-102',
    sku: 'AKS-ADP-002',
    barcode: '8680001122341',
    name: 'HurCELL 20W PD Hızlı Adaptör Type-C',
    category: 'Aksesuar',
    subcategory: 'Adaptör',
    brand: 'HurCELL',
    cost_price: 190,
    price: 450,
    stock: 4,
    min_stock_level: 8,
    unit: 'Adet',
    shelf_location: 'A-02-01',
    is_active: true,
    is_web_visible: true,
    whatsapp_enabled: true,
    image_url: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=400',
    updated_at: '2026-07-26 12:15',
  },
  {
    id: 'prod-103',
    sku: 'AKS-KLF-003',
    barcode: '8680001122358',
    name: 'iPhone 15 Pro Magsafe Şeffaf Silikon Kılıf',
    category: 'Aksesuar',
    subcategory: 'Telefon Kılıfı',
    brand: 'SiliconeShield',
    cost_price: 70,
    price: 250,
    stock: 0,
    min_stock_level: 5,
    unit: 'Adet',
    shelf_location: 'B-01-12',
    is_active: true,
    is_web_visible: false,
    whatsapp_enabled: true,
    image_url: 'https://images.unsplash.com/photo-1601593346740-925612772716?w=400',
    updated_at: '2026-07-25 18:00',
  },
  {
    id: 'prod-104',
    sku: 'AKS-KUL-004',
    barcode: '8680001122365',
    name: 'HurCELL Pods Wireless Bluetooth Kulaklık V5.3',
    category: 'Aksesuar',
    subcategory: 'Kulaklık',
    brand: 'HurCELL',
    cost_price: 320,
    price: 890,
    stock: 18,
    min_stock_level: 5,
    unit: 'Adet',
    shelf_location: 'C-03-02',
    is_active: true,
    is_web_visible: true,
    whatsapp_enabled: true,
    whatsapp_price: 850,
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400',
    updated_at: '2026-07-26 10:45',
  },
  {
    id: 'prod-105',
    sku: 'AKS-PWR-005',
    barcode: '8680001122372',
    name: 'HurCELL 10.000 mAh Dijital Göstergeli Powerbank',
    category: 'Aksesuar',
    subcategory: 'Powerbank',
    brand: 'HurCELL',
    cost_price: 280,
    price: 690,
    stock: 3,
    min_stock_level: 5,
    unit: 'Adet',
    shelf_location: 'A-03-05',
    is_active: true,
    is_web_visible: true,
    whatsapp_enabled: true,
    image_url: 'https://images.unsplash.com/photo-1609592424074-29753c1553c3?w=400',
    updated_at: '2026-07-26 15:20',
  },
  {
    id: 'prod-106',
    sku: 'AKS-EKR-006',
    barcode: '8680001122389',
    name: '9H Tam Kavisli Seramik Ekran Koruyucu (Evrensel)',
    category: 'Aksesuar',
    subcategory: 'Ekran Koruyucu',
    brand: 'GlassGuard',
    cost_price: 25,
    price: 120,
    stock: 85,
    min_stock_level: 20,
    unit: 'Adet',
    shelf_location: 'B-04-01',
    is_active: true,
    is_web_visible: true,
    whatsapp_enabled: false,
    image_url: 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=400',
    updated_at: '2026-07-26 09:10',
  },
];

export const MOCK_STOCK_MOVEMENTS: StockMovement[] = [
  {
    id: 'sm-1',
    product_id: 'prod-101',
    product_name: 'HurCELL Type-C Örgülü Hızlı Şarj Kablosu 1m',
    movement_type: 'STOCK_IN',
    quantity: 50,
    quantity_delta: 50,
    stock_before: 0,
    stock_after: 50,
    performed_by: 'Ahmet (Depo Sorumlusu)',
    created_at: '2026-07-20 09:00',
    note: 'Aksesuar Koli Alımı #2026-07A',
  },
  {
    id: 'sm-2',
    product_id: 'prod-101',
    product_name: 'HurCELL Type-C Örgülü Hızlı Şarj Kablosu 1m',
    movement_type: 'SALE',
    quantity: 8,
    quantity_delta: -8,
    stock_before: 50,
    stock_after: 42,
    reference_type: 'ORDER',
    reference_id: '8812a0f1-0000-0000-0000-000000000000',
    performed_by: 'WEB Checkout RPC',
    created_at: '2026-07-26 14:30',
    note: 'Online Web Mağazası Siparişi',
  },
  {
    id: 'sm-3',
    product_id: 'prod-102',
    product_name: 'HurCELL 20W PD Hızlı Adaptör Type-C',
    movement_type: 'MANUAL_ADJUSTMENT',
    quantity: 2,
    quantity_delta: -2,
    stock_before: 6,
    stock_after: 4,
    performed_by: 'Mehmet (Mağaza Müdürü)',
    created_at: '2026-07-26 12:15',
    note: 'Teşhir stant kullanımı için stok düşümü',
  },
];

export const MOCK_CUSTOMERS: CustomerSummary[] = [
  {
    id: 'cust-1',
    full_name: 'Ahmet Yılmaz',
    phone_masked: '90532*****1234',
    email: 'ahmet.yilmaz@example.com',
    registration_source: 'WEB',
    status: 'ACTIVE',
    total_orders: 5,
    total_spent: 4250,
    loyalty_points: 425,
    last_activity: '2026-07-26 16:40',
  },
  {
    id: 'cust-2',
    full_name: 'Zeynep Demir',
    phone_masked: '90555*****9876',
    email: 'zeynep.d@example.com',
    registration_source: 'STORE',
    status: 'ACTIVE',
    total_orders: 12,
    total_spent: 18900,
    loyalty_points: 1890,
    last_activity: '2026-07-25 11:20',
  },
  {
    id: 'cust-3',
    full_name: 'Mustafa Kaya',
    phone_masked: '90505*****4321',
    email: 'm.kaya@example.com',
    registration_source: 'WHATSAPP',
    status: 'SUSPENDED',
    total_orders: 2,
    total_spent: 1200,
    loyalty_points: 120,
    last_activity: '2026-07-24 14:15',
  },
];

export const MOCK_APPROVALS: OperationApproval[] = [
  {
    id: 'app-1',
    approval_type: 'COUNT_INCREASE',
    requested_by: 'Depo Sorumlusu Can',
    requested_at: '2026-07-26 15:10',
    description: 'iPhone 15 Pro Kılıf stoku +10 sayım fazlası ekleme talebi',
    old_value: '0',
    new_value: '10',
    status: 'PENDING',
  },
  {
    id: 'app-2',
    approval_type: 'BULK_SMS',
    requested_by: 'Pazarlama Uzmanı Ayşe',
    requested_at: '2026-07-26 14:00',
    description: 'Yaz Sonu Aksesuar İndirimi Toplu SMS Kampanyası (850 Alıcı)',
    status: 'PENDING',
  },
  {
    id: 'app-3',
    approval_type: 'PRICE_CHANGE',
    requested_by: 'Satın Alma Sorumlusu Ali',
    requested_at: '2026-07-26 10:30',
    description: '20W Adaptör fiyat güncellemeleri (450 TL -> 490 TL)',
    old_value: '450 TL',
    new_value: '490 TL',
    status: 'APPROVED',
  },
];

export const MOCK_PRINT_JOBS: PrintJobItem[] = [
  {
    id: 'pj-1',
    job_number: 'PRT-20260726-01',
    customer_name: 'Kemal Öztürk',
    customer_phone_masked: '90533*****5544',
    print_type: 'DOCUMENT',
    color_mode: 'BW',
    page_count: 45,
    copy_count: 2,
    paper_type: 'A4 80g',
    delivery_type: 'STORE_PICKUP',
    price: 90,
    status: 'PRINTING',
    created_at: '2026-07-26 16:15',
  },
  {
    id: 'pj-2',
    job_number: 'PRT-20260726-02',
    customer_name: 'Selin Arslan',
    customer_phone_masked: '90544*****1122',
    print_type: 'PHOTO',
    color_mode: 'COLOR',
    page_count: 10,
    copy_count: 1,
    paper_type: '10x15 Kuşe Fotoğraf Kağıdı',
    delivery_type: 'STORE_PICKUP',
    price: 150,
    status: 'READY',
    created_at: '2026-07-26 15:45',
  },
];
