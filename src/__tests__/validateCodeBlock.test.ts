import { describe, it, expect } from 'vitest';
import { validateCodeBlock } from '../handlers/slackEvents';

describe('validateCodeBlock', () => {
  it('코드 블록 없음 → 오류 반환', () => {
    const result = validateCodeBlock('코드 없이 텍스트만');
    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toContain('코드 블록을 찾을 수 없습니다');
  });

  it('빈 코드 블록 → 오류 반환', () => {
    const result = validateCodeBlock('``` ```');
    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toContain('비어있습니다');
  });

  it('언어 태그 없는 유효한 코드 블록', () => {
    const result = validateCodeBlock('```\nfunction hello() {}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe('function hello() {}');
      expect(result.language).toBeUndefined();
    }
  });

  it('언어 태그 있는 유효한 코드 블록', () => {
    const result = validateCodeBlock('```python\ndef hello(): pass\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe('def hello(): pass');
      expect(result.language).toBe('python');
    }
  });

  it('3000자 초과 → 오류 반환', () => {
    const longCode = 'x'.repeat(3001);
    const result = validateCodeBlock(`\`\`\`\n${longCode}\n\`\`\``);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toContain('너무 깁니다');
  });

  it('정확히 3000자 → 유효', () => {
    const code = 'x'.repeat(3000);
    const result = validateCodeBlock(`\`\`\`\n${code}\n\`\`\``);
    expect(result.ok).toBe(true);
  });
});
