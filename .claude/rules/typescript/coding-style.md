---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Coding Style

> common/coding-style.md를 TypeScript/JavaScript 특화 내용으로 확장합니다.

## Immutability

스프레드 연산자로 불변 업데이트:

```typescript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return { ...user, name }
}
```

## Error Handling

async/await + try-catch 사용:

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

## 환경변수 검증 (CRITICAL)

`!` 연산자 대신 검증 함수 사용:

```typescript
// WRONG: 누락 시 undefined가 그대로 사용됨
const token = process.env.SLACK_BOT_TOKEN!

// CORRECT: 명시적 검증
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`)
  return value
}
const token = requireEnv('SLACK_BOT_TOKEN')
```

## 타입 단언 (CRITICAL)

런타임 검증 없이 `as` 타입 단언 금지:

```typescript
// WRONG: 런타임 안전성 없음
const payload = event.payload as { code: string }

// CORRECT: 런타임 검증 후 사용
function isReviewPayload(p: unknown): p is { code: string; language?: string } {
  return typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).code === 'string'
}
if (!isReviewPayload(event.payload)) throw new Error('잘못된 페이로드')
const { code, language } = event.payload
```

## Input Validation

Zod 스키마 기반 검증:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## 모듈 임포트

ESM import 사용 (require 금지):

```typescript
// WRONG: CJS require
const crypto = require('crypto')

// CORRECT: ESM import
import crypto from 'crypto'
```

## console.log

- 프로덕션 코드에 `console.log` 사용 금지
- 반드시 구조화 로거(`logger.ts`) 사용
- hooks에서 자동 감지됨
