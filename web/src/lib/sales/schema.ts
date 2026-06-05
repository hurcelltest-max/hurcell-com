import { z } from 'zod'

export const deviceSaleSchema = z.object({
  channel: z.enum(['store', 'online']),
  productId: z.string().min(1, 'Ürün seçimi zorunludur.'),
  quantity: z.number().int().min(1).max(20).default(1),
  salePrice: z.number().nonnegative().optional(),
  customer: z.object({
    fullName: z.string().min(3, 'Ad soyad zorunludur.'),
    nationalId: z.string().optional().default(''),
    phone: z.string().min(7, 'Telefon zorunludur.'),
    email: z.string().email('Geçerli e-posta giriniz.').optional().or(z.literal('')),
    address: z.string().optional().default(''),
  }),
  device: z.object({
    type: z.enum(['phone', 'tablet', 'computer', 'accessory', 'other']),
    condition: z.enum(['new', 'display', 'used', 'refurbished', 'authorized_refurbished']),
    brand: z.string().min(1),
    model: z.string().min(1),
    imeiOrSerial: z.string().min(3, 'IMEI veya seri numarası zorunludur.'),
    color: z.string().optional().default(''),
    storageRam: z.string().optional().default(''),
    batteryHealth: z.string().optional().default(''),
    boxStatus: z.string().optional().default(''),
    supplierReportNo: z.string().optional().default(''),
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
  customerDeclaration: z.string().min(20, 'Müşteri beyanı eksiksiz yazılmalıdır.'),
  acceptedLegalNotice: z.literal(true, {
    error: 'Sözleşme ve cihaz durumu kabul edilmeden satış tamamlanamaz.',
  }),
  signatureDataUrl: z.string().optional().default(''),
})

export type DeviceSaleInput = z.infer<typeof deviceSaleSchema>
