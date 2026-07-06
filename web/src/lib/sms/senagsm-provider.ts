import { SmsProvider } from './types';
import { maskPhone } from './netgsm-provider';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

export class SenagsmProvider implements SmsProvider {
  async sendSms(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const username = process.env.SMS_USERNAME;
    const password = process.env.SMS_PASSWORD;
    const header = process.env.SMS_HEADER;
    const apiUrl = process.env.SMS_API_URL || 'https://api.senagsm.com.tr/api/smspost/v1';

    const maskedPhone = maskPhone(phone);

    if (!username || !password || !header) {
      if (process.env.VERCEL_ENV === 'production') {
        throw new Error('FATAL: SENAGSM provider requested but configuration is missing in production.');
      } else {
        console.warn(`WARN: SENAGSM variables missing. Simulating failure for ${maskedPhone}.`);
        return { success: false, error: 'Missing SENAGSM configuration' };
      }
    }

    try {
      const url = new URL(apiUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'api.senagsm.com.tr' || url.pathname !== '/api/smspost/v1') {
        throw new Error('FATAL: Invalid API URL domain/path. Only https://api.senagsm.com.tr/api/smspost/v1 is allowed.');
      }

      const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <username>${escapeXml(username)}</username>
  <password>${escapeXml(password)}</password>
  <header>${escapeXml(header)}</header>
  <validity>3</validity>
  <message>
    <gsm>
      <no>${escapeXml(phone)}</no>
    </gsm>
    <msg>${cdata(message)}</msg>
  </message>
</sms>`;

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
        },
        body: xmlBody,
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const responseText = (await response.text()).trim();

      if (!responseText) {
        console.error(`[SENAGSM API ERROR] To: ${maskedPhone} | Reason: Empty response from provider`);
        return { success: false, error: 'Empty response from provider' };
      }

      const parts = responseText.split(/\s+/);
      const code = parts[0];

      if (code === '00') {
        const messageId = parts.length > 1 ? parts[1] : undefined;
        return { success: true, messageId };
      } else {
        let errorMsg = `SENAGSM Error Code: ${code}`;
        switch (code) {
          case '99': errorMsg = 'UNKNOWN_ERROR'; break;
          case '97': errorMsg = 'USE_POST_METHOD'; break;
          case '91': errorMsg = 'MISSING_POST_DATA'; break;
          case '89': errorMsg = 'WRONG_XML_FORMAT'; break;
          case '87': errorMsg = 'WRONG_USER_OR_PASSWORD'; break;
          case '85': errorMsg = 'WRONG_SMS_HEADER'; break;
          case '84': errorMsg = 'WRONG_SEND_DATE_TIME'; break;
          case '83': errorMsg = 'EMPTY_SMS'; break;
          case '81': errorMsg = 'NOT_ENOUGH_CREDITS'; break;
          case '77': errorMsg = 'DUPLICATED_MESSAGE'; break;
        }
        console.error(`[SENAGSM API ERROR] To: ${maskedPhone} | Reason: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unknown network error';
      console.error(`[SENAGSM NETWORK ERROR] To: ${maskedPhone} | Error: ${errMessage}`);
      return { success: false, error: errMessage };
    }
  }
}
