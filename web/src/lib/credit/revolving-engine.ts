/**
 * Paket O7 - Revolving Credit Engine & In-Memory Ledger Simulator
 * Strict Accounting & Idempotency Rules using Integer Cents (Kuruş) Internal Math.
 * Zero Floating-Point Drift.
 */

export type TransactionType =
  | 'CREDIT_SALE'
  | 'PAYMENT'
  | 'REFUND'
  | 'REVERSAL'
  | 'FEE'
  | 'WRITE_OFF'
  | 'MANUAL_ADJUSTMENT'
  | 'LIMIT_CHANGE';

export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';

export interface RevolvingAccount {
  id: string;
  customer_id: string;
  credit_limit: number; // Stored in TL (e.g. 1000.00)
  account_status: 'ACTIVE' | 'PENDING_REVIEW' | 'SUSPENDED' | 'CLOSED';
  is_blocked: boolean;
  blocked_reason?: string;
  currency: 'TRY';
  created_at: string;
}

export interface RevolvingTransaction {
  id: string;
  account_id: string;
  transaction_type: TransactionType;
  amount: number; // Amount in TL
  amount_cents: number; // Amount in Integer Cents (kuruş)
  principal_effect_cents: number;
  pending_limit_effect_cents: number;
  status: TransactionStatus;
  reference_type: string;
  reference_id: string;
  reversal_of_transaction_id?: string;
  idempotency_key: string;
  notes?: string;
  actor?: string;
  created_at: string;
}

export interface ApplyTransactionRequest {
  account_id: string;
  transaction_type: TransactionType;
  amount: number; // Amount in TL
  status?: TransactionStatus; // Default CONFIRMED
  reference_type: string;
  reference_id: string;
  reversal_of_transaction_id?: string;
  idempotency_key: string;
  notes?: string;
  actor?: string;
}

export interface AccountBalanceSnapshot {
  credit_limit: number; // TL
  outstanding_principal: number; // TL (Snapshot)
  pending_authorizations: number; // TL (Snapshot)
  available_limit: number; // TL (Calculated dynamically: limit - outstanding - pending)
}

export interface ApplyTransactionResult {
  success: boolean;
  error?: string;
  conflict?: boolean;
  is_replay?: boolean;
  transaction?: RevolvingTransaction;
  snapshot?: AccountBalanceSnapshot;
}

// Convert TL to Integer Cents safely
export function toCents(tlAmount: number): number {
  return Math.round(tlAmount * 100);
}

// Convert Integer Cents to TL safely
export function toTl(cents: number): number {
  return cents / 100;
}

export class RevolvingCreditLedger {
  private account: RevolvingAccount;
  private transactions: RevolvingTransaction[] = [];
  private idempotencyMap: Map<string, { request: ApplyTransactionRequest; result: ApplyTransactionResult }> = new Map();
  private reversedTxIds: Set<string> = new Set();

  constructor(account: RevolvingAccount) {
    this.account = account;
  }

  public getAccount(): RevolvingAccount {
    return { ...this.account };
  }

  public setLimit(newLimitTl: number): { success: boolean; error?: string } {
    if (newLimitTl < 0) {
      return { success: false, error: 'Limit negatif olamaz.' };
    }
    const currentSnapshot = this.computeSnapshot();
    if (newLimitTl < currentSnapshot.outstanding_principal) {
      return { success: false, error: 'Yeni limit mevcut açık anapara borcunun altına indirilemez.' };
    }
    this.account.credit_limit = newLimitTl;
    return { success: true };
  }

  public setBlocked(blocked: boolean, reason?: string) {
    this.account.is_blocked = blocked;
    this.account.blocked_reason = reason;
  }

