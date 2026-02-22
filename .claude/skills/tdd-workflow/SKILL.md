---
name: tdd-workflow
description: 새 기능 작성, 버그 수정, 리팩토링 시 사용. 테스트 우선 개발(TDD) 강제, 커버리지 80% 이상 요구.
---

# TDD Workflow Skill

**원칙: 항상 테스트를 먼저 작성하고, 테스트를 통과하는 코드를 구현합니다.**

## 활성화 시점

- 새 기능 작성
- 버그 수정
- 코드 리팩토링
- 새 API 엔드포인트 추가
- 핸들러/서비스 추가

## 7단계 워크플로우

1. **요구사항 파악** — 사용자 시나리오 정의
2. **테스트 케이스 작성** — 엣지 케이스, 에러 케이스 포함
3. **테스트 실행 (RED)** — 실패 확인
4. **최소 구현 (GREEN)** — 테스트를 통과하는 최소 코드
5. **테스트 재실행** — 통과 확인
6. **리팩토링 (IMPROVE)** — 코드 정리
7. **커버리지 확인** — 80% 이상 달성

## 테스트 유형 (모두 필요)

### 단위 테스트 (Vitest)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { validateCodeBlock } from '../handlers/slackEvents'  // 반드시 실제 소스 import

describe('validateCodeBlock', () => {
  it('코드 블록 없음 → 오류', () => {
    const result = validateCodeBlock('텍스트만')
    expect(result.ok).toBe(false)
  })

  it('3000자 초과 → 오류', () => {
    const result = validateCodeBlock(`\`\`\`\n${'x'.repeat(3001)}\n\`\`\``)
    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toContain('너무 깁니다')
  })

  it('유효한 코드 블록 통과', () => {
    const result = validateCodeBlock('```python\ndef hello(): pass\n```')
    expect(result.ok).toBe(true)
  })
})
```

### AWS SDK 모킹 (aws-sdk-client-mock)

```typescript
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => ddbMock.reset())

it('멱등성: 중복 이벤트 건너뜀', async () => {
  ddbMock.on(PutCommand).rejects({ name: 'ConditionalCheckFailedException' })
  const isDuplicate = await checkAndMarkIdempotency('event-123')
  expect(isDuplicate).toBe(true)
})
```

### 통합 테스트 (Lambda 핸들러)

```typescript
import { handler } from '../handlers/slackEvents'

it('/review 코드 블록 없음 → ephemeral 오류 반환', async () => {
  const event = buildSlackEvent({ command: '/review', text: '코드 없음' })
  const response = await handler(event)
  const body = JSON.parse(response.body)
  expect(body.response_type).toBe('ephemeral')
  expect(body.text).toContain('코드 블록')
})
```

## 커버리지 기준

```bash
npm run test:coverage
```

최소 80% 이상:
- `branches`: 분기 커버리지
- `functions`: 함수 커버리지
- `lines`: 라인 커버리지

## 이 프로젝트 필수 테스트 케이스

### slackEvents 핸들러
- [ ] Slack 서명 유효/무효
- [ ] 코드 블록 없음/빈 블록/3000자 초과
- [ ] 멱등성 중복 이벤트 건너뜀
- [ ] 요청 제한 초과
- [ ] 정상 처리 → WorkerFunction 비동기 호출

### worker 핸들러
- [ ] review 정상 처리 → 스레드 답글
- [ ] blog 정상 처리 → 코드 블록 스레드 답글
- [ ] AI API 실패 → 한국어 오류 메시지 게시
- [ ] Slack 게시 실패 → re-throw (DLQ 라우팅)

### dailyRecommend 핸들러
- [ ] 정상 추천 → DynamoDB 기록 + Slack 게시
- [ ] 5회 소진 → 한국어 알림 + DynamoDB 미기록
- [ ] solved.ac 실패 → 오류 메시지

## 주의사항

- 테스트에서 로직 재구현 금지 — 반드시 소스 파일 import
- 테스트 간 독립성 보장 (`beforeEach`로 mock 초기화)
- 구현 세부사항이 아닌 동작(behavior) 테스트
