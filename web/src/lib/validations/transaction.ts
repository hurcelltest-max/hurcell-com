import { z } from 'zod';

export const transactionCategorySchema = z.enum([
  'store_sale',
  'service_fee',
  'print_fee',
  'technical_service_fee',
  'payment',
  'adjustment_debit',
  'adjustment_credit',
  'reversal',
]);

const emptyToUndefined = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return val;
  },
  z.string().optional()
);

const emptyToUndefinedUuid = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return val;
  },
  z.string().uuid('Geçersiz işlem ID').optional()
);

export const addTransactionSchema = z.object({
  cardToken: z.string().trim().min(1, 'Müşteri kart token gerekli'),
  category: transactionCategorySchema,
  amount: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed === '' ? undefined : trimmed.replace(',', '.');
      }
      return val;
    },
    z.union([z.string(), z.number()]).optional().transform((val, ctx) => {
      if (val === undefined || val === null) return undefined;
      const strVal = val.toString();
      
      if (!/^\d+(\.\d{1,2})?$/.test(strVal)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçersiz tutar formatı (Örn: 10, 10.5, 10.50)' });
        return z.NEVER;
      }
      
      const parsed = parseFloat(strVal);
      if (parsed <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Tutar 0\'dan büyük olmalıdır' });
        return z.NEVER;
      }
      
      return parsed;
    })
  ),
  description: z.string().trim().min(1, 'Açıklama zorunludur'),
  payment_method: emptyToUndefined.pipe(
    z.enum(['cash', 'card', 'bank_transfer', 'other'], {
      errorMap: () => ({ message: 'Lütfen geçerli bir tahsilat yöntemi seçiniz.' })
    }).optional()
  ),
  source_reference: emptyToUndefined,
  external_url: emptyToUndefined,
  reversed_transaction_id: emptyToUndefinedUuid,
}).superRefine((data, ctx) => {
  if (data.category !== 'reversal' && data.amount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tutar girilmelidir',
      path: ['amount']
    });
  }

  if (data.category === 'payment' && !data.payment_method) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Ödeme işlemi için ödeme yöntemi seçilmelidir',
      path: ['payment_method']
    });
  }
  if (data.category === 'technical_service_fee' && !data.source_reference) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Teknik servis bedeli için referans (kayıt no) zorunludur',
      path: ['source_reference']
    });
  }
  if (data.category === 'reversal' && !data.reversed_transaction_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'İptal işlemi için orijinal işlem seçilmelidir',
      path: ['reversed_transaction_id']
    });
  }
  if (data.external_url) {
    try {
      const url = new URL(data.external_url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error();
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Harici bağlantı sadece http veya https olabilir',
        path: ['external_url']
      });
    }
  }
});

export type AddTransactionInput = z.infer<typeof addTransactionSchema>;
