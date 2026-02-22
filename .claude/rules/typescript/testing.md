---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Testing

> common/testing.md를 TypeScript/JavaScript 특화 내용으로 확장합니다.

## 테스트 프레임워크

- **단위/통합 테스트**: Vitest + aws-sdk-client-mock
- **E2E 테스트**: Playwright (해당 시)

## 핵심 규칙: 소스 코드를 반드시 import하라

테스트 파일에서 로직을 재구현하지 말고, 실제 소스를 import하여 테스트:

```typescript
// WRONG: 로직 복붙 재구현 — 프로덕션 코드를 검증하지 않음
function validateCodeBlock(text: string) {
  // 소스 코드와 동일한 로직을 여기서 다시 작성...
}

// CORRECT: 소스에서 직접 import
import { validateCodeBlock } from '../handlers/slackEvents'

test('코드 블록 없음 → 오류', () => {
  expect(validateCodeBlock('텍스트만')).toEqual({ ok: false, message: expect.stringContaining('코드 블록') })
})
```

## AWS SDK 모킹

```typescript
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => ddbMock.reset())

test('이미 추천한 문제 감지', async () => {
  ddbMock.on(GetCommand).resolves({ Item: { PK: 'PROBLEM#1234', SK: 'RECOMMENDED' } })
  const result = await isProblemRecommended(1234)
  expect(result).toBe(true)
})
```

## Slack 서명 검증 테스트 (보안 필수)

보안 게이트는 반드시 테스트:

```typescript
import crypto from 'crypto'
import { verifySlackSignature } from '../shared/slack'

test('유효한 서명 통과', () => {
  const secret = 'test-secret'
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const body = 'command=/review&text=hello'
  const sig = 'v0=' + crypto.createHmac('sha256', secret)
    .update(`v0:${timestamp}:${body}`).digest('hex')

  expect(verifySlackSignature({ signingSecret: secret, signature: sig, timestamp, body })).toBe(true)
})

test('잘못된 서명 거부', () => {
  expect(verifySlackSignature({
    signingSecret: 'secret', signature: 'v0=invalid', timestamp: '123', body: 'body'
  })).toBe(false)
})

test('길이가 다른 서명 → 크래시 없이 false 반환', () => {
  // timingSafeEqual RangeError 방어 검증
  expect(() => verifySlackSignature({
    signingSecret: 'secret', signature: '', timestamp: '123', body: 'body'
  })).not.toThrow()
})
```

## AAA 패턴

```typescript
test('기능 설명', () => {
  // Arrange: 준비
  const input = '```python\ndef solution(): pass\n```'

  // Act: 실행
  const result = validateCodeBlock(input)

  // Assert: 검증
  expect(result.ok).toBe(true)
})
```

## Agent Support

- **tdd-guide** — 테스트 우선 개발 강제
- **e2e-runner** — Playwright E2E 테스트
