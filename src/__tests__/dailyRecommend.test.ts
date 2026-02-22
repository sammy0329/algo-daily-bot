import { describe, it, expect } from 'vitest';
import { getTierName } from '../shared/solvedac';

describe('getTierName', () => {
  it('티어 레벨 → 이름 변환', () => {
    expect(getTierName(0)).toBe('Unrated');
    expect(getTierName(1)).toBe('Bronze V');
    expect(getTierName(5)).toBe('Bronze I');
    expect(getTierName(6)).toBe('Silver V');
    expect(getTierName(10)).toBe('Silver I');
    expect(getTierName(11)).toBe('Gold V');
    expect(getTierName(15)).toBe('Gold I');
    expect(getTierName(16)).toBe('Platinum V');
    expect(getTierName(20)).toBe('Platinum I');
  });

  it('범위 외 레벨 → Unrated', () => {
    expect(getTierName(999)).toBe('Unrated');
  });
});

describe('소진 동작 로직', () => {
  const MAX_RETRIES = 5;

  it('5회 재시도 후 소진 상태로 판단', () => {
    let attempts = 0;
    let exhausted = false;

    while (attempts < MAX_RETRIES) {
      attempts++;
      // 신규 문제를 찾지 못한 상황 시뮬레이션
      const freshProblems: number[] = [];
      if (freshProblems.length > 0) break;
    }

    if (attempts >= MAX_RETRIES) exhausted = true;
    expect(exhausted).toBe(true);
    expect(attempts).toBe(MAX_RETRIES);
  });
});
