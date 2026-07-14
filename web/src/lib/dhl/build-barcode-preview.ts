import { Order, BarcodePreview } from './types';

export function buildBarcodePreview(order: Order): BarcodePreview {
  const isCOD = order.payment_method === 'cash_on_delivery' ? 1 : 0;
  const codAmount = isCOD === 1 ? (order.total_amount || 0) : 0;
  const refId = order.order_number || order.id.substring(0, 8).toUpperCase();

  return {
    referenceId: refId,
    billOfLandingId: refId,
    isCOD,
    codAmount,
    packagingType: 3,
    printReferenceBarcodeOnError: 0,
    message: 'HurCELL Sipariş - Dikkatli taşıyınız',
    additionalContent1: '',
    additionalContent2: '',
    additionalContent3: '',
    additionalContent4: '',
    orderPieceList: [
      {
        barcode: `${order.order_number || order.id}-P1`,
        desi: 2,
        kg: 2,
        content: 'HurCELL Ürünleri',
      },
    ]
  };
}
