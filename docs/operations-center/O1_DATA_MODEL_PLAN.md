# O1 — Data Model Plan & Migration Blueprint

**Document Version:** 1.0.0  
**Target Schema:** Supabase PostgreSQL Schema `public`  
**Reuse Strategy:** Leverage existing `public.products`, `public.customers`, `public.credit_customers`, `public.orders`, `public.sms_notifications`. Add strictly new ledger & workflow tables.

---

## 1. Schema Extensions on Existing Tables

### A. `public.products` Extensions (Alış Fiyatı, Raf, WhatsApp ve Kritik Stok)
```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS min_stock_level INT DEFAULT 5 CHECK (min_stock_level >= 0),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'Adet',
  ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_display_name VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_description TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_sort_order INT DEFAULT 0;
```

---

## 2. New Schema Definitions

### A. Stok Hareketleri Tablosu (`public.stock_movements`)
```sql
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
      'STOK_GIRIS',
      'SATIS',
      'IADE',
      'SAYIM_ARTI',
      'SAYIM_EKSI',
      'HASAR',
      'KULLANIM',
      'BASKI_MALZEME_KULLANIMI',
      'MANUEL_DUZELTME'
    )),
    quantity INT NOT NULL,
    previous_stock INT NOT NULL,
    new_stock INT NOT NULL CHECK (new_stock >= 0),
    reference_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    reference_service_id UUID DEFAULT NULL,
    notes TEXT,
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at);
```

### B. Operasyonel Onaylar Tablosu (`public.operation_approvals`)
```sql
CREATE TABLE IF NOT EXISTS public.operation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_type VARCHAR(50) NOT NULL CHECK (approval_type IN (
      'BULK_SMS',
      'STOCK_ADJUSTMENT',
      'PRICE_CHANGE',
      'WEB_PUBLISH',
      'WHATSAPP_PUBLISH',
      'RETURN_APPROVAL',
      'PRINT_JOB',
      'CUSTOMER_STATUS_CHANGE',
      'LOYALTY_ADJUSTMENT'
    )),
    requested_by VARCHAR(100) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_value JSONB DEFAULT NULL,
    new_value JSONB DEFAULT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    reviewed_by VARCHAR(100) DEFAULT NULL,
    reviewed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operation_approvals_status ON public.operation_approvals(status);
CREATE INDEX IF NOT EXISTS idx_operation_approvals_type ON public.operation_approvals(approval_type);
```

### C. Baskı İşleri Tablosu (`public.print_jobs`)
```sql
CREATE TABLE IF NOT EXISTS public.print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    file_url TEXT DEFAULT NULL,
    print_type VARCHAR(50) NOT NULL CHECK (print_type IN ('DIGITAL', 'PHOTO', 'DOCUMENT', 'LARGE_FORMAT')),
    color_mode VARCHAR(20) NOT NULL DEFAULT 'BW' CHECK (color_mode IN ('BW', 'COLOR')),
    page_count INT NOT NULL DEFAULT 1 CHECK (page_count > 0),
    copy_count INT NOT NULL DEFAULT 1 CHECK (copy_count > 0),
    duplex BOOLEAN NOT NULL DEFAULT false,
    paper_type VARCHAR(50) DEFAULT 'A4 Standard 80g',
    delivery_type VARCHAR(50) DEFAULT 'STORE_PICKUP',
    price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'NEW' CHECK (status IN (
      'NEW',
      'FILE_RECEIVED',
      'REVIEWING',
      'APPROVED',
      'PRINTING',
      'READY',
      'DELIVERED',
      'CANCELLED'
    )),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_customer_id ON public.print_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON public.print_jobs(status);
```

### D. Sadakat Hesap ve Hareket Defteri (`public.loyalty_accounts` & `public.loyalty_ledger`)
```sql
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE RESTRICT,
    total_points INT NOT NULL DEFAULT 0 CHECK (total_points >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
      'PURCHASE_EARN',
      'SERVICE_EARN',
      'PRINT_EARN',
      'REDEEM',
      'REFUND_REVERSAL',
      'MANUAL_ADJUSTMENT',
      'CAMPAIGN_BONUS'
    )),
    points INT NOT NULL,
    previous_points INT NOT NULL,
    new_points INT NOT NULL CHECK (new_points >= 0),
    reference_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    notes TEXT,
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_customer_id ON public.loyalty_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_account_id ON public.loyalty_ledger(account_id);
```

---

## 3. Strict ACL and Security Directives

- `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated` on `stock_movements`, `operation_approvals`, `print_jobs`, `loyalty_accounts`, `loyalty_ledger`.
- `GRANT ALL` exclusively to `service_role`.
- Row-Level Security (RLS) enabled on all new tables with default-deny stance.
