import { z } from 'zod'

export const deviceSaleSchema = z.object({
  channel: z.enum(['store', 'online']),
  productId: z.string().min(1, 'Ürün seçimi zorunludur.'),
  quantity: z.number().int().min(1).max(20).default(1),
  salePrice: z.number().nonnegative().optional(),
  deviceConditionType: z.enum([
    'new_sealed',
    'new_open_box',
    'display',
    'used',
    'refurbished',
    'authorized_refurbished'
  ]).nullable().optional(),
  deviceCategory: z.enum(['phone', 'tablet', 'computer', 'accessory', 'other']),
  customer: z.object({
    fullName: z.string().min(3, 'Ad soyad zorunludur.'),
    nationalId: z.string().optional().default(''),
    phone: z.string().min(7, 'Telefon zorunludur.'),
    email: z.string().email('Geçerli e-posta giriniz.').optional().or(z.literal('')),
    address: z.string().optional().default(''),
  }),
  device: z.object({
    type: z.enum(['phone', 'tablet', 'computer', 'accessory', 'other']),
    condition: z.enum(['new', 'display', 'used', 'refurbished', 'authorized_refurbished']).nullable().optional(),
    brand: z.string().min(1, 'Marka zorunludur.'),
    model: z.string().min(1, 'Model zorunludur.'),
    imeiOrSerial: z.string().optional().default(''),
    color: z.string().optional().default(''),
    storageRam: z.string().optional().default(''),
    batteryHealth: z.string().optional().default(''),
    boxStatus: z.string().optional().default(''),
    supplierReportNo: z.string().optional().default(''),
    // Tablet/PC fields
    wifiCellular: z.string().optional().default(''),
    hasPenKeyboard: z.string().optional().default(''),
    processor: z.string().optional().default(''),
    ssdCapacity: z.string().optional().default(''),
    screenSize: z.string().optional().default(''),
    batteryCycle: z.string().optional().default(''),
    os: z.string().optional().default(''),
    adapterIncluded: z.string().optional().default(''),
  }),
  cosmetic: z.object({
    screen: z.string().optional().default(''),
    body: z.string().optional().default(''),
    backCover: z.string().optional().default(''),
    cameraLens: z.string().optional().default(''),
    notes: z.string().optional().default(''),
  }),
  tests: z.record(z.string(), z.boolean()).default({}),
  knownIssues: z.array(z.string()).default([]),
  includedItems: z.array(z.string()).default([]),
  customerDeclaration: z.string().min(10, 'Müşteri beyanı eksik.'),
  acceptedLegalNotice: z.literal(true, {
    message: 'Protokol şartlarının kabul edilmesi zorunludur.',
  }),
  signatureDataUrl: z.string().optional().default(''),
})

export type DeviceSaleInput = z.infer<typeof deviceSaleSchema>
