---
name: backend-patterns
description: Lambda 핸들러 설계, DynamoDB 접근 패턴, 비동기 처리, 에러 처리 등 서버사이드 아키텍처 패턴.
---

# Backend Development Patterns

서버사이드 애플리케이션을 위한 아키텍처 패턴과 모범 사례.

## 활성화 시점

- Lambda 핸들러 설계/추가
- DynamoDB 접근 패턴 구현
- 재시도/백오프 로직 추가
- 에러 처리 구조화
- 비동기 처리 패턴 구현

## Lambda 핸들러 패턴 (이 프로젝트 특화)

### 3-Lambda 비동기 패턴

```
SlackEventsFunction (HTTP, 3초 이내 응답)
  → 검증 → chat.postMessage → ts 캡처
  → Lambda.invoke(Event) → 즉시 200 반환

WorkerFunction (비동기, 최대 120초)
  → AI API 호출 → 스레드 답글 게시
  → 실패 시 한국어 오류 → DLQ
```

### 환경변수 안전 조회

```typescript
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`)
  return value
}
```

## DynamoDB 패턴

### UnprocessedItems 처리 (필수)

```typescript
const result = await ddb.send(new BatchWriteCommand({ RequestItems: items }))
const unprocessed = result.UnprocessedItems?.[TABLE_NAME]
if (unprocessed?.length) {
  // 지수 백오프로 재시도
  await withRetry(() => ddb.send(new BatchWriteCommand({
    RequestItems: { [TABLE_NAME]: unprocessed }
  })))
}
```

### 조건부 PutItem (멱등성)

```typescript
await ddb.send(new PutCommand({
  TableName: TABLE_NAME,
  Item: { ... },
  ConditionExpression: 'attribute_not_exists(PK)',  // 원자적 선점
}))
```

## 재시도 + 지수 백오프

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err
      const delay = Math.pow(2, attempt) * 500
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}
```

## 클라이언트 싱글턴 캐싱

Lambda 웜 컨테이너에서 클라이언트 재사용:

```typescript
let _client: WebClient | null = null

function getClient(): WebClient {
  if (!_client) {
    _client = new WebClient(requireEnv('SLACK_BOT_TOKEN'))
  }
  return _client
}
```

AI 클라이언트도 동일:

```typescript
let _aiClient: AIClient | null = null

export async function getAIClient(): Promise<AIClient> {
  if (_aiClient) return _aiClient
  _aiClient = await createAIClient()  // DynamoDB + SSM 조회 1회만
  return _aiClient
}
```

## 구조화 에러 처리

```typescript
class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

// WorkerFunction 최상위 try-catch
try {
  await processCommand(event)
} catch (err) {
  logger.error('처리 실패', { error: err, ...event })
  const code = resolveErrorCode(err)
  try {
    await postErrorMessage({ channel, threadTs, errorCode: code })
  } catch (slackErr) {
    throw slackErr  // Slack 게시 실패 → DLQ
  }
  // 정상 종료 (Lambda 재시도 방지)
}
```

## 병렬 처리

독립적인 작업은 Promise.all로 병렬 실행:

```typescript
// 중복 제거 + 풀이 여부 병렬 확인
const [recommended, solved] = await Promise.all([
  isProblemRecommended(problemId),
  isSolvedProblem(handle, problemId),
])
```

## 구조화 로깅

```typescript
// 항상 컨텍스트 포함
logger.info('처리 완료', {
  command: event.command,
  userId: event.userId,
  durationMs: Date.now() - startTime,
})
```
