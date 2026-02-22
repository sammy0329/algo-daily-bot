---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Patterns

> common/patterns.md를 TypeScript/JavaScript 특화 내용으로 확장합니다.

## API 응답 형식

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}
```

## Repository 패턴

데이터 접근 로직 추상화:

```typescript
interface Repository<T> {
  findAll(filters?: Filters): Promise<T[]>
  findById(id: string): Promise<T | null>
  create(data: CreateDto): Promise<T>
  update(id: string, data: UpdateDto): Promise<T>
  delete(id: string): Promise<void>
}
```

## 싱글턴 캐싱 패턴 (이 프로젝트 특화)

Lambda 웜 컨테이너에서 재사용 가능한 클라이언트/설정을 모듈 레벨에 캐시:

```typescript
// 올바른 패턴: 모듈 레벨 캐싱
let _aiClient: AIClient | null = null

export async function getAIClient(): Promise<AIClient> {
  if (_aiClient) return _aiClient
  _aiClient = await createAIClient()
  return _aiClient
}

// 잘못된 패턴: 매 호출마다 DynamoDB + SSM 네트워크 호출
export async function handler(event) {
  const ai = await createAIClient() // 매번 2회 네트워크 호출
}
```

## 지수 백오프 재시도

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500))
    }
  }
  throw new Error('unreachable')
}
```

## 타입 가드 패턴

런타임 검증과 타입 좁히기를 함께:

```typescript
function isReviewPayload(p: unknown): p is { code: string; language?: string } {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as Record<string, unknown>).code === 'string'
  )
}
```

## Early Return (Guard Clause)

중첩 대신 조기 반환:

```typescript
// WRONG: 깊은 중첩
if (user) {
  if (user.isAdmin) {
    if (market) {
      // 로직
    }
  }
}

// CORRECT: 조기 반환
if (!user) return
if (!user.isAdmin) return
if (!market) return
// 로직
```

## DynamoDB 단일 테이블 패턴 (이 프로젝트 특화)

키는 반드시 `constants.ts`의 `KEY` 객체를 통해 구성:

```typescript
// WRONG: 하드코딩 키
{ PK: `PROBLEM#${id}`, SK: 'RECOMMENDED' }

// CORRECT: KEY 객체 사용
import { KEY } from './constants'
{ PK: KEY.PROBLEM(id), SK: KEY.RECOMMENDED }
```

## BatchWrite UnprocessedItems 처리

DynamoDB BatchWrite는 부분 실패를 반환할 수 있으므로 반드시 처리:

```typescript
const result = await ddb.send(new BatchWriteCommand({ RequestItems: { ... } }))
const unprocessed = result.UnprocessedItems?.[TABLE_NAME]
if (unprocessed && unprocessed.length > 0) {
  // 재시도 로직
}
```
