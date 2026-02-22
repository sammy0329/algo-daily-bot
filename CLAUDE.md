# algo-daily-bot — Claude Code 컨텍스트

## 프로젝트 개요

AWS Lambda 기반 서버리스 슬랙봇. 세 가지 핵심 기능:
- **기능 A**: EventBridge 크론으로 매일 09:00 KST에 백준 문제 추천
- **기능 B**: `/review` 슬래시 커맨드로 AI 코드 리뷰
- **기능 C**: `/blog` 슬래시 커맨드로 한국어 블로그 초안 생성

## 주요 파일 구조

```
src/
  handlers/
    dailyRecommend.ts   # EventBridge 트리거 Lambda
    slackEvents.ts      # Slack 슬래시 커맨드 수신 Lambda (HTTP)
    worker.ts           # AI 처리 비동기 Lambda
  shared/
    aiClient.ts         # AI 제공자 추상화 (gpt/claude/gemini 통합 인터페이스)
    dynamodb.ts         # DynamoDB 단일 테이블 접근 함수 모음
    slack.ts            # Slack Web API 헬퍼
    solvedac.ts         # solved.ac 비공식 API 클라이언트
    ssm.ts              # AWS SSM Parameter Store 헬퍼
    constants.ts        # DynamoDB 키, 오류 코드, 한국어 메시지 상수
    logger.ts           # 구조화 JSON 로거 (CloudWatch용)
scripts/
  sync.ts               # 초기 설정: BOJ 핸들 등록 + 풀이 캐시 전체 동기화
  setup-ai.ts           # AI 제공자·모델·API 키 설정
template.yaml           # AWS SAM 템플릿 (모든 인프라 정의)
samconfig.toml          # SAM 배포 설정 (region: ap-northeast-2)
```

## 아키텍처 핵심 사항

### 비동기 Lambda 패턴 (Slack 3초 제한 대응)
```
Slack → API Gateway → SlackEventsFunction (유효성 검사 후 즉시 200 반환)
                              ↓ Lambda.invoke(async)
                         WorkerFunction (AI 호출 → Slack 스레드에 결과 게시)
```

### DynamoDB 단일 테이블 키 구조
| 엔티티 | PK | SK |
|---|---|---|
| 문제 중복 제거 | `PROBLEM#<id>` | `RECOMMENDED` |
| 추천 이력 | `HISTORY` | `DATE#<YYYY-MM-DD>` |
| 멱등성 | `IDEMPOTENCY#<eventId>` | `EVENT` |
| 요청 제한 | `USER#<userId>` | `RATELIMIT#<cmd>#<date>` |
| 풀이 캐시 | `SOLVED#<handle>` | `PROBLEM#<id>` |
| 사용자 프로필 | `USER#<userId>` | `PROFILE` |
| AI 설정 | `CONFIG` | `AI_PROVIDER` |

### WorkerFunction 오류 처리 규칙
- 모든 예외 → CloudWatch 로깅 → 원본 Slack 스레드에 한국어 오류 메시지 게시 → 정상 종료
- Slack 게시 자체 실패 → re-throw → DLQ (`algo-daily-bot-worker-dlq`) 라우팅
- `MaximumRetryAttempts: 0` (재시도 없음)

## 환경변수 (Lambda 런타임)

| 변수명 | 설명 |
|---|---|
| `TABLE_NAME` | `AlgoDailyBotTable` |
| `SLACK_BOT_TOKEN` | SSM에서 자동 주입 |
| `SLACK_SIGNING_SECRET` | SSM에서 자동 주입 |
| `SLACK_CHANNEL_ID` | 일일 추천 채널 ID |
| `REVIEW_DAILY_LIMIT` | 기본 10 |
| `BLOG_DAILY_LIMIT` | 기본 5 |

AI API 키는 SSM `/algo-daily-bot/ai-api-key`에서 런타임에 조회 (환경변수 없음).

## 초기 설정 순서

```bash
# 1. 배포
sam build && sam deploy --guided

# 2. SSM 시크릿 설정
aws ssm put-parameter --name /algo-daily-bot/slack-bot-token --type SecureString --value "xoxb-..."
aws ssm put-parameter --name /algo-daily-bot/slack-signing-secret --type SecureString --value "..."

# 3. BOJ 핸들 등록 + 풀이 캐시 초기화
TABLE_NAME=AlgoDailyBotTable ts-node scripts/sync.ts --slack-user-id U04ABC123 --handle myhandle

# 4. AI 제공자 설정
TABLE_NAME=AlgoDailyBotTable ts-node scripts/setup-ai.ts --provider gpt --model gpt-4o-mini --api-key sk-...

# 5. Slack 앱 슬래시 커맨드 URL 설정 (sam deploy 출력의 SlackEventsApiUrl 사용)
```

## 개발 명령어

```bash
npm test              # 단위 테스트 실행
npm run test:coverage # 커버리지 포함
npm run lint          # ESLint
npm run build         # sam build
```

## 코딩 규칙

- 모든 Slack 오류 메시지는 한국어
- DynamoDB 키는 반드시 `src/shared/constants.ts`의 `KEY` 객체 사용
- 새 Lambda 핸들러 추가 시 `template.yaml`에도 반영
- WorkerFunction에 새 `command` 추가 시 `worker.ts`의 `handler` 분기에 추가
- AI 관련 로직은 `aiClient.ts`의 `AIClient` 인터페이스를 통해서만 접근
