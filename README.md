# algo-daily-bot

AWS Lambda 기반 서버리스 슬랙봇 | 매일 백준 문제 추천 + AI 코드 리뷰 + 블로그 초안 자동 생성

## 기능

| 기능 | 설명 |
|---|---|
| 📅 일일 문제 추천 | 매일 09:00 KST에 solved.ac 기반 백준 문제를 Slack 채널에 자동 게시 |
| 🔍 AI 코드 리뷰 | `/review` 슬래시 커맨드로 코드를 제출하면 AI가 한국어로 리뷰 |
| ✍️ 블로그 초안 생성 | `/blog` 슬래시 커맨드로 알고리즘 풀이 블로그 초안 자동 생성 |

## 아키텍처

```
EventBridge (크론)
    ↓
DailyRecommendFunction ─────────────────────→ Slack 채널
    ↓ (solved.ac API)
    └── DynamoDB (추천 이력 + 풀이 캐시)

Slack 슬래시 커맨드
    ↓
SlackEventsFunction (유효성 검사 → 즉시 200 반환)
    ↓ Lambda.invoke(async)
WorkerFunction ──→ AI API (GPT / Claude / Gemini)
    ↓
Slack 스레드 답글
    ↓ (실패 시)
SQS Dead Letter Queue
```

## 기술 스택

- **런타임**: Node.js 20.x (TypeScript), ARM64 Lambda
- **IaC**: AWS SAM
- **데이터베이스**: DynamoDB 단일 테이블
- **AI**: GPT / Claude / Gemini (런타임 전환 가능)
- **문제 소스**: solved.ac 비공식 API

## 시작하기

### 사전 요구사항

- AWS CLI 설정 (`ap-northeast-2` 리전 권장)
- AWS SAM CLI 설치
- Node.js 20.x
- [Slack 앱 생성](https://api.slack.com/apps) (스코프: `chat:write`, `commands`)

### 설치 및 배포

```bash
# 1. 의존성 설치
npm install && pip3 install aws-sam-translator pyyaml

# 2. 빌드 및 S3 패키징
sam build
sam package --resolve-s3 --s3-prefix algo-daily-bot \
  --output-template-file .aws-sam/packaged-template.yaml \
  --region ap-northeast-2

# 3. 로컬 SAM 변환 후 배포
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
python3 -c "
import json
from samtranslator.yaml_helper import yaml_parse
from samtranslator.public.translator import ManagedPolicyLoader
from samtranslator.translator.transform import transform
import boto3

with open('.aws-sam/packaged-template.yaml') as f:
    sam_template = yaml_parse(f)
loader = ManagedPolicyLoader(boto3.client('iam', region_name='ap-northeast-2'))
cfn = transform(sam_template, {'AccountId': '${ACCOUNT_ID}', 'Region': 'ap-northeast-2'}, loader)
open('.aws-sam/cfn-transformed.json', 'w').write(__import__('json').dumps(cfn, indent=2))
"

aws cloudformation create-stack \
  --stack-name algo-daily-bot \
  --template-body file://.aws-sam/cfn-transformed.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=SlackChannelId,ParameterValue=C0XXXXXXXXX \
    ParameterKey=ReviewDailyLimit,ParameterValue=10 \
    ParameterKey=BlogDailyLimit,ParameterValue=5 \
  --region ap-northeast-2
# → 완료 후 SlackEventsApiUrl을 메모해두세요
```

> **참고**: `sam deploy --guided`는 일부 AWS 계정에서 SAM Transform 권한 오류가 발생합니다. 위 방식은 로컬에서 변환 후 표준 CloudFormation으로 배포합니다. 자세한 내용은 [troubleshooting.md](docs/troubleshooting.md)를 참조하세요.

### SSM 시크릿 설정

```bash
aws ssm put-parameter --name /algo-daily-bot/slack-bot-token \
  --type SecureString --value "xoxb-..."

aws ssm put-parameter --name /algo-daily-bot/slack-signing-secret \
  --type SecureString --value "..."
```

### 초기 데이터 설정

```bash
# BOJ 핸들 등록 + 전체 풀이 캐시 초기화 (약 1~5분 소요)
TABLE_NAME=AlgoDailyBotTable \
ts-node scripts/sync.ts --slack-user-id <Slack_User_ID> --handle <BOJ_핸들>
```

### AI 제공자 설정

```bash
# 지원 제공자: gpt | claude | gemini
TABLE_NAME=AlgoDailyBotTable \
ts-node scripts/setup-ai.ts --provider gpt --model gpt-4o-mini --api-key sk-...
```

| 제공자 | `--provider` | 모델 예시 |
|---|---|---|
| OpenAI | `gpt` | `gpt-4o-mini`, `gpt-4o` |
| Anthropic | `claude` | `claude-haiku-4-5`, `claude-sonnet-4-6` |
| Google | `gemini` | `gemini-2.0-flash`, `gemini-1.5-pro` |

AI 제공자 변경 시 `setup-ai.ts`를 다시 실행하면 됩니다. **Lambda 재배포 불필요.**

### Slack 앱 설정

1. [Slack 앱 설정](https://api.slack.com/apps)에서 슬래시 커맨드 등록:
   - `/review` → `<SlackEventsApiUrl>`
   - `/blog` → `<SlackEventsApiUrl>`

2. Bot Token Scopes 확인: `chat:write`, `commands`

## 슬래시 커맨드 사용법

### `/review` — AI 코드 리뷰

BOJ 문제 번호가 필수입니다. `solved` / `failed`로 정답 여부를 알려주면 더 정확한 피드백을 받습니다.

````
/review 1753 solved ```python
def dijkstra(n, graph):
    import heapq
    dist = [float('inf')] * (n + 1)
    ...
```
````

````
/review 1753 failed ```python
def dijkstra(n, graph):
    ...
```
````

- 문제 번호: 필수 (solved.ac에서 제목·난이도·태그 자동 조회)
- `solved|failed`: 선택 (생략 시 정답 여부 없이 코드 리뷰)
- 최대 3,000자 / 일일 10회 제한

### `/blog` — 블로그 초안 생성

```
/blog 백준 1932번 정수 삼각형 DP 풀이
```

코드를 함께 포함할 수도 있습니다:

````
/blog 피보나치 DP 풀이 ```python
def fib(n): ...
```
````

- 일일 5회 제한
- 결과는 스레드 답글에 마크다운 형식으로 게시

## 개발

```bash
npm test              # 단위 테스트
npm run test:coverage # 커버리지 포함
npm run lint          # ESLint
sam local invoke DailyRecommendFunction -e events/schedule.json  # 로컬 테스트
```

## 모니터링

- **WorkerDLQ 알람**: DLQ에 메시지가 쌓이면 CloudWatch 알람 발생
- **로그**: CloudWatch Logs (`/aws/lambda/algo-daily-bot-*`)

## 라이선스

MIT
