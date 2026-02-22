---
name: security-review
description: 인증, 사용자 입력 처리, 시크릿 관리, API 엔드포인트 생성, 민감한 기능 구현 시 사용. 보안 체크리스트와 패턴 제공.
---

# Security Review Skill

모든 코드가 보안 모범 사례를 따르는지 확인하고 잠재적 취약점을 식별합니다.

## 활성화 시점

- 인증/인가 구현
- 사용자 입력 또는 파일 업로드 처리
- 새 API 엔드포인트 생성
- 시크릿 또는 자격증명 처리
- 민감한 데이터 저장/전송
- 서드파티 API 연동

## 보안 체크리스트

### 1. 시크릿 관리

```typescript
// NEVER: 하드코딩 시크릿
const apiKey = "sk-proj-xxxxx"

// ALWAYS: 환경변수 또는 SSM
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
```

체크:
- [ ] 하드코딩된 API 키/토큰/패스워드 없음
- [ ] 모든 시크릿은 환경변수 또는 SSM Parameter Store
- [ ] `.env` 파일이 .gitignore에 포함
- [ ] git 히스토리에 시크릿 없음

### 2. 입력 검증

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
})

export async function handler(input: unknown) {
  const validated = schema.parse(input)
  // validated 사용
}
```

체크:
- [ ] 모든 사용자 입력 스키마 검증
- [ ] 화이트리스트 방식 (블랙리스트 금지)
- [ ] 에러 메시지에 민감 정보 미포함
- [ ] URL에 삽입되는 외부 입력 형식 검증 (예: BOJ 핸들)

### 3. Slack 서명 검증 (이 프로젝트 특화)

```typescript
// timingSafeEqual은 길이 불일치 시 RangeError 발생
const expected = Buffer.from(mySignature)
const actual = Buffer.from(signature)
if (expected.length !== actual.length) return false  // 반드시 선행 검사
return crypto.timingSafeEqual(expected, actual)
```

### 4. Lambda 페이로드 검증 (이 프로젝트 특화)

```typescript
// as 타입 단언만으로는 런타임 안전성 없음
function isReviewPayload(p: unknown): p is { code: string; language?: string } {
  return typeof p === 'object' && p !== null &&
    typeof (p as Record<string, unknown>).code === 'string'
}
if (!isReviewPayload(event.payload)) throw new Error('잘못된 페이로드')
```

### 5. 요청 제한 (Rate Limiting)

체크:
- [ ] 모든 API 엔드포인트에 요청 제한 적용
- [ ] AI 호출 등 고비용 작업에 더 엄격한 제한
- [ ] 사용자 기반 제한 (이 프로젝트: DynamoDB 카운터)

### 6. 민감 데이터 노출 방지

```typescript
// WRONG: 민감 정보 로깅
logger.info('API 키:', { key: apiKey })

// CORRECT: 마스킹 또는 미포함
logger.info('API 키 설정 완료', { keyPrefix: apiKey.slice(-4) })
```

체크:
- [ ] 로그에 패스워드/토큰/시크릿 없음
- [ ] 사용자에게 노출되는 에러 메시지는 일반적으로
- [ ] 스택 트레이스 사용자에게 미노출

### 7. SSM 시크릿 런타임 조회 (이 프로젝트 특화)

민감한 자격증명은 Lambda 환경변수(배포 시 평문 주입)가 아닌 런타임 SSM 조회:

```typescript
// AI API 키와 동일한 패턴으로 Slack 시크릿도 런타임 조회
const slackToken = await getSecureParameter('/algo-daily-bot/slack-bot-token')
const signingSecret = await getSecureParameter('/algo-daily-bot/slack-signing-secret')
```

### 8. 의존성 보안

```bash
npm audit           # 취약점 확인
npm audit fix       # 자동 수정
npm outdated        # 구버전 확인
```

체크:
- [ ] 의존성 최신 상태
- [ ] npm audit 취약점 없음
- [ ] lockfile 커밋됨

## 배포 전 보안 체크리스트

- [ ] 하드코딩 시크릿 없음
- [ ] 모든 사용자 입력 검증
- [ ] Slack 서명 검증 정상 동작 (길이 불일치 케이스 포함)
- [ ] Lambda 페이로드 런타임 검증
- [ ] 요청 제한 적용
- [ ] 에러 메시지에 민감 정보 미포함
- [ ] 로그에 민감 데이터 미포함
- [ ] 의존성 취약점 없음
- [ ] SSM 시크릿 런타임 조회 방식 사용

## 참고

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [AWS Lambda Security Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/security-best-practices.html)
