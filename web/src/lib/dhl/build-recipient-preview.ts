import { Order, RecipientPreview } from './types';

export function buildRecipientPreview(order: Order): RecipientPreview {
  return {
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
