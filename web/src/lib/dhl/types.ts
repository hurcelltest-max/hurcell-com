export interface Order {
  id: string;
  order_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  shipping_city?: string | null;
  shipping_district?: string | null;
  shipping_address?: string | null;
  shipping_address_line?: string | null;
  payment_method?: string | null;
  total_amount?: number | null;
}

export interface RecipientPreview {
  recipient: {
    customerId: string;
    refCustomerId: string;
    cityName: string;
    districtName: string;
    cityCode: number;
    districtCode: number;
    address: string;
    bussinessPhoneNumber: string;
    email: string;
    taxOffice: string;
    taxNumber: string;
    fullName: string;
    homePhoneNumber: string;
    mobilePhoneNumber: string;
  };
}

export interface OrderPreview {
  order: {
    referenceId: string;
    barcode: string;
    billOfLandingId: string;
    isCOD: number;
    codAmount: number;
    shipmentServiceType: number;
    packagingType: number;
    content: string;
    smsPreference1: number;
    smsPreference2: number;
    smsPreference3: number;
    paymentType: number;
    deliveryType: number;
    description: string;
    marketPlaceShortCode: string;
    marketPlaceSaleCode: string;
    pudoId: string;
  };
  orderPieceList: Array<{
    barcode: string;
    desi: number;
    kg: number;
    content: string;
  }>;
  recipient: RecipientPreview['recipient'];
}

export interface BarcodePreview {
  referenceId: string;
  billOfLandingId: string;
  isCOD: number;
  codAmount: number;
  packagingType: number;
  printReferenceBarcodeOnError: number;
  message: string;
  additionalContent1: string;
  additionalContent2: string;
  additionalContent3: string;
  additionalContent4: string;
  orderPieceList: Array<{
    barcode: string;
    desi: number;
    kg: number;
    content: string;
  }>;
}
