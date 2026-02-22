import { describe, it, expect } from 'vitest';
import { buildReviewUserMessage } from '../shared/aiClient';

describe('buildReviewUserMessage', () => {
  it('문제 맥락 + solved + 언어 + 코드 전체 포함', () => {
    const msg = buildReviewUserMessage('print("hi")', 'python', {
      problem: {
        problemId: 1234,
        title: '피보나치 수',
        tier: 'Gold III',
        tags: ['dp', 'math'],
        url: 'https://boj.kr/1234',
      },
      status: 'solved',
    });

    expect(msg).toContain('[Gold III] 피보나치 수');
    expect(msg).toContain('https://boj.kr/1234');
    expect(msg).toContain('dp, math');
    expect(msg).toContain('정답');
    expect(msg).toContain('python');
    expect(msg).toContain('print("hi")');
  });

  it('status가 failed이면 "오답" 포함', () => {
    const msg = buildReviewUserMessage('code', undefined, { status: 'failed' });
    expect(msg).toContain('오답');
    expect(msg).not.toContain('여부: 정답');
  });

  it('문제 맥락만 있고 status 없음', () => {
    const msg = buildReviewUserMessage('code', undefined, {
      problem: {
        problemId: 1,
        title: 'A+B',
        tier: 'Bronze V',
        tags: [],
        url: 'https://boj.kr/1',
      },
    });
    expect(msg).toContain('[Bronze V] A+B');
    expect(msg).not.toContain('정답 여부');
  });

  it('context 없이 언어 + 코드만', () => {
    const msg = buildReviewUserMessage('def foo(): pass', 'python');
    expect(msg).toContain('python');
    expect(msg).toContain('def foo(): pass');
    expect(msg).not.toContain('문제:');
    expect(msg).not.toContain('정답 여부');
  });

  it('태그가 없으면 태그 라인 생략', () => {
    const msg = buildReviewUserMessage('code', undefined, {
      problem: {
        problemId: 1,
        title: 'A+B',
        tier: 'Bronze V',
        tags: [],
        url: 'https://boj.kr/1',
      },
    });
    expect(msg).not.toContain('태그:');
  });
});
