---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Security

> common/security.md를 TypeScript/JavaScript 특화 내용으로 확장합니다.

## Secret Management

```typescript
// NEVER: 하드코딩된 시크릿
const apiKey = "sk-proj-xxxxx"

// ALWAYS: 환경변수 + 명시적 검증
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

## Slack 서명 검증 (이 프로젝트 특화)

`crypto.timingSafeEqual()`은 버퍼 길이가 다르면 `RangeError` 발생:

```typescript
// WRONG: 길이 불일치 시 크래시
return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature))

// CORRECT: 길이 검증 선행
const expected = Buffer.from(mySignature)
const actual = Buffer.from(signature)
if (expected.length !== actual.length) return false
return crypto.timingSafeEqual(expected, actual)
```

## 외부 입력 검증 (이 프로젝트 특화)

사용자 제공 값을 URL에 삽입하기 전 반드시 형식 검증:

```typescript
// BOJ 핸들: 영숫자 + 언더스코어만 허용
if (!/^[a-zA-Z0-9_]{1,20}$/.test(handle)) {
  throw new Error('유효하지 않은 BOJ 핸들 형식입니다.')
}
```

## Lambda 페이로드 런타임 검증

신뢰 경계(Lambda 호출 페이로드)에서 반드시 런타임 검증 수행:

```typescript
// WRONG: 타입 단언만으로는 런타임 안전성 없음
const { code } = event.payload as { code: string }

// CORRECT: 타입 가드로 검증
if (typeof event.payload?.code !== 'string') {
  throw new Error('필수 필드 누락: code')
}
```

## SSM 시크릿 런타임 조회 (이 프로젝트 특화)

민감한 자격증명은 Lambda 환경변수(배포 시 주입)가 아닌 런타임 SSM 조회로 관리:

```typescript
// WRONG: 배포 시 평문 환경변수로 주입
# template.yaml
SLACK_BOT_TOKEN: !Sub '{{resolve:ssm:/algo-daily-bot/slack-bot-token}}'

// CORRECT: 런타임 SSM 조회 (AI 키와 동일한 패턴)
const token = await getSecureParameter('/algo-daily-bot/slack-bot-token')
```

## Agent Support

- 보안 감사 시 **security-reviewer** 스킬 사용
