import { Injectable } from '@nestjs/common';

@Injectable()
export class PiiRedactor {
  // Common PII patterns
  private readonly emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private readonly phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  private readonly ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  // Generic card number pattern for further validation
  private readonly creditCardRegex = /\b(?:\d[ -]*?){13,16}\b/g;

  /**
   * Redact sensitive personal data (PII) from text before passing it to public APIs.
   */
  redact(text: string): string {
    if (!text) return text;

    let redacted = text;

    // 1. Redact Emails
    redacted = redacted.replace(this.emailRegex, '[EMAIL]');

    // 2. Redact Phone Numbers
    redacted = redacted.replace(this.phoneRegex, '[PHONE]');

    // 3. Redact Social Security Numbers (US format)
    redacted = redacted.replace(this.ssnRegex, '[SSN]');

    // 4. Redact Credit Cards (matching regex + Luhn checksum validation)
    redacted = redacted.replace(this.creditCardRegex, (match) => {
      const cleaned = match.replace(/[-\s]/g, '');
      if (this.isValidLuhn(cleaned)) {
        return '[CREDIT_CARD]';
      }
      return match; // Return unchanged if not Luhn-valid
    });

    return redacted;
  }

  /**
   * Luhn algorithm validation for credit card numbers.
   */
  private isValidLuhn(cardNumber: string): boolean {
    if (!/^\d+$/.test(cardNumber)) return false;

    let sum = 0;
    let shouldDouble = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber.charAt(i), 10);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }
}
