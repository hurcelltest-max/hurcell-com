import { SmsProvider } from './types';

export class MockSmsProvider implements SmsProvider {
  async sendSms(phone: string, message: string) {
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error('FATAL: MockSmsProvider cannot be used in production.');
    }
    
    console.log(`[MOCK SMS] To: ${phone} | Message: ${message}`);
    return { success: true, messageId: 'mock-' + Date.now() };
  }
}

// Temporary "Real" placeholder. When real API is ready, replace this.
export class RealSmsProvider implements SmsProvider {
  async sendSms(phone: string, message: string) {
    const isMockMode = process.env.SMS_PROVIDER === 'mock';
    if (isMockMode && process.env.VERCEL_ENV !== 'production') {
       return new MockSmsProvider().sendSms(phone, message);
    }
    
    if (!process.env.SMS_API_KEY) {
      throw new Error('FATAL: Real SMS provider requested but API keys are missing.');
    }
    
    // TODO: Implement real HTTP request to SMS provider here
    console.warn(`[REAL SMS PLACEHOLDER] To: ${phone} | Message: ${message}`);
    return { success: true, messageId: 'real-placeholder-' + Date.now() };
  }
}

export function getSmsProvider(): SmsProvider {
  if (process.env.SMS_PROVIDER === 'mock' && process.env.VERCEL_ENV !== 'production') {
    return new MockSmsProvider();
  }
  return new RealSmsProvider();
}
