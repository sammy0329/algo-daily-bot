---
name: coding-standards
description: TypeScript/JavaScript 코딩 표준, 네이밍, 타입 안전성, 코드 품질 원칙.
---

# Coding Standards

모든 TypeScript/JavaScript 코드에 적용되는 범용 코딩 표준.

## 활성화 시점

- 새 모듈/함수 작성
- 코드 리뷰
- 리팩토링
- 네이밍/구조 일관성 확인

## 핵심 원칙

- **가독성 우선**: 명확한 이름, 자기 설명적 코드
- **KISS**: 가장 단순한 해결책
- **DRY**: 공통 로직 추출 (단, 2번 이상 반복될 때만)
- **YAGNI**: 당장 필요한 것만 구현

## 네이밍

```typescript
// 변수: 설명적 이름
const dailyRecommendationCount = 5        // ✅
const n = 5                               // ❌

// 함수: 동사-명사 패턴
async function fetchProblemById(id: number) { }   // ✅
async function problem(id: number) { }            // ❌

// 불리언: is/has/should 접두사
const isProblemRecommended = true         // ✅
const recommended = true                  // ❌

// 상수: UPPER_SNAKE_CASE
const MAX_CODE_LENGTH = 3000              // ✅
const maxCodeLength = 3000               // ❌ (상수에는 대문자)
```

## 타입 안전성 (CRITICAL)

```typescript
// any 사용 금지
function process(data: any) { }           // ❌

// unknown으로 받고 타입 가드로 좁히기
function process(data: unknown) {         // ✅
  if (!isValidPayload(data)) throw new Error('잘못된 데이터')
  // data 사용
}

// ! 연산자 금지
const token = process.env.SLACK_BOT_TOKEN!  // ❌

// 명시적 검증
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} 환경변수 누락`)
  return value
}
```

## 함수 크기

- 단일 함수: 50줄 이하
- 파일: 300줄 이하 (최대 800줄)
- 들여쓰기: 4단계 이하 (Early Return 활용)

```typescript
// WRONG: 깊은 중첩
async function handler(event) {
  if (event.command) {
    if (event.command === '/review') {
      if (event.text) {
        // 로직...
      }
    }
  }
}

// CORRECT: Early Return
async function handler(event) {
  if (!event.command) return
  if (event.command !== '/review') return
  if (!event.text) return
  // 로직...
}
```

## 매직 넘버/문자열 금지

```typescript
// WRONG
if (code.length > 3000) { }

// CORRECT
const MAX_CODE_LENGTH = 3000
if (code.length > MAX_CODE_LENGTH) { }
```

## 병렬 처리

독립적인 비동기 작업은 항상 병렬:

```typescript
// WRONG: 불필요한 순차 실행
const a = await fetchA()
const b = await fetchB()

// CORRECT: 병렬 실행
const [a, b] = await Promise.all([fetchA(), fetchB()])
```

## 코드 중복 제거

같은 로직이 2곳 이상이면 추출:

```typescript
// WRONG: sync.ts, setup-ai.ts 양쪽에 동일한 parseArgs 함수

// CORRECT: scripts/utils.ts로 추출
export function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      result[argv[i].slice(2)] = argv[i + 1]
      i++
    }
  }
  return result
}
```

## 공유 타입 정의

같은 인터페이스가 여러 파일에 있으면 `src/shared/types.ts`로 이동:

```typescript
// WRONG: slackEvents.ts, worker.ts 양쪽에 동일한 WorkerPayload 인터페이스

// CORRECT: src/shared/types.ts
export interface WorkerPayload {
  command: 'review' | 'blog'
  channel: string
  threadTs: string
  userId: string
  payload: Record<string, unknown>
}
```

## 모듈 사이드이펙트 금지

```typescript
// WRONG: import 시점에 실행되는 사이드이펙트
logger.info('DynamoDB 클라이언트 초기화 완료')  // 모듈 최상위 금지

// CORRECT: 필요한 호출 지점에서만 로깅
export function createClient() {
  const client = new DynamoDBClient({})
  logger.info('DynamoDB 클라이언트 생성')
  return client
}
```