  public computeSnapshot(): AccountBalanceSnapshot {
    let outstanding_principal_cents = 0;
    let pending_authorizations_cents = 0;

    for (const tx of this.transactions) {
      if (tx.status === 'CONFIRMED') {
        outstanding_principal_cents += tx.principal_effect_cents;
      } else if (tx.status === 'PENDING') {
        pending_authorizations_cents += tx.pending_limit_effect_cents;
      }
    }

    const credit_limit_cents = toCents(this.account.credit_limit);
    const available_limit_cents = credit_limit_cents - outstanding_principal_cents - pending_authorizations_cents;

    return {
      credit_limit: toTl(credit_limit_cents),
      outstanding_principal: toTl(outstanding_principal_cents),
      pending_authorizations: toTl(pending_authorizations_cents),
      available_limit: toTl(available_limit_cents),
    };
  }

  public getTransactionById(txId: string): RevolvingTransaction | undefined {
    return this.transactions.find((t) => t.id === txId);
  }

  public applyTransaction(req: ApplyTransactionRequest): ApplyTransactionResult {
    // 1. Idempotency Key Replay vs Conflict Check
    if (this.idempotencyMap.has(req.idempotency_key)) {
      const cached = this.idempotencyMap.get(req.idempotency_key)!;
      const samePayload =
        cached.request.account_id === req.account_id &&
        cached.request.transaction_type === req.transaction_type &&
        toCents(cached.request.amount) === toCents(req.amount) &&
        cached.request.reference_id === req.reference_id;

      if (samePayload) {
        return { ...cached.result, is_replay: true };
      } else {
        return {
          success: false,
          conflict: true,
          error: 'Aynı idempotency_key farklı veri yükü ile tekrar kullanılamaz (CONFLICT).',
        };
      }
    }

    // 2. Positive Amount Check
    if (typeof req.amount !== 'number' || isNaN(req.amount) || req.amount <= 0) {
      const res: ApplyTransactionResult = { success: false, error: 'İşlem tutarı sıfırdan büyük pozitif bir sayı olmalıdır.' };
      return res;
    }

    const amount_cents = toCents(req.amount);
    const currentSnapshot = this.computeSnapshot();
    const currentAvailableCents = toCents(currentSnapshot.available_limit);
    const currentDebtCents = toCents(currentSnapshot.outstanding_principal);

    let principal_effect_cents = 0;
    let pending_limit_effect_cents = 0;
    const txStatus = req.status || 'CONFIRMED';

    // 3. Transaction Type Business Rule Execution
    switch (req.transaction_type) {
      case 'CREDIT_SALE':
        if (this.account.is_blocked) {
          const res: ApplyTransactionResult = { success: false, error: 'Hesap blokedir. Yeni kredili satış yapılamaz.' };
          this.idempotencyMap.set(req.idempotency_key, { request: req, result: res });
          return res;
        }
        if (amount_cents > currentAvailableCents) {
          const res: ApplyTransactionResult = {
            success: false,
            error: 'Kullanılabilir limit yetersizdir.',
            snapshot: currentSnapshot,
          };
          this.idempotencyMap.set(req.idempotency_key, { request: req, result: res });
          return res;
        }
        if (txStatus === 'CONFIRMED') {
          principal_effect_cents = amount_cents;
        } else if (txStatus === 'PENDING') {
          pending_limit_effect_cents = amount_cents;
        }
        break;

      case 'PAYMENT':
        // Overpayment Guard: Payment cannot exceed outstanding principal debt
        if (amount_cents > currentDebtCents) {
          const res: ApplyTransactionResult = {
            success: false,
            error: 'Ödeme tutarı açık anapara borcundan fazla olamaz (OVERPAYMENT_REJECTED).',
            snapshot: currentSnapshot,
          };
          this.idempotencyMap.set(req.idempotency_key, { request: req, result: res });
          return res;
        }
        // Blocked account CAN accept payments!
        if (txStatus === 'CONFIRMED') {
          principal_effect_cents = -amount_cents;
        }
        // PENDING payments do NOT reduce debt or increase available limit!
        break;

      case 'REFUND':
        // Must reference original sale transaction/order
        if (!req.reference_id) {
          const res: ApplyTransactionResult = { success: false, error: 'İade için orijinal satış referansı zorunludur.' };
          return res;
        }
        // Calculate total previously refunded for this reference
        let previousRefundCents = 0;
        let originalSaleCents = 0;
        let foundOriginalSale = false;

        for (const tx of this.transactions) {
          if (tx.reference_id === req.reference_id && tx.transaction_type === 'CREDIT_SALE' && tx.status === 'CONFIRMED') {
            originalSaleCents += tx.amount_cents;
            foundOriginalSale = true;
          }
          if (tx.reference_id === req.reference_id && tx.transaction_type === 'REFUND' && tx.status === 'CONFIRMED') {
            previousRefundCents += tx.amount_cents;
          }
        }

        if (!foundOriginalSale) {
          const res: ApplyTransactionResult = { success: false, error: 'İade edilecek orijinal kredili satış kaydı bulunamadı.' };
          this.idempotencyMap.set(req.idempotency_key, { request: req, result: res });
          return res;
        }

        const remainingRefundableCents = originalSaleCents - previousRefundCents;
        if (amount_cents > remainingRefundableCents) {
          const res: ApplyTransactionResult = {
            success: false,
            error: `İade tutarı kalan iade edilebilir tutarı (${toTl(remainingRefundableCents)} TL) aşamaz.`,
            snapshot: currentSnapshot,
          };
          this.idempotencyMap.set(req.idempotency_key, { request: req, result: res });
          return res;
        }

        if (txStatus === 'CONFIRMED') {
          principal_effect_cents = -amount_cents;
        }
        break;

      case 'REVERSAL':
        if (!req.reversal_of_transaction_id) {
          const res: ApplyTransactionResult = { success: false, error: 'Reversal işlemi için orijinal transaction_id zorunludur.' };
          return res;
        }
        if (this.reversedTxIds.has(req.reversal_of_transaction_id)) {
          const res: ApplyTransactionResult = { success: false, error: 'Aynı hareket ikinci kez terslenemez (DOUBLE_REVERSAL_REJECTED).' };
          this.idempotencyMap.set(req.idempotency_key, { request: req, result: res });
          return res;
        }
        const origTx = this.transactions.find((t) => t.id === req.reversal_of_transaction_id);
        if (!origTx) {
          const res: ApplyTransactionResult = { success: false, error: 'Terslenecek orijinal hareket bulunamadı.' };
          return res;
        }
        principal_effect_cents = -origTx.principal_effect_cents;
        pending_limit_effect_cents = -origTx.pending_limit_effect_cents;
        this.reversedTxIds.add(req.reversal_of_transaction_id);
        break;

      default:
        break;
    }

    // FAILED or CANCELLED transactions have zero financial effect
    if (txStatus === 'FAILED' || txStatus === 'CANCELLED') {
      principal_effect_cents = 0;
      pending_limit_effect_cents = 0;
    }

    const newTx: RevolvingTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      account_id: req.account_id,
      transaction_type: req.transaction_type,
      amount: toTl(amount_cents),
      amount_cents,
      principal_effect_cents,
      pending_limit_effect_cents,
      status: txStatus,
      reference_type: req.reference_type,
      reference_id: req.reference_id,
      reversal_of_transaction_id: req.reversal_of_transaction_id,
      idempotency_key: req.idempotency_key,
      notes: req.notes,
      actor: req.actor,
      created_at: new Date().toISOString(),
    };

    this.transactions.push(newTx);
    const updatedSnapshot = this.computeSnapshot();

    const result: ApplyTransactionResult = {
      success: true,
      transaction: newTx,
      snapshot: updatedSnapshot,
    };

    this.idempotencyMap.set(req.idempotency_key, { request: req, result });
    return result;
  }
}
