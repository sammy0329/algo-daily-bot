import { getAIConfig } from './dynamodb';
import { getSecureParameter } from './ssm';
import { AIProvider } from './constants';
import { ProblemContext } from './types';
import { logger } from './logger';

export interface ReviewContext {
  problem?: ProblemContext;
  status?: 'solved' | 'failed';
}

export interface BlogContext {
  problem?: ProblemContext;
}

export interface AIClient {
  generateCodeReview(code: string, language?: string, context?: ReviewContext): Promise<string>;
  generateBlogDraft(topic?: string, code?: string, context?: BlogContext): Promise<string>;
}

/** AI에 전달할 블로그 초안 user 메시지를 구성한다. */
export function buildBlogUserMessage(topic?: string, code?: string, context?: BlogContext): string {
  const parts: string[] = [];

  if (context?.problem) {
    const p = context.problem;
    parts.push(`문제: [${p.tier}] ${p.title} (${p.url})`);
    if (p.tags.length > 0) parts.push(`알고리즘 태그: ${p.tags.join(', ')}`);
  }

  if (topic) parts.push(`추가 설명: ${topic}`);
  if (code) parts.push(`제출 코드:\n\`\`\`\n${code}\n\`\`\``);

  return parts.join('\n');
}

/** AI에 전달할 리뷰 user 메시지를 구성한다. */
export function buildReviewUserMessage(
  code: string,
  language?: string,
  context?: ReviewContext,
): string {
  const parts: string[] = [];

  if (context?.problem) {
    const p = context.problem;
    parts.push(`문제: [${p.tier}] ${p.title} (${p.url})`);
    if (p.tags.length > 0) parts.push(`태그: ${p.tags.join(', ')}`);
  }

  if (context?.status) {
    parts.push(`정답 여부: ${context.status === 'solved' ? '정답' : '오답'}`);
  }

  if (language) parts.push(`언어: ${language}`);
  parts.push(`코드:\n\`\`\`\n${code}\n\`\`\``);

  return parts.join('\n');
}

const CODE_REVIEW_SYSTEM_PROMPT = `당신은 전문 코드 리뷰어입니다. 제출된 코드를 한국어로 리뷰해주세요.
다음 항목을 반드시 포함하세요:
1. **정확성**: 알고리즘이 올바른지, 엣지 케이스를 처리하는지 확인
2. **시간/공간 복잡도**: Big-O 표기로 분석
3. **코드 스타일**: 가독성, 변수명, 구조 개선점
4. **개선 제안**: 더 나은 풀이 방식이 있다면 제안
응답은 마크다운 형식으로 작성하고, 3500자 이내로 작성해주세요.`;

const BLOG_DRAFT_SYSTEM_PROMPT = `당신은 개발 블로그 작가입니다. 알고리즘 문제 풀이 블로그 초안을 한국어 마크다운으로 작성해주세요.
다음 구조를 따르세요:
# [문제 제목 또는 주제]

## 문제 설명
(문제 요약)

## 풀이 접근법
(알고리즘/자료구조 선택 이유)

## 코드 분석
(핵심 로직 설명)

## 복잡도 분석
- 시간 복잡도: O(?)
- 공간 복잡도: O(?)

## 배운 점
(핵심 takeaway)

응답은 3500자 이내로 작성해주세요.`;

// ──────────────────────────────────────────
// GPT (OpenAI)
// ──────────────────────────────────────────
function createGPTClient(apiKey: string, model: string): AIClient {
  return {
    async generateCodeReview(code, language, context) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: CODE_REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: buildReviewUserMessage(code, language, context) },
        ],
        max_tokens: 2048,
      });
      return response.choices[0]?.message?.content ?? '리뷰 결과를 가져올 수 없습니다.';
    },
    async generateBlogDraft(topic, code, context) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: BLOG_DRAFT_SYSTEM_PROMPT },
          { role: 'user', content: buildBlogUserMessage(topic, code, context) },
        ],
        max_tokens: 4096,
      });
      return response.choices[0]?.message?.content ?? '블로그 초안을 생성할 수 없습니다.';
    },
  };
}

// ──────────────────────────────────────────
// Claude (Anthropic)
// ──────────────────────────────────────────
function createClaudeClient(apiKey: string, model: string): AIClient {
  return {
    async generateCodeReview(code, language, context) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: CODE_REVIEW_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildReviewUserMessage(code, language, context) },
        ],
      });
      const block = response.content[0];
      return block?.type === 'text' ? block.text : '리뷰 결과를 가져올 수 없습니다.';
    },
    async generateBlogDraft(topic, code, context) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: BLOG_DRAFT_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildBlogUserMessage(topic, code, context) },
        ],
      });
      const block = response.content[0];
      return block?.type === 'text' ? block.text : '블로그 초안을 생성할 수 없습니다.';
    },
  };
}

// ──────────────────────────────────────────
// Gemini (Google)
// ──────────────────────────────────────────
function createGeminiClient(apiKey: string, model: string): AIClient {
  return {
    async generateCodeReview(code, language, context) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model, systemInstruction: CODE_REVIEW_SYSTEM_PROMPT });
      const result = await genModel.generateContent(buildReviewUserMessage(code, language, context));
      return result.response.text();
    },
    async generateBlogDraft(topic, code, context) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model, systemInstruction: BLOG_DRAFT_SYSTEM_PROMPT });
      const result = await genModel.generateContent(buildBlogUserMessage(topic, code, context));
      return result.response.text();
    },
  };
}

// ──────────────────────────────────────────
// 팩토리 함수 (모듈 레벨 캐싱)
// ──────────────────────────────────────────

let _aiClient: AIClient | null = null;

/** DynamoDB + SSM에서 AI 설정을 읽어 클라이언트를 반환한다 (Lambda 웜 컨테이너 캐싱). */
export async function getAIClient(): Promise<AIClient> {
  if (_aiClient) return _aiClient;

  const config = await getAIConfig();
  if (!config) {
    throw new Error(
      'AI 설정이 없습니다. scripts/setup-ai.ts를 실행하여 AI 제공자를 설정해주세요.',
    );
  }

  const apiKey = await getSecureParameter(config.apiKeyParam);
  logger.info('AI 클라이언트 초기화', { provider: config.provider, model: config.model });

  const providers: Record<AIProvider, () => AIClient> = {
    gpt: () => createGPTClient(apiKey, config.model),
    claude: () => createClaudeClient(apiKey, config.model),
    gemini: () => createGeminiClient(apiKey, config.model),
  };

  const factory = providers[config.provider];
  if (!factory) {
    throw new Error(`지원하지 않는 AI 제공자: ${config.provider}`);
  }

  _aiClient = factory();
  return _aiClient;
}
