import { describe, it, expect } from 'vitest';
import { KEY, IDEMPOTENCY_TTL_SECONDS } from '../shared/constants';

describe('DynamoDB 키 구성', () => {
  it('PROBLEM 키', () => {
    expect(KEY.PROBLEM(1234)).toBe('PROBLEM#1234');
  });

  it('DATE 키', () => {
    expect(KEY.DATE('2026-02-22')).toBe('DATE#2026-02-22');
  });

  it('IDEMPOTENCY 키', () => {
    expect(KEY.IDEMPOTENCY('Ft06Qabc123')).toBe('IDEMPOTENCY#Ft06Qabc123');
  });

  it('USER 키', () => {
    expect(KEY.USER('U04ABC123')).toBe('USER#U04ABC123');
  });

  it('RATELIMIT 키', () => {
    expect(KEY.RATELIMIT('review', '2026-02-22')).toBe('RATELIMIT#review#2026-02-22');
    expect(KEY.RATELIMIT('blog', '2026-02-22')).toBe('RATELIMIT#blog#2026-02-22');
  });

  it('SOLVED 키', () => {
    expect(KEY.SOLVED('myhandle')).toBe('SOLVED#myhandle');
    expect(KEY.SOLVED_PROBLEM(5555)).toBe('PROBLEM#5555');
  });
});

describe('TTL 계산', () => {
  it('멱등성 TTL은 24시간(86400초)', () => {
    expect(IDEMPOTENCY_TTL_SECONDS).toBe(86400);
  });
});
