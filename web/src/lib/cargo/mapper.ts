export const cargoStatusMapper = (externalStatus: string): string => {
  const normalizedStatus = externalStatus.trim().toLowerCase();
  
  const statusMap: Record<string, string> = {
    'taşıma halinde': 'shipped',
    'teslim edildi': 'delivered',
    'teslimat başarısız': 'delivery_failed',
    'sorunlu': 'delivery_failed',
    'şubede bekliyor': 'not_delivered',
    'müşteri kabul etmedi': 'customer_refused',
    'iade döndü': 'returned'
  };

  return statusMap[normalizedStatus] || 'shipped'; // Fallback to shipped
};

// Mock function for simulating DHL/MNG tracking response
export const mockFetchCargoStatus = async (trackingNumber: string): Promise<{ status: string; payload: Record<string, unknown> }> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Determine mock status based on some rule for testing idempotency
  // E.g. ending in 'FAILED' -> 'teslimat başarısız'
  if (trackingNumber.endsWith('FAILED')) {
    return { status: 'teslimat başarısız', payload: { code: 'ERR_01', msg: 'Adreste bulunamadı' } };
  }
  if (trackingNumber.endsWith('DELIVERED')) {
    return { status: 'teslim edildi', payload: { code: 'OK_01', msg: 'Teslim edildi' } };
  }
  if (trackingNumber.endsWith('RETURNED')) {
    return { status: 'iade döndü', payload: { code: 'RET_01', msg: 'İade sürecinde' } };
  }

  // Default mock status
  return { status: 'taşıma halinde', payload: { code: 'TR_01', msg: 'Transfer merkezinde' } };
};
