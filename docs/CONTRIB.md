# 기여 가이드 (Contributing Guide)

## 개발 환경 설정

### 사전 요구사항

- Node.js 20.x
- AWS CLI v2
- AWS SAM CLI
- Python 3.x (SAM 로컬 변환용: `pip3 install aws-sam-translator pyyaml`)
- esbuild (`brew install esbuild`)

### 설치

```bash
git clone https://github.com/sammy0329/algo-daily-bot.git
cd algo-daily-bot
npm install
cp .env.example .env  # 환경변수 설정
```

---

## 환경변수

로컬 스크립트(`scripts/`) 실행 시 `.env` 파일 또는 환경변수가 필요합니다.

| 변수명 | 예시 값 | 설명 |
|---|---|---|
| `TABLE_NAME` | `AlgoDailyBotTable` | DynamoDB 테이블명 (SAM 배포 후 자동 생성) |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack Bot OAuth Token (로컬 테스트용) |
| `SLACK_SIGNING_SECRET` | `a1b2...` | Slack Signing Secret (로컬 테스트용) |
| `SLACK_CHANNEL_ID` | `C0123456789` | 일일 추천 대상 채널 ID |
| `REVIEW_DAILY_LIMIT` | `10` | `/review` 일일 제한 횟수 |
| `BLOG_DAILY_LIMIT` | `5` | `/blog` 일일 제한 횟수 |

> Lambda 런타임에서 `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`은 SSM Parameter Store에서 자동 주입됩니다. AI API 키는 `scripts/setup-ai.ts`로 별도 설정합니다.

---

## 스크립트 레퍼런스

| 스크립트 | 명령어 | 설명 |
|---|---|---|
| `test` | `npm test` | 단위 테스트 실행 (vitest) |
| `test:watch` | `npm run test:watch` | 파일 변경 감지 테스트 |
| `test:coverage` | `npm run test:coverage` | 커버리지 포함 테스트 |
| `lint` | `npm run lint` | ESLint 검사 (`src/`, `scripts/`) |
| `format` | `npm run format` | Prettier 포맷팅 |
| `build` | `npm run build` | SAM 빌드 (`sam build`) |
| `sync` | `npm run sync` | BOJ 핸들 등록 + 풀이 캐시 초기화 |
| `setup-ai` | `npm run setup-ai` | AI 제공자/모델/API 키 설정 |

### 스크립트 상세 사용법

#### `sync` — BOJ 핸들 등록

```bash
TABLE_NAME=AlgoDailyBotTable \
  npm run sync -- --slack-user-id U04XXXXXX --handle your_boj_handle
```

#### `setup-ai` — AI 제공자 설정

```bash
TABLE_NAME=AlgoDailyBotTable \
  npm run setup-ai -- --provider gpt --model gpt-4o-mini --api-key sk-...
```

지원 제공자: `gpt` | `claude` | `gemini`

---

## 개발 워크플로우

이 프로젝트는 TDD(Test-Driven Development)를 기본 워크플로우로 사용합니다.

```
feature/xxx 브랜치 생성 (from develop)
    → 테스트 작성 (RED)
    → 구현 (GREEN)
    → 리팩터 → PR → develop 머지
    → 릴리즈 시 develop → main 머지
```

### 브랜치 전략

| 브랜치 | 역할 |
|---|---|
| `main` | 배포 가능 상태 (production) |
| `develop` | 개발 통합 브랜치 |
| `feature/xxx` | 기능 개발 |
| `fix/xxx` | 버그 수정 |
| `chore/xxx` | 설정/인프라 변경 |
| `docs/xxx` | 문서 수정 |

### 커밋 컨벤션

```
feat: 새 기능
fix: 버그 수정
chore: 설정·빌드·의존성 변경
docs: 문서 수정
test: 테스트 추가/수정
refactor: 리팩터 (기능 변경 없음)
```

---

## 테스트

```bash
npm test               # 전체 테스트
npm run test:coverage  # 커버리지 리포트
npm run test:watch     # watch 모드
```

### 테스트 파일 위치

```
src/__tests__/
  aiClient.test.ts          # buildReviewUserMessage
  dailyRecommend.test.ts    # getTierName, 소진 동작
  dailySync.test.ts         # syncUserProblems
  dynamodb.test.ts          # DynamoDB 키 구성, TTL
  parseReviewCommand.test.ts # /review 파싱 규칙
  solvedac.test.ts          # getProblemById
  validateCodeBlock.test.ts  # 코드 블록 검증
  worker.test.ts            # resolveErrorCode, splitMessage
```

---

## 새 기능 추가 체크리스트

### 새 슬래시 커맨드 추가 시

- [ ] `slackEvents.ts`: 커맨드 파싱 로직 추가
- [ ] `worker.ts`: `handler` 분기에 새 커맨드 추가
- [ ] `constants.ts`: 필요한 상수 추가
- [ ] `template.yaml`: 환경변수 추가 (필요 시)
- [ ] 테스트 작성

### 새 Lambda 핸들러 추가 시

- [ ] `src/handlers/` 에 핸들러 파일 작성
- [ ] `template.yaml` 에 Function 리소스 추가
- [ ] 테스트 작성

### AI 제공자 추가 시

- [ ] `aiClient.ts`: 새 provider 클래스 구현 (`AIClient` 인터페이스 준수)
- [ ] `constants.ts`: `AIProvider` 타입에 추가
- [ ] `scripts/setup-ai.ts`: provider 목록에 추가
