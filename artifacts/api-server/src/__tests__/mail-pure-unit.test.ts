import { describe, it, expect } from 'vitest';
import { normalizeSubject, evaluateConditionSync, generateSnippet, isPrivateOrLocalUrl } from '../services/mail-utils';

describe('Pure Unit Tests — Mail Utils', () => {
  describe('normalizeSubject', () => {
    it('should return null for null/undefined/empty input', () => {
      expect(normalizeSubject(null)).toBeNull();
      expect(normalizeSubject(undefined)).toBeNull();
      expect(normalizeSubject('')).toBeNull();
    });

    it('should strip Re: prefix', () => {
      expect(normalizeSubject('Re: Hello')).toBe('Hello');
      expect(normalizeSubject('re: Hello')).toBe('Hello');
      expect(normalizeSubject('RE: Hello')).toBe('Hello');
    });

    it('should strip Fwd: prefix', () => {
      expect(normalizeSubject('Fwd: Hello')).toBe('Hello');
      expect(normalizeSubject('fwd: Hello')).toBe('Hello');
      expect(normalizeSubject('FWD: Hello')).toBe('Hello');
    });

    it('should strip Fw: prefix', () => {
      expect(normalizeSubject('Fw: Hello')).toBe('Hello');
      expect(normalizeSubject('fw: Hello')).toBe('Hello');
    });

    it('should strip nested Re:/Fwd: prefixes', () => {
      expect(normalizeSubject('Re: Re: Hello')).toBe('Re: Hello');
    });

    it('should handle extra whitespace around prefix', () => {
      expect(normalizeSubject('Re:  Hello')).toBe('Hello');
      expect(normalizeSubject('Re :Hello')).toBe('Hello');
    });

    it('should return subject unchanged when no prefix', () => {
      expect(normalizeSubject('Hello World')).toBe('Hello World');
      expect(normalizeSubject('Request for info')).toBe('Request for info');
    });

    it('should return null for prefix-only strings', () => {
      expect(normalizeSubject('Re:')).toBeNull();
      expect(normalizeSubject('Fwd: ')).toBeNull();
    });
  });

  describe('evaluateConditionSync', () => {
    const msg = {
      senderType: 'agent',
      senderTrustScore: 85,
      subject: 'Test Invoice #123',
      direction: 'inbound',
      senderVerified: true,
      priority: 'urgent',
      senderAddress: 'bot@agents.example.com',
      body: 'Please review the attached invoice.',
    };

    it('should match eq operator for string fields', () => {
      expect(evaluateConditionSync(msg, { field: 'sender_type', operator: 'eq', value: 'agent' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_type', operator: 'eq', value: 'user' })).toBe(false);
    });

    it('should match neq operator', () => {
      expect(evaluateConditionSync(msg, { field: 'direction', operator: 'neq', value: 'outbound' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'direction', operator: 'neq', value: 'inbound' })).toBe(false);
    });

    it('should match gt/lt operators for numeric fields', () => {
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'gt', value: 80 })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'gt', value: 90 })).toBe(false);
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'lt', value: 90 })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'lt', value: 80 })).toBe(false);
    });

    it('should match gte/lte operators', () => {
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'gte', value: 85 })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'gte', value: 86 })).toBe(false);
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'lte', value: 85 })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_trust', operator: 'lte', value: 84 })).toBe(false);
    });

    it('should match contains operator (case-insensitive)', () => {
      expect(evaluateConditionSync(msg, { field: 'subject', operator: 'contains', value: 'invoice' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'subject', operator: 'contains', value: 'INVOICE' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'subject', operator: 'contains', value: 'payment' })).toBe(false);
    });

    it('should match regex via matches operator', () => {
      expect(evaluateConditionSync(msg, { field: 'subject', operator: 'matches', value: '#\\d+' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'subject', operator: 'matches', value: '^Test' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'subject', operator: 'matches', value: '^Hello' })).toBe(false);
    });

    it('should handle invalid regex gracefully', () => {
      expect(evaluateConditionSync(msg, { field: 'subject', operator: 'matches', value: '[invalid' })).toBe(false);
    });

    it('should handle boolean fields (sender_verified)', () => {
      expect(evaluateConditionSync(msg, { field: 'sender_verified', operator: 'eq', value: true })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_verified', operator: 'eq', value: 'true' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_verified', operator: 'eq', value: false })).toBe(false);
      expect(evaluateConditionSync(msg, { field: 'sender_verified', operator: 'neq', value: false })).toBe(true);
    });

    it('should return false for unknown fields', () => {
      expect(evaluateConditionSync(msg, { field: 'unknown_field', operator: 'eq', value: 'test' })).toBe(false);
    });

    it('should return false for null/undefined field values', () => {
      const nullMsg = { senderType: null, senderTrustScore: null };
      expect(evaluateConditionSync(nullMsg, { field: 'sender_type', operator: 'eq', value: 'agent' })).toBe(false);
    });

    it('should return null for label field (requires async DB lookup)', () => {
      expect(evaluateConditionSync(msg, { field: 'label', operator: 'eq', value: 'important' })).toBeNull();
    });

    it('should return false for unknown operators', () => {
      expect(evaluateConditionSync(msg, { field: 'sender_type', operator: 'unknown_op', value: 'agent' })).toBe(false);
    });

    it('should match body field with contains', () => {
      expect(evaluateConditionSync(msg, { field: 'body', operator: 'contains', value: 'invoice' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'body', operator: 'contains', value: 'missing' })).toBe(false);
    });

    it('should match sender_address with eq', () => {
      expect(evaluateConditionSync(msg, { field: 'sender_address', operator: 'eq', value: 'bot@agents.example.com' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'sender_address', operator: 'eq', value: 'other@agents.local' })).toBe(false);
    });

    it('should match priority field', () => {
      expect(evaluateConditionSync(msg, { field: 'priority', operator: 'eq', value: 'urgent' })).toBe(true);
      expect(evaluateConditionSync(msg, { field: 'priority', operator: 'eq', value: 'normal' })).toBe(false);
    });
  });

  describe('generateSnippet', () => {
    it('should return the body if shorter than max length', () => {
      expect(generateSnippet('Hello world')).toBe('Hello world');
    });

    it('should truncate long bodies with ellipsis', () => {
      const long = 'a'.repeat(300);
      const result = generateSnippet(long, 200);
      expect(result.length).toBe(200);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should collapse whitespace', () => {
      expect(generateSnippet('Hello   world\n\nfoo')).toBe('Hello world foo');
    });

    it('should handle empty string', () => {
      expect(generateSnippet('')).toBe('');
    });

    it('should respect custom max length', () => {
      const result = generateSnippet('Hello world this is a test', 10);
      expect(result.length).toBe(10);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('isPrivateOrLocalUrl', () => {
    it('should detect localhost as private', () => {
      expect(isPrivateOrLocalUrl('http://localhost:8080/hook')).toBe(true);
      expect(isPrivateOrLocalUrl('https://localhost/webhook')).toBe(true);
    });

    it('should detect 127.0.0.1 as private', () => {
      expect(isPrivateOrLocalUrl('http://127.0.0.1:3000/webhook')).toBe(true);
    });

    it('should detect 10.x.x.x as private', () => {
      expect(isPrivateOrLocalUrl('http://10.0.0.1/webhook')).toBe(true);
      expect(isPrivateOrLocalUrl('http://10.255.255.255/hook')).toBe(true);
    });

    it('should detect 192.168.x.x as private', () => {
      expect(isPrivateOrLocalUrl('http://192.168.1.1/webhook')).toBe(true);
      expect(isPrivateOrLocalUrl('http://192.168.0.100:8080/hook')).toBe(true);
    });

    it('should detect 172.16-31.x.x as private', () => {
      expect(isPrivateOrLocalUrl('http://172.16.0.1/hook')).toBe(true);
      expect(isPrivateOrLocalUrl('http://172.31.255.255/hook')).toBe(true);
    });

    it('should detect .local/.internal hostnames as private', () => {
      expect(isPrivateOrLocalUrl('http://myservice.local/hook')).toBe(true);
      expect(isPrivateOrLocalUrl('http://myservice.internal/hook')).toBe(true);
    });

    it('should detect 0.0.0.0 as private', () => {
      expect(isPrivateOrLocalUrl('http://0.0.0.0/hook')).toBe(true);
    });

    it('should allow valid public URLs', () => {
      expect(isPrivateOrLocalUrl('https://hooks.example.com/agent-mail')).toBe(false);
      expect(isPrivateOrLocalUrl('https://api.stripe.com/webhook')).toBe(false);
      expect(isPrivateOrLocalUrl('https://my-app.herokuapp.com/webhook')).toBe(false);
    });

    it('should treat invalid URLs as private (fail closed)', () => {
      expect(isPrivateOrLocalUrl('not-a-url')).toBe(true);
      expect(isPrivateOrLocalUrl('')).toBe(true);
    });
  });
});
