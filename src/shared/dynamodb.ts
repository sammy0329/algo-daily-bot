import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { KEY, GSI, IDEMPOTENCY_TTL_SECONDS, AIProvider } from './constants';
import { logger } from './logger';

const client = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(client);

const TABLE = () => {
  const name = process.env.TABLE_NAME;
  if (!name) throw new Error('TABLE_NAME 환경변수가 설정되지 않았습니다.');
  return name;
};

// ──────────────────────────────────────────
// 멱등성
// ──────────────────────────────────────────

/** 이미 처리된 이벤트인지 확인하고, 신규이면 선점한다. 중복이면 true 반환. */
export async function checkAndMarkIdempotency(eventId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          PK: KEY.IDEMPOTENCY(eventId),
          SK: KEY.EVENT,
          processedAt: new Date().toISOString(),
          ttl: now + IDEMPOTENCY_TTL_SECONDS,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return false; // 신규 이벤트
  } catch (err: unknown) {
    if (isConditionalCheckFailed(err)) return true; // 중복 이벤트
    throw err;
  }
}

// ──────────────────────────────────────────
// 요청 제한
// ──────────────────────────────────────────

/** 사용자의 일일 요청 횟수를 증가시키고 현재 count를 반환한다. */
export async function incrementRateLimit(userId: string, cmd: string): Promise<number> {
  const date = getTodayKST();
  const eodTtl = getKSTEndOfDayEpoch();

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: {
        PK: KEY.USER(userId),
        SK: KEY.RATELIMIT(cmd, date),
      },
      UpdateExpression: 'ADD #count :inc SET #ttl = if_not_exists(#ttl, :ttl), GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':inc': 1,
        ':ttl': eodTtl,
        ':gsi1pk': KEY.RATELIMIT(cmd, date),
        ':gsi1sk': KEY.USER(userId),
      },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return (result.Attributes?.count as number) ?? 1;
}

// ──────────────────────────────────────────
// 문제 추천 중복 제거
// ──────────────────────────────────────────

/** 이미 추천한 문제인지 확인한다. */
export async function isProblemRecommended(problemId: number): Promise<boolean> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { PK: KEY.PROBLEM(problemId), SK: KEY.RECOMMENDED },
    }),
  );
  return !!result.Item;
}

/** 문제를 추천 완료로 기록하고 이력에도 추가한다. */
export async function recordRecommendation(
  problemId: number,
  meta: { title: string; tier: string; url: string },
): Promise<void> {
  const date = getTodayKST();
  await Promise.all([
    ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          PK: KEY.PROBLEM(problemId),
          SK: KEY.RECOMMENDED,
          recommendedAt: date,
          ...meta,
        },
      }),
    ),
    ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          PK: KEY.HISTORY,
          SK: KEY.DATE(date),
          problemId,
          ...meta,
        },
      }),
    ),
  ]);
}

// ──────────────────────────────────────────
// 풀이 문제 캐시
// ──────────────────────────────────────────

/** 사용자가 이미 푼 문제인지 확인한다. */
export async function isSolvedProblem(handle: string, problemId: number): Promise<boolean> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: {
        PK: KEY.SOLVED(handle),
        SK: KEY.SOLVED_PROBLEM(problemId),
      },
    }),
  );
  return !!result.Item;
}

/** 풀이 문제 ID 목록을 DynamoDB에 일괄 기록한다 (25개 단위 청크). */
export async function upsertSolvedProblems(
  handle: string,
  problems: Array<{ id: number; solvedAt?: string }>,
): Promise<void> {
  const tableName = TABLE();
  const chunks = chunkArray(problems, 25);
  for (const chunk of chunks) {
    const items = chunk.map((p) => ({
      PutRequest: {
        Item: {
          PK: KEY.SOLVED(handle),
          SK: KEY.SOLVED_PROBLEM(p.id),
          ...(p.solvedAt ? { solvedAt: p.solvedAt } : {}),
        },
      },
    }));

    let result = await ddb.send(
      new BatchWriteCommand({ RequestItems: { [tableName]: items } }),
    );

    // UnprocessedItems 지수 백오프 재시도
    let unprocessed = result.UnprocessedItems?.[tableName];
    let retryCount = 0;
    while (unprocessed && unprocessed.length > 0 && retryCount < 3) {
      retryCount++;
      await new Promise((r) => setTimeout(r, Math.pow(2, retryCount) * 500));
      result = await ddb.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: unprocessed } }),
      );
      unprocessed = result.UnprocessedItems?.[tableName];
    }

    if (unprocessed && unprocessed.length > 0) {
      logger.warn('BatchWrite UnprocessedItems 재시도 초과', {
        handle,
        count: unprocessed.length,
      });
    }
  }
}

// ──────────────────────────────────────────
// 사용자 프로필
// ──────────────────────────────────────────

export interface UserProfile {
  slackUserId: string;
  handle: string;
  registeredAt: string;
}

/** 모든 등록된 사용자 프로필을 조회한다 (GSI-2). */
export async function getAllProfiles(): Promise<UserProfile[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      IndexName: GSI.GSI2,
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': 'PROFILE' },
    }),
  );
  return (result.Items ?? []).map((item) => ({
    slackUserId: (item.PK as string).replace('USER#', ''),
    handle: item.handle as string,
    registeredAt: item.registeredAt as string,
  }));
}

/** 사용자 프로필을 저장한다. */
export async function upsertProfile(slackUserId: string, handle: string): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        PK: KEY.USER(slackUserId),
        SK: KEY.PROFILE,
        handle,
        registeredAt: new Date().toISOString(),
        GSI2PK: 'PROFILE',
        GSI2SK: KEY.USER(slackUserId),
      },
    }),
  );
}

// ──────────────────────────────────────────
// AI 설정
// ──────────────────────────────────────────

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKeyParam: string;
}

/** AI 설정을 조회한다. */
export async function getAIConfig(): Promise<AIConfig | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { PK: KEY.CONFIG, SK: KEY.AI_PROVIDER },
    }),
  );
  if (!result.Item) return null;
  return {
    provider: result.Item.provider as AIProvider,
    model: result.Item.model as string,
    apiKeyParam: result.Item.apiKeyParam as string,
  };
}

/** AI 설정을 저장한다. */
export async function upsertAIConfig(config: AIConfig): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        PK: KEY.CONFIG,
        SK: KEY.AI_PROVIDER,
        ...config,
      },
    }),
  );
}

// ──────────────────────────────────────────
// 유틸 함수
// ──────────────────────────────────────────

function getTodayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getKSTEndOfDayEpoch(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(15, 0, 0, 0); // KST 자정 = UTC 15:00
  if (endOfDay.getTime() < Date.now()) {
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  }
  return Math.floor(endOfDay.getTime() / 1000) + 3600; // 1시간 여유
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function isConditionalCheckFailed(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'ConditionalCheckFailedException'
  );
}

