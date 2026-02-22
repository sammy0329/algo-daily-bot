import { describe, it, expect } from 'vitest';
import { parseReviewCommand } from '../handlers/slackEvents';

describe('parseReviewCommand', () => {
  it('문제 번호 + solved + 언어 태그 + 코드 블록', () => {
    const result = parseReviewCommand('1234 solved ```python\ndef solve(): pass\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.problemId).toBe(1234);
      expect(result.status).toBe('solved');
      expect(result.code).toBe('def solve(): pass');
      expect(result.language).toBe('python');
    }
  });

  it('문제 번호 + failed + 언어 태그 없는 코드 블록', () => {
    const result = parseReviewCommand('5678 failed ```\nint main() {}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.problemId).toBe(5678);
      expect(result.status).toBe('failed');
      expect(result.code).toBe('int main() {}');
      expect(result.language).toBeUndefined();
    }
  });

  it('문제 번호 + 코드 블록만 (status 생략)', () => {
    const result = parseReviewCommand('1234 ```python\ncode\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.problemId).toBe(1234);
      expect(result.status).toBeUndefined();
      expect(result.code).toBe('code');
    }
  });

  it('5자리 문제 번호', () => {
    const result = parseReviewCommand('99999 ```\ncode\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.problemId).toBe(99999);
    }
  });

  it('문제 번호 없음 → 오류 + 사용법 안내', () => {
    const result = parseReviewCommand('```python\ncode\n```');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('사용법');
    }
  });

  it('6자리 이상 문제 번호 → 오류', () => {
    const result = parseReviewCommand('100000 ```\ncode\n```');
    expect(result.ok).toBe(false);
  });

  it('코드 블록 없음 → 오류', () => {
    const result = parseReviewCommand('1234 solved 코드 없이 텍스트만');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('코드 블록을 찾을 수 없습니다');
    }
  });

  it('빈 입력 → 오류', () => {
    const result = parseReviewCommand('');
    expect(result.ok).toBe(false);
  });

  it('코드가 3000자 초과 → 오류', () => {
    const longCode = 'x'.repeat(3001);
    const result = parseReviewCommand(`1234 \`\`\`\n${longCode}\n\`\`\``);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('너무 깁니다');
    }
  });
});
