// ──────────────────────────────────────────
// DynamoDB 키 접두사
// ──────────────────────────────────────────
export const KEY = {
  PROBLEM: (id: number) => `PROBLEM#${id}`,
  HISTORY: 'HISTORY',
  DATE: (date: string) => `DATE#${date}`,
  IDEMPOTENCY: (eventId: string) => `IDEMPOTENCY#${eventId}`,
  EVENT: 'EVENT',
  USER: (userId: string) => `USER#${userId}`,
  RATELIMIT: (cmd: string, date: string) => `RATELIMIT#${cmd}#${date}`,
  PROFILE: 'PROFILE',
  SOLVED: (handle: string) => `SOLVED#${handle}`,
  SOLVED_PROBLEM: (id: number) => `PROBLEM#${id}`,
  CONFIG: 'CONFIG',
  AI_PROVIDER: 'AI_PROVIDER',
  RECOMMENDED: 'RECOMMENDED',
} as const;

// GSI 이름
export const GSI = {
  GSI1: 'GSI1',
  GSI2: 'GSI2',
} as const;

// ──────────────────────────────────────────
// 오류 코드 및 한국어 메시지
// ──────────────────────────────────────────
export enum ErrorCode {
  OPENAI_API_ERROR = 'OPENAI_API_ERROR',
  CLAUDE_API_ERROR = 'CLAUDE_API_ERROR',
  GEMINI_API_ERROR = 'GEMINI_API_ERROR',
  SOLVEDAC_ERROR = 'SOLVEDAC_ERROR',
  SLACK_POST_ERROR = 'SLACK_POST_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.OPENAI_API_ERROR]:
    '죄송합니다. AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요. (오류 코드: OPENAI_API_ERROR)',
  [ErrorCode.CLAUDE_API_ERROR]:
    '죄송합니다. AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요. (오류 코드: CLAUDE_API_ERROR)',
  [ErrorCode.GEMINI_API_ERROR]:
    '죄송합니다. AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요. (오류 코드: GEMINI_API_ERROR)',
  [ErrorCode.SOLVEDAC_ERROR]:
    '죄송합니다. 문제 정보를 가져오는 중 오류가 발생했습니다. (오류 코드: SOLVEDAC_ERROR)',
  [ErrorCode.SLACK_POST_ERROR]:
    '결과 전송 중 오류가 발생했습니다. (오류 코드: SLACK_POST_ERROR)',
  [ErrorCode.UNKNOWN_ERROR]:
    '알 수 없는 오류가 발생했습니다. 관리자에게 문의해주세요. (오류 코드: UNKNOWN_ERROR)',
};

// ──────────────────────────────────────────
// 요청 제한 기본값
// ──────────────────────────────────────────
export const DEFAULT_LIMITS = {
  REVIEW: 10,
  BLOG: 5,
} as const;

// ──────────────────────────────────────────
// 멱등성 TTL (24시간)
// ──────────────────────────────────────────
export const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

// ──────────────────────────────────────────
// SSM Parameter Store 경로
// ──────────────────────────────────────────
export const SSM_PATHS = {
  AI_API_KEY: '/algo-daily-bot/ai-api-key',
  SLACK_BOT_TOKEN: '/algo-daily-bot/slack-bot-token',
  SLACK_SIGNING_SECRET: '/algo-daily-bot/slack-signing-secret',
} as const;

// ──────────────────────────────────────────
// AI 제공자 타입
// ──────────────────────────────────────────
export type AIProvider = 'gpt' | 'claude' | 'gemini';

export const SUPPORTED_PROVIDERS: AIProvider[] = ['gpt', 'claude', 'gemini'];

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  gpt: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  claude: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
};
