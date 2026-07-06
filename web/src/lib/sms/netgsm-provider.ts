import { SmsProvider } from './types';

export function maskPhone(phone: string): string {
  if (phone.length >= 10) {
    // 905321234567 -> 90532****567
    return phone.slice(0, 5) + '****' + phone.slice(-3);
  }
  return '****';
}

export class NetgsmProvider implements SmsProvider {
  async sendSms(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const username = process.env.SMS_USERNAME;
    const password = process.env.SMS_PASSWORD;
    const header = process.env.SMS_HEADER;
    const apiUrl = process.env.SMS_API_URL || 'https://api.netgsm.com.tr/sms/send/get';
    
    const maskedPhone = maskPhone(phone);

    if (!username || !password || !header) {
      if (process.env.VERCEL_ENV === 'production') {
        throw new Error('FATAL: NetGSM provider requested but configuration is missing in production.');
      } else {
        console.warn(`WARN: NetGSM variables missing. Simulating failure for ${maskedPhone}.`);
        return { success: false, error: 'Missing NetGSM configuration' };
      }
    }

    try {
      const url = new URL(apiUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'api.netgsm.com.tr' || url.pathname !== '/sms/send/get') {
        throw new Error('FATAL: Invalid API URL domain/path. Only https://api.netgsm.com.tr/sms/send/get is allowed.');
      }

      url.searchParams.append('usercode', username);
      url.searchParams.append('password', password);
      url.searchParams.append('gsmno', phone);
      url.searchParams.append('message', message);
      url.searchParams.append('msgheader', header);
      // NetGSM tr character support
      url.searchParams.append('filter', '0');
      url.searchParams.append('encoding', 'tr');
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        // Do not log full URL since it contains credentials
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const responseText = (await response.text()).trim();
      
      if (!responseText) {
        console.error(`[NetGSM API ERROR] To: ${maskedPhone} | Reason: Empty response from provider`);
        return { success: false, error: 'Empty response from provider' };
      }
      
      const parts = responseText.split(/\s+/);
      const code = parts[0];

      if (code === '00' || code === '01' || code === '02') {
        const messageId = parts.length > 1 ? parts[1] : undefined;
        return { success: true, messageId };
      } else {
        let errorMsg = `NetGSM Error Code: ${code}`;
        switch (code) {
          case '20': errorMsg = 'Message exceeds maximum length or invalid character.'; break;
          case '30': errorMsg = 'Invalid credentials or IP restriction.'; break;
          case '40': errorMsg = 'Invalid Sender ID (SMS_HEADER).'; break;
          case '50': errorMsg = 'Insufficient balance.'; break;
          case '70': errorMsg = 'Invalid parameter in request.'; break;
        }
        console.error(`[NetGSM API ERROR] To: ${maskedPhone} | Reason: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unknown network error';
      console.error(`[NetGSM NETWORK ERROR] To: ${maskedPhone} | Error: ${errMessage}`);
      return { success: false, error: errMessage };
    }
  }
}
