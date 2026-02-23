import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { checkAndMarkIdempotency, incrementRateLimit } from '../shared/dynamodb';
import { verifySlackSignature, postMessage, getSigningSecret } from '../shared/slack';
import { logger } from '../shared/logger';
import { WorkerPayload } from '../shared/types';

const lambdaClient = new LambdaClient({});

const REVIEW_DAILY_LIMIT = parseInt(process.env.REVIEW_DAILY_LIMIT ?? '10', 10);
const BLOG_DAILY_LIMIT = parseInt(process.env.BLOG_DAILY_LIMIT ?? '5', 10);

// 코드 블록 정규식: ```[언어태그(선택)]\n코드\n```
const CODE_BLOCK_REGEX = /```(\w*)\n?([\s\S]*?)```/;
const MAX_CODE_LENGTH = 3000;

// /review 커맨드 정규식: [문제번호(1~5자리)] [solved|failed(선택)] [코드블록]
const REVIEW_COMMAND_REGEX = /^(\d{1,5})(?:\s+(solved|failed))?\s+([\s\S]*)$/;

// /blog 커맨드: 문제번호로 시작하는지 확인
const BLOG_PROBLEM_REGEX = /^(\d{1,5})(?:\s|$)/;

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const rawBody = event.body ?? '';
  const body = event.isBase64Encoded
    ? Buffer.from(rawBody, 'base64').toString('utf-8')
    : rawBody;
  const headers = event.headers;

  // 1. Slack 서명 검증
  const signingSecret = await getSigningSecret();
  const signature = headers['x-slack-signature'] ?? '';
  const timestamp = headers['x-slack-request-timestamp'] ?? '';

  if (!verifySlackSignature({ signingSecret, signature, timestamp, body })) {
    logger.warn('Slack 서명 검증 실패');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // Slack 슬래시 커맨드는 application/x-www-form-urlencoded 형식
  const params = new URLSearchParams(body);
  const command = params.get('command');
  const text = params.get('text') ?? '';
  const userId = params.get('user_id') ?? '';
  const channelId = params.get('channel_id') ?? '';
  const triggerId = params.get('trigger_id') ?? '';

  logger.info('Slack 커맨드 수신', { command, userId, channelId });

  if (command === '/review') {
    return handleReview({ text, userId, channelId, triggerId });
  }
  if (command === '/blog') {
    return handleBlog({ text, userId, channelId, triggerId });
  }

  return ephemeralResponse('알 수 없는 커맨드입니다.');
};

// ──────────────────────────────────────────
// /review 처리
// ──────────────────────────────────────────
async function handleReview(params: {
  text: string;
  userId: string;
  channelId: string;
  triggerId: string;
}): Promise<APIGatewayProxyResultV2> {
  const { text, userId, channelId, triggerId } = params;

  // 2. 멱등성 확인
  const isDuplicate = await checkAndMarkIdempotency(triggerId);
  if (isDuplicate) {
    logger.info('중복 이벤트 무시', { triggerId });
    return { statusCode: 200, body: '' };
  }

  // 3. /review 커맨드 파싱 (문제 번호 필수)
  const parsed = parseReviewCommand(text);
  if (!parsed.ok) {
    return ephemeralResponse(parsed.message);
  }
  const { problemId, status, code, language } = parsed;

  // 4. 요청 제한 확인
  const count = await incrementRateLimit(userId, 'review');
  if (count > REVIEW_DAILY_LIMIT) {
    return ephemeralResponse(
      `일일 사용 한도를 초과했습니다. 내일 다시 시도해주세요. (${count - 1}/${REVIEW_DAILY_LIMIT})`,
    );
  }

  // 5. 확인 메시지 게시 + ts 캡처
  const threadTs = await postMessage({
    channel: channelId,
    text: '코드 리뷰를 시작합니다. 잠시만 기다려주세요... ⏳',
  });

  // 6. WorkerFunction 비동기 호출
  await invokeWorker({
    command: 'review',
    channel: channelId,
    threadTs,
    userId,
    payload: { code, language, problemId, status },
  });

  // 7. HTTP 200 반환
  return { statusCode: 200, body: '' };
}

// ──────────────────────────────────────────
// /review 커맨드 파싱
// ──────────────────────────────────────────
export function parseReviewCommand(
  text: string,
):
  | { ok: true; problemId: number; status?: 'solved' | 'failed'; code: string; language?: string }
  | { ok: false; message: string } {
  const match = REVIEW_COMMAND_REGEX.exec(text.trim());
  if (!match) {
    return {
      ok: false,
      message:
        '사용법: `/review [문제번호] [solved|failed] \\`\\`\\`코드\\`\\`\\``\n예시: `/review 1753 solved \\`\\`\\`\\ndef solution(): ...\\n\\`\\`\\``',
    };
  }

  const problemId = parseInt(match[1], 10);
  const status = match[2] as 'solved' | 'failed' | undefined;
  const rest = match[3];

  const codeValidation = validateCodeBlock(rest);
  if (!codeValidation.ok) {
    return codeValidation;
  }

  return { ok: true, problemId, status, code: codeValidation.code, language: codeValidation.language };
}

