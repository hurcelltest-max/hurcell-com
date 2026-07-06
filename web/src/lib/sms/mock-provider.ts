import { SmsProvider } from './types';
import { NetgsmProvider, maskPhone } from './netgsm-provider';
import { SenagsmProvider } from './senagsm-provider';

export class MockSmsProvider implements SmsProvider {
  async sendSms(phone: string, message: string) {
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error('FATAL: MockSmsProvider cannot be used in production.');
    }

    const maskedPhone = maskPhone(phone);
    console.log(`[MOCK SMS] To: ${maskedPhone} | Message Length: ${message.length}`);
    return { success: true, messageId: 'mock-' + Date.now() };
  }
}

export function getSmsProvider(): SmsProvider {
  const providerStr = process.env.SMS_PROVIDER;

  if (providerStr === 'senagsm') {
    return new SenagsmProvider();
  }

  if (providerStr === 'netgsm') {
    return new NetgsmProvider();
  }

  if (providerStr === 'mock') {
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error('FATAL: MockSmsProvider cannot be used in production.');
    }
    return new MockSmsProvider();
  }

  throw new Error(`FATAL: Unsupported or missing SMS_PROVIDER: ${providerStr}`);
}
