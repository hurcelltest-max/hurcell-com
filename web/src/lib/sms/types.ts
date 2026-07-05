export interface SmsProvider {
  /**
   * Sends an SMS message to a single recipient.
   * @param phone Normalized phone number (e.g. 905322362242)
   * @param message Text message content
   */
  sendSms(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }>;
}
