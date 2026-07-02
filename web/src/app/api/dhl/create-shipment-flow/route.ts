import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: 'orderId gerekli.' }, { status: 400 });
    }

    const host = req.headers.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // 1. Create Recipient Preview
    const recipientRes = await fetch(`${baseUrl}/api/dhl/create-recipient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const recipientData = await recipientRes.json();

    // 2. Create Order Preview
    const orderRes = await fetch(`${baseUrl}/api/dhl/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const orderData = await orderRes.json();

    // 3. Create Barcode Preview
    const barcodeRes = await fetch(`${baseUrl}/api/dhl/create-barcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const barcodeData = await barcodeRes.json();

    return NextResponse.json({
      ok: false,
      message: 'DHL/MNG entegrasyonu dry-run modunda. Gerçek gönderi oluşturulmadı.',
      payloadPreview: {
        step1_createRecipient: recipientData.payloadPreview,
        step2_createOrder: orderData.payloadPreview,
        step3_createBarcode: barcodeData.payloadPreview
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
