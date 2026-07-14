import { Order, OrderPreview } from './types';

export function buildOrderPreview(order: Order): OrderPreview {
  const isCOD = order.payment_method === 'cash_on_delivery' ? 1 : 0;
  const codAmount = isCOD === 1 ? (order.total_amount || 0) : 0;
  const refId = order.order_number || order.id.substring(0, 8).toUpperCase();

  return {
    order: {
      referenceId: refId,
      barcode: refId,
      billOfLandingId: refId,
      isCOD,
      codAmount,
      shipmentServiceType: 1,
      packagingType: 3,
      content: 'HurCELL Ürünleri',
      smsPreference1: 0,
      smsPreference2: 0,
      smsPreference3: 0,
      paymentType: 1,
      deliveryType: 1,
      description: `HurCELL Sipariş - ${order.order_number || order.id}`,
      marketPlaceShortCode: '',
      marketPlaceSaleCode: '',
      pudoId: ''
    },
    orderPieceList: [
      {
        barcode: `${order.order_number || order.id}-P1`,
        desi: 2,
        kg: 2,
        content: 'HurCELL Ürünleri',
      }
    ],
    recipient: {
      customerId: '',
      refCustomerId: '',
      cityName: order.shipping_city || 'İSTANBUL',
      districtName: order.shipping_district || 'BAHÇELİEVLER',
      cityCode: 0,
      districtCode: 0,
      address: order.shipping_address || 'Adres detayları eksik',
      bussinessPhoneNumber: '',
      email: order.customer_email || '',
      taxOffice: '',
      taxNumber: '',
      fullName: order.customer_name || 'Alıcı Adı',
      homePhoneNumber: '',
      mobilePhoneNumber: order.customer_phone || ''
    }
  };
}
