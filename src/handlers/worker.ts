import { getAIClient, ReviewContext } from '../shared/aiClient';
import { postMessage, postErrorMessage } from '../shared/slack';
import { getProblemById } from '../shared/solvedac';
import { ErrorCode } from '../shared/constants';
import { logger } from '../shared/logger';
import { WorkerPayload } from '../shared/types';

export const handler = async (event: WorkerPayload): Promise<void> => {
  const { command, channel, threadTs } = event;

  try {
    if (command === 'review') {
      await handleReview(event);
    } else if (command === 'blog') {
      await handleBlog(event);
    } else {
      throw new Error(`알 수 없는 커맨드: ${command}`);
    }
  } catch (err) {
    logger.error('WorkerFunction 오류', {
      command,
      channel,
      threadTs,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    const errorCode = resolveErrorCode(err);

    try {
      await postErrorMessage({ channel, threadTs, errorCode });
    } catch (slackErr) {
      // Slack 오류 메시지 게시도 실패하면 re-throw → DLQ로 라우팅
      logger.error('Slack 오류 메시지 게시 실패 — DLQ로 라우팅', {
        slackError: slackErr instanceof Error ? slackErr.message : String(slackErr),
      });
      throw slackErr;
    }
    // 사용자에게 알림 완료 → 정상 종료 (Lambda 재시도 방지)
  }
};

// ──────────────────────────────────────────
// 페이로드 타입 가드
// ──────────────────────────────────────────
function isReviewPayload(
  p: unknown,
): p is { code: string; language?: string; problemId: number; status?: 'solved' | 'failed' } {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as Record<string, unknown>).code === 'string' &&
    typeof (p as Record<string, unknown>).problemId === 'number'
  );
}

function isBlogPayload(p: unknown): p is { topic: string; code?: string } {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as Record<string, unknown>).topic === 'string'
  );
}

// ──────────────────────────────────────────
// review 처리
// ──────────────────────────────────────────
async function handleReview(event: WorkerPayload): Promise<void> {
  const { channel, threadTs } = event;
  if (!isReviewPayload(event.payload)) {
    throw new Error('잘못된 review 페이로드: code 또는 problemId 필드가 없습니다.');
  }
  const { code, language, problemId, status } = event.payload;

  // solved.ac에서 문제 정보 조회 (실패해도 리뷰는 진행)
  const problem = await getProblemById(problemId);
  const context: ReviewContext = { problem: problem ?? undefined, status };

  const ai = await getAIClient();
  const review = await ai.generateCodeReview(code, language, context);

  await postMessage({
    channel,
    threadTs,
    text: review,
  });

  logger.info('코드 리뷰 완료', { channel, threadTs, problemId, hasProblemContext: !!problem });
}

// ──────────────────────────────────────────
// blog 처리
// ──────────────────────────────────────────
async function handleBlog(event: WorkerPayload): Promise<void> {
  const { channel, threadTs } = event;
  if (!isBlogPayload(event.payload)) {
    throw new Error('잘못된 blog 페이로드: topic 필드가 없습니다.');
  }
  const { topic, code } = event.payload;

  const ai = await getAIClient();
  const draft = await ai.generateBlogDraft(topic, code);

  // 블로그 초안은 삼중 백틱 마크다운 코드 블록으로 게시
  const message = `\`\`\`markdown\n${draft}\n\`\`\``;

  // Slack 메시지 4000자 제한 처리: 초과 시 분할
  const chunks = splitMessage(message, 3900);
  for (const chunk of chunks) {
    await postMessage({ channel, threadTs, text: chunk });
  }

  logger.info('블로그 초안 생성 완료', { channel, threadTs, chunks: chunks.length });
}

// ──────────────────────────────────────────
// 오류 코드 분류
// ──────────────────────────────────────────
export function resolveErrorCode(err: unknown): ErrorCode {
  if (!(err instanceof Error)) return ErrorCode.UNKNOWN_ERROR;

  const msg = err.message.toLowerCase();
  if (msg.includes('openai') || msg.includes('gpt')) return ErrorCode.OPENAI_API_ERROR;
  if (msg.includes('anthropic') || msg.includes('claude')) return ErrorCode.CLAUDE_API_ERROR;
  if (msg.includes('google') || msg.includes('gemini')) return ErrorCode.GEMINI_API_ERROR;
  if (msg.includes('solved.ac') || msg.includes('boj')) return ErrorCode.SOLVEDAC_ERROR;
  if (msg.includes('slack')) return ErrorCode.SLACK_POST_ERROR;
  return ErrorCode.UNKNOWN_ERROR;
}

// ──────────────────────────────────────────
// 메시지 분할 (Slack 4000자 제한 대응)
// ──────────────────────────────────────────
export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  // 코드 블록 내용이면 분할 후 각 청크에 백틱 래핑
  const isCodeBlock = text.startsWith('```');
  if (isCodeBlock) {
    // 첫 줄(```markdown)과 마지막 줄(```) 제거 후 내용만 분할
    const lines = text.split('\n');
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    const content = lines.slice(1, -1).join('\n');

    const contentChunks = chunkString(content, maxLength - firstLine.length - lastLine.length - 4);
    return contentChunks.map(
      (chunk, i) =>
        `${firstLine}\n${chunk}${i < contentChunks.length - 1 ? '\n(계속...)' : ''}\n${lastLine}`,
    );
  }

  return chunkString(text, maxLength);
}

function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}