// ──────────────────────────────────────────
// /blog 처리
// ──────────────────────────────────────────
async function handleBlog(params: {
  text: string;
  userId: string;
  channelId: string;
  triggerId: string;
}): Promise<APIGatewayProxyResultV2> {
  const { text, userId, channelId, triggerId } = params;

  // 2. 멱등성 확인
  const isDuplicate = await checkAndMarkIdempotency(triggerId);
  if (isDuplicate) {
    logger.info('중복 이벤트 무시', { triggerId });
    return { statusCode: 200, body: '' };
  }

  // 3. 커맨드 파싱 (문제번호 선택, 코드블록 선택, 텍스트 선택)
  const { problemId, code, topic } = parseBlogCommand(text);
  if (!problemId && !topic) {
    return ephemeralResponse(
      '문제 번호 또는 블로그 주제를 입력해주세요.\n예시:\n• `/blog 1753 \\`\\`\\`코드\\`\\`\\``\n• `/blog 백준 1753번 다익스트라 풀이`',
    );
  }

  // 4. 요청 제한 확인
  const count = await incrementRateLimit(userId, 'blog');
  if (count > BLOG_DAILY_LIMIT) {
    return ephemeralResponse(
      `일일 사용 한도를 초과했습니다. 내일 다시 시도해주세요. (${count - 1}/${BLOG_DAILY_LIMIT})`,
    );
  }

  // 5. 확인 메시지 게시 + ts 캡처
  const threadTs = await postMessage({
    channel: channelId,
    text: '블로그 초안을 생성하고 있습니다. 잠시만 기다려주세요... ✍️',
  });

  // 6. WorkerFunction 비동기 호출
  await invokeWorker({
    command: 'blog',
    channel: channelId,
    threadTs,
    userId,
    payload: { topic, code, problemId },
  });

  // 7. HTTP 200 반환
  return { statusCode: 200, body: '' };
}

// ──────────────────────────────────────────
// 코드 블록 유효성 검사
// ──────────────────────────────────────────
export function validateCodeBlock(
  text: string,
): { ok: true; code: string; language: string | undefined } | { ok: false; message: string } {
  const match = CODE_BLOCK_REGEX.exec(text);

  if (!match) {
    return {
      ok: false,
      message:
        '코드 블록을 찾을 수 없습니다. 코드를 삼중 백틱으로 감싸서 입력해주세요.\n예시:\n`/review 1753 \\`\\`\\`\\ndef solution(): ...\\n\\`\\`\\``',
    };
  }

  const code = match[2]?.trim() ?? '';
  const language = match[1] || undefined;

  if (!code) {
    return { ok: false, message: '코드 블록이 비어있습니다. 리뷰할 코드를 입력해주세요.' };
  }

  if (code.length > MAX_CODE_LENGTH) {
    return {
      ok: false,
      message: `코드가 너무 깁니다. 최대 ${MAX_CODE_LENGTH.toLocaleString()}자까지 지원됩니다. (현재: ${code.length.toLocaleString()}자)`,
    };
  }

  return { ok: true, code, language };
}

// ──────────────────────────────────────────
// /blog 커맨드 파싱
// ──────────────────────────────────────────
export function parseBlogCommand(text: string): {
  problemId?: number;
  code?: string;
  topic: string;
} {
  const trimmed = text.trim();

  let rest = trimmed;
  let problemId: number | undefined;

  // 문제 번호로 시작하면 추출
  const numMatch = BLOG_PROBLEM_REGEX.exec(trimmed);
  if (numMatch) {
    problemId = parseInt(numMatch[1], 10);
    rest = trimmed.slice(numMatch[0].length).trim();
  }

  // 코드 블록 추출
  const codeMatch = CODE_BLOCK_REGEX.exec(rest);
  const code = codeMatch ? codeMatch[2]?.trim() : undefined;

  // 코드 블록 제외한 나머지가 topic
  const topic = codeMatch ? rest.replace(codeMatch[0], '').trim() : rest;

  return { problemId, code, topic };
}

// ──────────────────────────────────────────
// WorkerFunction 비동기 호출
// ──────────────────────────────────────────
async function invokeWorker(workerPayload: WorkerPayload): Promise<void> {
  const functionName = process.env.WORKER_FUNCTION_NAME ?? 'algo-daily-bot-worker';
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // 비동기
      Payload: Buffer.from(JSON.stringify(workerPayload)),
    }),
  );
  logger.info('WorkerFunction 비동기 호출 완료', {
    command: workerPayload.command,
    channel: workerPayload.channel,
  });
}

// ──────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────
function ephemeralResponse(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'ephemeral',
      text: message,
    }),
  };
}
