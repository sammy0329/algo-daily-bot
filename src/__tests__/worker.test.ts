import { describe, it, expect } from 'vitest';
import { resolveErrorCode, splitMessage } from '../handlers/worker';
import { ErrorCode } from '../shared/constants';

describe('resolveErrorCode', () => {
  it('OpenAI 오류 분류', () => {
    expect(resolveErrorCode(new Error('OpenAI API rate limit exceeded'))).toBe(ErrorCode.OPENAI_API_ERROR);
    expect(resolveErrorCode(new Error('gpt request failed'))).toBe(ErrorCode.OPENAI_API_ERROR);
  });

  it('Claude 오류 분류', () => {
    expect(resolveErrorCode(new Error('Anthropic API error'))).toBe(ErrorCode.CLAUDE_API_ERROR);
    expect(resolveErrorCode(new Error('claude overloaded'))).toBe(ErrorCode.CLAUDE_API_ERROR);
  });

  it('Gemini 오류 분류', () => {
    expect(resolveErrorCode(new Error('Google API quota exceeded'))).toBe(ErrorCode.GEMINI_API_ERROR);
    expect(resolveErrorCode(new Error('gemini model not found'))).toBe(ErrorCode.GEMINI_API_ERROR);
  });

  it('solved.ac 오류 분류', () => {
    expect(resolveErrorCode(new Error('solved.ac API timeout'))).toBe(ErrorCode.SOLVEDAC_ERROR);
  });

  it('Slack 오류 분류', () => {
    expect(resolveErrorCode(new Error('slack API call failed'))).toBe(ErrorCode.SLACK_POST_ERROR);
  });

  it('알 수 없는 오류', () => {
    expect(resolveErrorCode(new Error('network timeout'))).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(resolveErrorCode('string error')).toBe(ErrorCode.UNKNOWN_ERROR);
  });
});

describe('splitMessage', () => {
  it('3900자 이하 메시지는 분할하지 않음', () => {
    const text = 'a'.repeat(3900);
    expect(splitMessage(text, 3900)).toHaveLength(1);
  });

  it('3900자 초과 일반 텍스트는 분할됨', () => {
    const text = 'a'.repeat(7800);
    const chunks = splitMessage(text, 3900);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(3900);
    expect(chunks[1]).toHaveLength(3900);
  });

  it('코드 블록 메시지는 각 청크에 백틱 래핑', () => {
    const content = 'x'.repeat(8000);
    const message = `\`\`\`markdown\n${content}\n\`\`\``;
    const chunks = splitMessage(message, 3900);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.startsWith('```')).toBe(true);
      expect(chunk.endsWith('```')).toBe(true);
    });
  });
});
