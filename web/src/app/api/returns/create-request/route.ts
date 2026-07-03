import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import nodemailer from 'nodemailer';

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      order_number,
      customer_name,
      customer_phone,
      customer_email,
      request_type,
      reason,
      description,
      kvkk_approved
    } = body;

    // 1. Validations
    if (!order_number?.trim()) {
      return NextResponse.json(
        { error: 'Sipariş numarası gereklidir.' },
        { status: 400 }
      );
    }

    if (!customer_name?.trim() || !customer_phone?.trim() || !customer_email?.trim()) {
      return NextResponse.json(
        { error: 'Müşteri ad, telefon ve e-posta bilgileri gereklidir.' },
        { status: 400 }
      );
    }

    if (!request_type || !['cancel', 'return', 'exchange'].includes(request_type)) {
      return NextResponse.json(
        { error: 'Geçersiz talep tipi.' },
        { status: 400 }
      );
    }

    if (!reason?.trim()) {
      return NextResponse.json(
        { error: 'Talep nedeni belirtilmelidir.' },
        { status: 400 }
      );
    }

    if (!kvkk_approved) {
      return NextResponse.json(
        { error: 'KVKK ve İade Koşulları onayı zorunludur.' },
        { status: 400 }
      );
    }

    // 2. Fetch order to verify details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_name, customer_email, customer_phone')
      .eq('order_number', order_number)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Belirtilen sipariş bulunamadı.' },
        { status: 404 }
      );
    }

    // Security Check: Make sure customer details somehow match the order
    if (order.customer_email !== customer_email && order.customer_phone !== customer_phone) {
      return NextResponse.json(
        { error: 'Bu sipariş için iade/iptal talebi oluşturmaya yetkiniz yok.' },
        { status: 403 }
      );
    }

    // Check campaign warnings
    let hasCampaignBenefitWarning = false;
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_id')
      .eq('order_id', order.id);

    if (items && items.length > 0) {
      const productIds = items.map((item: any) => item.product_id).filter(Boolean);
      if (productIds.length > 0) {
        // Since campaign benefit columns do not exist, this check is skipped.
        const products: any[] = [];
        if (products && products.length > 0) {
          hasCampaignBenefitWarning = true;
        }
      }
    }

    // 3. Create request record using service role
    const { data: requestRecord, error: insertError } = await supabaseAdmin
      .from('return_requests')
      .insert({
        order_id: order.id,
        order_number_snapshot: order_number,
        customer_name: customer_name.trim(),
        customer_phone: customer_phone.trim(),
        customer_email: customer_email.trim(),
        request_type,
        reason: reason.trim(),
        description: description?.trim() || null,
        status: 'pending'
      })
      .select('id, status')
      .single();

    if (insertError || !requestRecord) {
      console.error('Error creating return request in DB:', insertError);
      return NextResponse.json(
        { error: 'Talep kaydedilirken veritabanı hatası oluştu.' },
        { status: 550 }
      );
    }

    // 4. Send Email Notification synchronously (awaited) but safely (try/catch)
    try {
      const adminEmail = process.env.RETURN_NOTIFICATION_EMAIL;
      const host = process.env.SMTP_HOST;
      const port = process.env.SMTP_PORT;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.SMTP_FROM || user;

      if (!adminEmail || !host || !user || !pass) {
        console.warn('E-posta bildirim ayarları (.env) eksik. Mail gönderilmeyecek.');
      } else {
        const transporter = nodemailer.createTransport({
          host: host,
          port: parseInt(port || '587', 10),
          secure: port === '465',
          auth: { user, pass }
        });

        const typeLabels: Record<string, string> = {
          cancel: 'İptal', return: 'İade', exchange: 'Değişim'
        };

        const adminUrl = process.env.ADMIN_PANEL_URL || 'https://stok.hurcell.com';
        const mailHtml = `
          <h2>Yeni ${typeLabels[request_type]} Talebi Alındı</h2>
          <p><strong>Sipariş Numarası:</strong> ${order_number}</p>
          <p><strong>Müşteri:</strong> ${customer_name.trim()}</p>
          <p><strong>İletişim:</strong> ${customer_email.trim()} / ${customer_phone.trim()}</p>
          <p><strong>Sebep:</strong> ${reason.trim()}</p>
          <p><strong>Açıklama:</strong> ${description?.trim() || 'Yok'}</p>
          ${hasCampaignBenefitWarning ? '<p style="color:red;font-weight:bold;">⚠️ DİKKAT: Bu siparişte kampanya faydası geri isteniyor!</p>' : ''}
          <br/>
          <p><a href="${adminUrl}/iade-talepleri?id=${requestRecord.id}" target="_blank">Admin Panelinde Görüntüle</a></p>
        `;

        await transporter.sendMail({
          from: `"HurCELL Sistem" <${from}>`,
          to: adminEmail,
          subject: `Yeni İade Talebi: ${order_number} - ${customer_name.trim()}`,
          html: mailHtml
        });

        // Mark as email notified
        await supabaseAdmin
          .from('return_requests')
          .update({ email_notified_at: new Date().toISOString() })
          .eq('id', requestRecord.id);
      }
    } catch (err) {
      // Catch mail error, but do NOT fail the whole request
      console.error('Mail gönderme hatası:', err);
    }

    return NextResponse.json({
      request_id: requestRecord.id,
      status: requestRecord.status,
      message: 'Talebiniz başarıyla alınmıştır. İnceleme sürecinden sonra sizinle iletişime geçilecektir.'
    });

  } catch (err: any) {
    console.error('Return request API error:', err);
    return NextResponse.json(
      { error: 'Talep işlenirken bir sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
