import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { getSecureParameter } from './ssm';
import { ErrorCode, ERROR_MESSAGES, SSM_PATHS } from './constants';
import { logger } from './logger';

let _client: WebClient | null = null;
let _signingSecret: string | null = null;

async function getClient(): Promise<WebClient> {
  if (!_client) {
    const token = await getSecureParameter(SSM_PATHS.SLACK_BOT_TOKEN);
    _client = new WebClient(token);
  }
  return _client;
}

/** 런타임에 SSM에서 Slack Signing Secret을 조회한다 (캐싱). */
export async function getSigningSecret(): Promise<string> {
  if (!_signingSecret) {
    _signingSecret = await getSecureParameter(SSM_PATHS.SLACK_SIGNING_SECRET);
  }
  return _signingSecret;
}

/** 채널 또는 스레드에 메시지를 게시하고 ts를 반환한다. */
export async function postMessage(params: {
  channel: string;
  text: string;
  threadTs?: string;
}): Promise<string> {
  const client = await getClient();
  const result = await client.chat.postMessage({
    channel: params.channel,
    text: params.text,
    ...(params.threadTs ? { thread_ts: params.threadTs } : {}),
  });
  if (!result.ok || !result.ts) {
    throw new Error(`Slack postMessage 실패: ${result.error}`);
  }
  return result.ts;
}

/** 오류 코드에 해당하는 한국어 메시지를 스레드에 게시한다. */
export async function postErrorMessage(params: {
  channel: string;
  threadTs: string;
  errorCode: ErrorCode;
}): Promise<void> {
  const message = ERROR_MESSAGES[params.errorCode];
  await postMessage({
    channel: params.channel,
    text: message,
    threadTs: params.threadTs,
  });
}

/** Slack 요청 서명을 검증한다. */
export function verifySlackSignature(params: {
  signingSecret: string;
  signature: string;
  timestamp: string;
  body: string;
}): boolean {
  const { signingSecret, signature, timestamp, body } = params;

  // 5분 이상 지난 요청 거부 (리플레이 어택 방어)
  const requestTimestamp = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - requestTimestamp) > 300) {
    logger.warn('Slack 서명 검증 실패: 타임스탬프 만료');
    return false;
  }

  const sigBaseString = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(sigBaseString)
    .digest('hex')}`;

  // timingSafeEqual은 길이가 다르면 RangeError 발생 → 길이 불일치 시 false 반환
  const expectedBuf = Buffer.from(mySignature);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** 채널에 백준 문제 추천 메시지를 게시한다. */
export async function postProblemRecommendation(params: {
  channel: string;
  problemId: number;
  title: string;
  tier: string;
  url: string;
  tags: string[];
}): Promise<void> {
  const tagText = params.tags.length > 0 ? `\n태그: ${params.tags.join(', ')}` : '';
  const text = [
    `🧩 *오늘의 백준 문제*`,
    ``,
    `*[${params.tier}] ${params.title}*`,
    `🔗 ${params.url}${tagText}`,
  ].join('\n');

  await postMessage({ channel: params.channel, text });
}
