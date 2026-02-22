# 사용자 가이드 — algo-daily-bot 처음 설정하기

> 이 문서는 이 프로젝트를 처음 접하는 분을 위해 **처음부터 끝까지** 모든 설정 단계를 설명합니다.

---

## 목차

1. [사전 준비 (Node.js / AWS CLI / SAM CLI)](#1-사전-준비)
2. [Slack 앱 만들기](#2-slack-앱-만들기)
3. [프로젝트 클론 및 의존성 설치](#3-프로젝트-클론-및-의존성-설치)
4. [SAM 배포](#4-sam-배포)
5. [SSM 시크릿 등록](#5-ssm-시크릿-등록)
6. [BOJ 핸들 등록 및 풀이 캐시 초기화](#6-boj-핸들-등록-및-풀이-캐시-초기화)
7. [AI 제공자 설정](#7-ai-제공자-설정)
8. [Slack 앱에 URL 등록](#8-slack-앱에-url-등록)
9. [정상 동작 확인](#9-정상-동작-확인)
10. [슬래시 커맨드 사용법](#10-슬래시-커맨드-사용법)
11. [문제 해결](#11-문제-해결)
12. [트러블슈팅](./troubleshooting.md)

---

## 1. 사전 준비

### 필요한 것들

| 항목 | 설명 |
|------|------|
| Node.js 20.x 이상 | 로컬 스크립트 실행용 |
| AWS CLI v2 | AWS 리소스 관리 |
| AWS SAM CLI | Lambda 빌드/배포 |
| 백준(BOJ) 계정 | https://www.acmicpc.net |
| Slack 워크스페이스 | 관리자 권한 필요 |
| AI API 키 | GPT / Claude / Gemini 중 하나 |

---

### 1-1. Node.js 설치

```bash
# 설치 확인
node --version
# v20.x.x 이상이면 OK

# 설치 안 됐다면 (macOS, Homebrew):
brew install node@20
```

Homebrew가 없다면 먼저 설치:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

### 1-2. AWS CLI 설치

```bash
# 설치 확인
aws --version
# aws-cli/2.x.x 이상이면 OK

# 설치 안 됐다면 (macOS, Homebrew):
brew install awscli

# 설치 후 확인
aws --version
```

> Windows라면 https://aws.amazon.com/ko/cli/ 에서 .msi 설치 파일 다운로드

---

### 1-3. AWS SAM CLI 설치

```bash
# 설치 확인
sam --version
# SAM CLI, version 1.x.x 이상이면 OK

# 설치 안 됐다면 (macOS, Homebrew):
brew tap aws/tap
brew install aws-sam-cli

# 설치 후 확인
sam --version
```

---

### 1-4. AWS 계정 및 자격증명 설정

AWS 계정이 없다면 https://aws.amazon.com 에서 가입합니다 (프리 티어 사용 가능).

**IAM 사용자 생성 및 액세스 키 발급 (권장):**

> 루트 계정 액세스 키는 보안상 권장하지 않습니다. IAM 사용자를 별도로 만들어 사용하세요.

**1단계 - IAM 콘솔 이동:**
- AWS 콘솔 상단 검색창에 `IAM` 입력 → 클릭

**2단계 - 사용자 생성:**
1. 왼쪽 메뉴 → **"사용자"** → **"사용자 생성"** 클릭
2. 사용자 이름 입력 (예: `algo-bot-user`) → **"다음"**
3. 권한 설정: **"직접 정책 연결"** 선택
4. 검색창에 `AdministratorAccess` 입력 → 체크박스 선택 → **"다음"**
5. 내용 확인 후 **"사용자 생성"** 클릭

**3단계 - 액세스 키 발급:**
1. 생성된 사용자 이름 클릭
2. **"보안 자격 증명"** 탭 클릭
3. 스크롤 내려서 **"액세스 키 만들기"** 클릭
4. 용도: **"Command Line Interface (CLI)"** 선택
5. 하단 체크박스 체크 → **"다음"** → **"액세스 키 만들기"**
6. **액세스 키**와 **시크릿 액세스 키** 복사 (또는 `.csv 파일 다운로드`로 저장)

> 이 창을 닫으면 시크릿 액세스 키를 다시 볼 수 없으니 반드시 복사해두세요.

**AWS CLI에 자격증명 등록:**

```bash
aws configure
```

프롬프트에 순서대로 입력:

```
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE     ← 위에서 복사한 키 ID
AWS Secret Access Key [None]: wJalrXUtnFEMI/...     ← 위에서 복사한 시크릿 키
Default region name [None]: ap-northeast-2           ← 서울 리전 (그대로 입력)
Default output format [None]: json                   ← 그대로 입력
```

**설정 확인:**

```bash
aws sts get-caller-identity
```

아래와 같이 출력되면 정상:

```json
{
  "UserId": "AIDAXXXXXXXXXXXXXXXXX",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/myuser"
}
```

> `AdministratorAccess`를 붙인 경우 별도 권한 설정 불필요. 최소 권한만 부여하고 싶다면 Lambda, DynamoDB, S3, CloudFormation, API Gateway, SQS, SSM, CloudWatch, IAM 정책을 개별 추가하세요.

---

## 2. Slack 앱 만들기

가장 중요한 단계입니다. 여기서 **Bot Token**과 **Signing Secret** 두 가지를 얻어야 합니다.

### 2-1. 새 Slack 앱 생성

1. https://api.slack.com/apps 접속
2. **"Create New App"** 클릭
3. **"From scratch"** 선택
4. App Name: `algo-daily-bot` (원하는 이름)
5. Workspace: 봇을 추가할 워크스페이스 선택
6. **"Create App"** 클릭

### 2-2. Bot Token Scopes 설정 (권한 추가)

1. 왼쪽 메뉴에서 **"OAuth & Permissions"** 클릭
2. **"Bot Token Scopes"** 섹션까지 스크롤
3. **"Add an OAuth Scope"** 클릭 후 다음 권한들 추가:

| Scope | 용도 |
|-------|------|
| `chat:write` | 채널에 메시지 전송 |
| `chat:write.public` | 봇이 초대받지 않은 공개 채널에도 전송 |
| `commands` | 슬래시 커맨드 수신 |

### 2-3. 앱 설치 및 Bot Token 복사

1. **"OAuth & Permissions"** 페이지 상단의 **"Install to Workspace"** 클릭
2. 권한 허용 후 리다이렉트
3. **"Bot User OAuth Token"** 복사 → 이것이 `SLACK_BOT_TOKEN`

```
예시: xoxb-YOUR-WORKSPACE-ID-YOUR-BOT-TOKEN
      ↑ 반드시 xoxb- 로 시작
```

### 2-4. Signing Secret 복사

1. 왼쪽 메뉴에서 **"Basic Information"** 클릭
2. **"App Credentials"** 섹션에서 **"Signing Secret"** 옆 **"Show"** 클릭
3. 값 복사 → 이것이 `SLACK_SIGNING_SECRET`

```
예시: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
      (32자 16진수 문자열)
```

### 2-5. Slack 채널 ID 확인

일일 문제 추천을 받을 채널의 ID가 필요합니다.

**방법 1 (Slack 데스크탑 앱)**:
1. 원하는 채널 우클릭
2. **"채널 세부정보 보기"** 클릭
3. 맨 아래 **"채널 ID"** 복사

**방법 2 (URL에서 확인)**:
- Slack 웹 버전에서 채널 URL 확인: `https://app.slack.com/client/TXXXXXXXX/CXXXXXXXXX`
- 뒷부분 `C`로 시작하는 부분이 채널 ID

```
예시: C0123456789
      ↑ 반드시 C 로 시작
```

**채널에 봇 초대** (중요!):
1. 채널 메시지 입력창에 `/invite` 입력
2. **"이 채널에 앱 추가"** 클릭
3. 목록에서 `algo-daily-bot` 선택 → **"추가"**

---

## 3. 프로젝트 클론 및 의존성 설치

```bash
# 저장소 클론
git clone <repository-url>
cd algo-daily-bot

# 의존성 설치
npm install

# 환경변수 파일 생성
cp .env.example .env
```

### `.env` 파일 작성

`.env` 파일을 열어서 아래와 같이 채워줍니다:

```bash
# .env

# DynamoDB 테이블명 (SAM 배포 후 자동 생성됨, 이 값 그대로 사용)
TABLE_NAME=AlgoDailyBotTable

# Slack Bot Token (2-3 단계에서 복사한 값)
SLACK_BOT_TOKEN=xoxb-YOUR-WORKSPACE-ID-YOUR-BOT-TOKEN

# Slack Signing Secret (2-4 단계에서 복사한 값)
SLACK_SIGNING_SECRET=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4

# 일일 추천 채널 ID (2-5 단계에서 복사한 값)
SLACK_CHANNEL_ID=C0123456789

# 요청 제한 (기본값 그대로 사용 가능)
REVIEW_DAILY_LIMIT=10
BLOG_DAILY_LIMIT=5
```

> **주의**: `.env` 파일은 절대 git에 커밋하지 마세요. `.gitignore`에 이미 포함되어 있습니다.

---

## 4. SAM 배포

> **알림**: `sam deploy` 명령은 IAM 정책 제한으로 일부 AWS 계정에서 실패할 수 있습니다. 이 가이드는 호환성이 보장된 **로컬 변환 방식**을 사용합니다. 자세한 내용은 [troubleshooting.md](./troubleshooting.md)를 참조하세요.

### 4-1. 필수 도구 설치

```bash
# esbuild (TypeScript 번들링용)
brew install esbuild
esbuild --version

# Python SAM 변환 라이브러리
pip3 install aws-sam-translator pyyaml
```

### 4-2. 빌드

```bash
sam build
```

정상 출력 예시:
```
Build Succeeded

Built Artifacts  : .aws-sam/build
Built Template   : .aws-sam/build/template.yaml
```

> `package.json file not found. Bundling source without installing dependencies.` 경고는 정상입니다.

### 4-3. S3 패키징

Lambda 코드를 S3에 업로드하고 패키징된 템플릿을 생성합니다:

```bash
sam package \
  --resolve-s3 \
  --s3-prefix algo-daily-bot \
  --output-template-file .aws-sam/packaged-template.yaml \
  --region ap-northeast-2
```

정상 출력 예시:
```
Successfully packaged artifacts and wrote output template to file .aws-sam/packaged-template.yaml.
```

### 4-4. 로컬 SAM 변환

SAM 템플릿을 표준 CloudFormation 템플릿으로 로컬에서 변환합니다:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

python3 -c "
import json
from samtranslator.yaml_helper import yaml_parse
from samtranslator.public.translator import ManagedPolicyLoader
from samtranslator.translator.transform import transform
import boto3

with open('.aws-sam/packaged-template.yaml') as f:
    sam_template = yaml_parse(f)

iam_client = boto3.client('iam', region_name='ap-northeast-2')
loader = ManagedPolicyLoader(iam_client)
cfn_template = transform(sam_template, {'AccountId': '${ACCOUNT_ID}', 'Region': 'ap-northeast-2'}, loader)

with open('.aws-sam/cfn-transformed.json', 'w') as f:
    json.dump(cfn_template, f, indent=2)
print('변환 완료')
"
```

### 4-5. 첫 배포

```bash
aws cloudformation create-stack \
  --stack-name algo-daily-bot \
  --template-body file://.aws-sam/cfn-transformed.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=SlackChannelId,ParameterValue=C0123456789 \
    ParameterKey=ReviewDailyLimit,ParameterValue=10 \
    ParameterKey=BlogDailyLimit,ParameterValue=5 \
  --region ap-northeast-2

# 완료까지 대기 (약 2~3분)
aws cloudformation wait stack-create-complete \
  --stack-name algo-daily-bot \
  --region ap-northeast-2 && echo "배포 완료!"
```

배포 완료 후 API URL 확인:

```bash
aws cloudformation describe-stacks \
  --stack-name algo-daily-bot \
  --region ap-northeast-2 \
  --query "Stacks[0].Outputs[?OutputKey=='SlackEventsApiUrl'].OutputValue" \
  --output text
```

출력 예시:
```
https://<API_ID>.execute-api.ap-northeast-2.amazonaws.com/slack/events
```

> **이 URL을 복사해두세요!** 나중에 Slack 앱에 등록해야 합니다 (8단계).

### 4-6. 이후 재배포 (코드 변경 시)

```bash
sam build && \
sam package \
  --resolve-s3 \
  --s3-prefix algo-daily-bot \
  --output-template-file .aws-sam/packaged-template.yaml \
  --region ap-northeast-2 && \
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) && \
python3 -c "
import json
from samtranslator.yaml_helper import yaml_parse
from samtranslator.public.translator import ManagedPolicyLoader
from samtranslator.translator.transform import transform
import boto3

with open('.aws-sam/packaged-template.yaml') as f:
    sam_template = yaml_parse(f)

iam_client = boto3.client('iam', region_name='ap-northeast-2')
loader = ManagedPolicyLoader(iam_client)
cfn_template = transform(sam_template, {'AccountId': '${ACCOUNT_ID}', 'Region': 'ap-northeast-2'}, loader)

with open('.aws-sam/cfn-transformed.json', 'w') as f:
    json.dump(cfn_template, f, indent=2)
" && \
aws cloudformation update-stack \
  --stack-name algo-daily-bot \
  --template-body file://.aws-sam/cfn-transformed.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=SlackChannelId,UsePreviousValue=true \
    ParameterKey=ReviewDailyLimit,UsePreviousValue=true \
    ParameterKey=BlogDailyLimit,UsePreviousValue=true \
  --region ap-northeast-2

aws cloudformation wait stack-update-complete \
  --stack-name algo-daily-bot \
  --region ap-northeast-2 && echo "재배포 완료!"
```

---

## 5. SSM 시크릿 등록

`SLACK_BOT_TOKEN`과 `SLACK_SIGNING_SECRET`은 보안을 위해 Lambda 환경변수가 아닌 **AWS SSM Parameter Store**에 저장합니다.

```bash
# Slack Bot Token 등록
aws ssm put-parameter \
  --name /algo-daily-bot/slack-bot-token \
  --type SecureString \
  --value "xoxb-YOUR-WORKSPACE-ID-YOUR-BOT-TOKEN" \
  --region ap-northeast-2

# Slack Signing Secret 등록
aws ssm put-parameter \
  --name /algo-daily-bot/slack-signing-secret \
  --type SecureString \
  --value "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" \
  --region ap-northeast-2
```

등록 확인:

```bash
aws ssm get-parameter \
  --name /algo-daily-bot/slack-bot-token \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region ap-northeast-2
# xoxb-... 값이 출력되면 정상
```

---

## 6. BOJ 핸들 등록 및 풀이 캐시 초기화

이 단계에서 **백준 핸들**을 등록하고, **이미 푼 문제 목록**을 DynamoDB에 캐싱합니다. 이 데이터가 있어야 일일 추천에서 이미 푼 문제가 제외됩니다.

### 6-1. 내 Slack User ID 확인

**방법 1**: Slack에서 본인 프로필 클릭 → 더보기 메뉴(⋮) → **"멤버 ID 복사"**

**방법 2**: Slack 메시지에서 본인 이름 클릭 → **"프로필 보기"** → 더보기(⋮) → **"멤버 ID 복사"**

```
예시: U04ABC123XY
      ↑ 반드시 U 로 시작
```

### 6-2. 초기화 스크립트 실행

```bash
TABLE_NAME=AlgoDailyBotTable \
  npx ts-node scripts/sync.ts \
  --slack-user-id U04ABC123XY \
  --handle 백준핸들명
```

실행 예시:

```
📋 초기 설정 시작
  Slack User ID: U04ABC123XY
  BOJ 핸들: myhandle

1️⃣  사용자 프로필 저장 중...
   ✅ 프로필 저장 완료

2️⃣  solved.ac에서 전체 풀이 목록 조회 중...
   📦 총 342개 문제 조회 완료

3️⃣  DynamoDB에 풀이 캐시 저장 중...
   ✅ 342개 문제 저장 완료

🎉 초기 설정 완료!
```

> 풀이한 문제가 많을수록 시간이 더 걸릴 수 있습니다. (1000문제 기준 약 1~2분)

---

## 7. AI 제공자 설정

코드 리뷰와 블로그 초안 생성에 사용할 AI를 설정합니다. GPT, Claude, Gemini 중 하나를 선택합니다.

### API 키 발급

| 제공자 | 발급 링크 | 키 형식 |
|--------|-----------|---------|
| GPT (OpenAI) | https://platform.openai.com/api-keys | `sk-...` |
| Claude (Anthropic) | https://console.anthropic.com | `sk-ant-...` |
| Gemini (Google) | https://aistudio.google.com/app/apikey | `AIza...` |

### GPT 설정 예시 (추천)

```bash
TABLE_NAME=AlgoDailyBotTable \
  npx ts-node scripts/setup-ai.ts \
  --provider gpt \
  --model gpt-4o-mini \
  --api-key sk-YOUR-OPENAI-API-KEY
```

### Claude 설정 예시

```bash
TABLE_NAME=AlgoDailyBotTable \
  npx ts-node scripts/setup-ai.ts \
  --provider claude \
  --model claude-haiku-4-5 \
  --api-key sk-ant-YOUR-ANTHROPIC-KEY
```

### Gemini 설정 예시

```bash
TABLE_NAME=AlgoDailyBotTable \
  npx ts-node scripts/setup-ai.ts \
  --provider gemini \
  --model gemini-2.0-flash \
  --api-key AIzaYOUR-GOOGLE-KEY
```

### 사용 가능한 모델 목록

| 제공자 | 추천 모델 | 비고 |
|--------|-----------|------|
| gpt | `gpt-4o-mini` | 비용 대비 성능 우수 (추천) |
| gpt | `gpt-4o` | 더 높은 품질 |
| claude | `claude-haiku-4-5` | 빠르고 저렴 |
| claude | `claude-sonnet-4-6` | 높은 품질 |
| gemini | `gemini-2.0-flash` | 빠른 응답 |
| gemini | `gemini-1.5-pro` | 높은 품질 |

> **나중에 AI를 바꾸고 싶다면?** 배포 없이 위 명령어를 다시 실행하면 즉시 변경됩니다.

---

## 8. Slack 앱에 URL 등록

4단계에서 복사한 API Gateway URL을 Slack 앱에 등록합니다.

### 8-1. /review 슬래시 커맨드 등록

1. https://api.slack.com/apps 접속 → 앱 선택
2. 왼쪽 메뉴 **"Slash Commands"** 클릭
3. **"Create New Command"** 클릭

| 항목 | 값 |
|------|----|
| Command | `/review` |
| Request URL | `https://xxxxxxxxxx.execute-api.ap-northeast-2.amazonaws.com/slack/events` |
| Short Description | `AI 코드 리뷰 요청` |
| Usage Hint | `` ```[언어] 코드 ``` `` |

4. **"Save"** 클릭

### 8-2. /blog 슬래시 커맨드 등록

**"Create New Command"** 다시 클릭:

| 항목 | 값 |
|------|----|
| Command | `/blog` |
| Request URL | `https://xxxxxxxxxx.execute-api.ap-northeast-2.amazonaws.com/slack/events` |
| Short Description | `AI 블로그 초안 생성` |
| Usage Hint | `백준 1234번 피보나치 풀이` |

4. **"Save"** 클릭

### 8-3. 앱 재설치 (권한 업데이트)

슬래시 커맨드를 추가하면 앱을 재설치해야 합니다:

1. **"OAuth & Permissions"** → **"Reinstall to Workspace"** 클릭
2. 권한 허용

---

## 9. 정상 동작 확인

### 9-1. Slack 서명 검증 테스트

`/review` 커맨드 입력 후 봇이 반응하는지 확인합니다.

```
/review 안녕하세요
```

→ `사용법: /review [문제번호] [solved|failed] ...` 메시지가 오면 **서명 검증 성공** (커맨드가 전달됨).

### 9-2. 코드 리뷰 테스트

```
/review ```python
def solution(n):
    if n <= 1:
        return n
    return solution(n-1) + solution(n-2)

print(solution(10))
```
```

→ 잠시 후 같은 스레드에 AI 리뷰가 달리면 성공!

### 9-3. 일일 추천 즉시 테스트

AWS 콘솔에서 수동으로 Lambda를 실행해 테스트합니다:

```bash
aws lambda invoke \
  --function-name algo-daily-bot-daily-recommend \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  response.json \
  --region ap-northeast-2

cat response.json
# {"statusCode": 200} 또는 null 이면 성공
```

Slack 채널에 문제 추천 메시지가 오면 성공!

---

## 10. 슬래시 커맨드 사용법

### /review — AI 코드 리뷰

문제 번호와 결과를 함께 입력하면 문제 조건에 맞는 정확한 리뷰를 받습니다.

**문제 번호 + 정답 여부 포함 (권장):**

````
/review 1753 solved ```python
def dijkstra(n, graph):
    import heapq
    dist = [float('inf')] * (n + 1)
    dist[1] = 0
    ...
```
````

````
/review 1753 failed ```python
def dijkstra(n, graph):
    ...
```
````

**정답 여부 생략 (문제 번호는 필수):**

````
/review 1753 ```python
def dijkstra(n, graph):
    ...
```
````

**입력 필드**:

| 필드 | 필수 여부 | 설명 |
|------|-----------|------|
| `번호` | **필수** | BOJ 문제 번호. solved.ac에서 제목·난이도·태그 자동 조회 |
| `solved\|failed` | 선택 | 생략 시 정답 여부 없이 코드만 리뷰 |
| 코드블록 | **필수** | 3중 백틱으로 감싼 코드 |

**제약 사항**:
- 코드는 반드시 ` ``` ` 3중 백틱으로 감싸야 합니다
- 최대 3,000자
- 언어 태그 선택 사항 (` ```python`, ` ```java`, ` ```cpp` 등)
- 하루 최대 **10회** (기본값)

**리뷰 내용**:
- 문제 조건 기반 정확성 검증 (엣지 케이스 포함)
- 시간/공간 복잡도 (Big-O)
- 코드 스타일 개선점
- (`failed` 시) 오류 원인 집중 분석
- (`solved` 시) 최적화 및 대안 풀이 제안

---

### /blog — AI 블로그 초안 생성

주제를 입력하면 블로그 초안을 마크다운으로 생성합니다.

**주제만 입력:**
```
/blog 백준 1753번 최단 경로 다익스트라 풀이
```

**코드와 함께 입력:**

````
/blog 유니온-파인드 알고리즘 분석 ```python
def find(x):
    if parent[x] != x:
        parent[x] = find(parent[x])
    return parent[x]
```
````

**생성 형식**:
```markdown
# [제목]

## 문제 설명
## 풀이 접근법
## 코드 분석
## 복잡도 분석
## 배운 점
```

**제약 사항**:
- 하루 최대 **5회** (기본값)
- 응답이 길면 자동으로 여러 메시지로 분할됩니다

---

### 일일 문제 추천

별도 설정 없이 **매일 오전 09:00 KST**에 자동으로 등록한 채널에 메시지가 옵니다.

```
🧩 *오늘의 백준 문제*

*[Gold IV] 최단 경로*
🔗 https://boj.kr/1753
태그: 다익스트라, 최단 경로
```

---

## 11. 문제 해결

### "Unauthorized" 응답

Slack 서명 검증 실패입니다.

```bash
# SSM에 저장된 Signing Secret 확인
aws ssm get-parameter \
  --name /algo-daily-bot/slack-signing-secret \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region ap-northeast-2
```

→ 값이 Slack 앱 Basic Information의 Signing Secret과 다르면 6단계를 다시 실행합니다.

---

### "AI 설정이 없습니다" 오류

8단계 AI 설정이 누락됐습니다. `scripts/setup-ai.ts`를 다시 실행합니다.

---

### "/review 커맨드를 찾을 수 없습니다" (Slack에서)

9단계 슬래시 커맨드 등록이 누락됐습니다. Slack 앱 설정에서 커맨드를 등록하고 앱을 재설치합니다.

---

### 일일 추천이 오지 않음

```bash
# Lambda 실행 로그 확인
aws logs tail /aws/lambda/algo-daily-bot-daily-recommend \
  --follow \
  --region ap-northeast-2
```

→ 로그에서 오류 메시지를 확인합니다.

---

### DLQ에 메시지가 쌓임 (CloudWatch 알람)

WorkerFunction이 완전히 실패했습니다.

```bash
# DLQ 메시지 내용 확인
aws sqs receive-message \
  --queue-url $(aws sqs get-queue-url \
    --queue-name algo-daily-bot-worker-dlq \
    --query QueueUrl --output text \
    --region ap-northeast-2) \
  --region ap-northeast-2
```

→ 메시지 내용을 보고 원인을 파악합니다. 주로 SSM 권한 문제나 AI API 키 만료입니다.

---

### AI 제공자 변경

배포 없이 즉시 변경 가능합니다:

```bash
TABLE_NAME=AlgoDailyBotTable \
  npx ts-node scripts/setup-ai.ts \
  --provider claude \
  --model claude-haiku-4-5 \
  --api-key sk-ant-NEW-KEY
```

---

## 전체 설정 체크리스트

```
사전 준비
  □ Node.js 20.x 설치
  □ AWS CLI + SAM CLI 설치
  □ AWS 자격증명 설정 (ap-northeast-2)

Slack 앱
  □ Slack 앱 생성
  □ Bot Token Scopes 추가 (chat:write, chat:write.public, commands)
  □ 앱 워크스페이스에 설치
  □ Bot User OAuth Token 복사 (xoxb-...)
  □ Signing Secret 복사
  □ 채널 ID 확인 (C...)
  □ 봇을 채널에 초대 (/invite @앱이름)

배포
  □ npm install
  □ .env 파일 작성
  □ pip3 install aws-sam-translator pyyaml
  □ sam build
  □ sam package --resolve-s3 (S3 업로드)
  □ python3 로컬 SAM 변환 (.aws-sam/cfn-transformed.json 생성)
  □ aws cloudformation create-stack (배포)
  □ API Gateway URL 복사

SSM 시크릿
  □ /algo-daily-bot/slack-bot-token 등록
  □ /algo-daily-bot/slack-signing-secret 등록

초기 데이터
  □ scripts/sync.ts 실행 (BOJ 핸들 + 풀이 캐시)
  □ scripts/setup-ai.ts 실행 (AI 제공자 설정)

Slack 앱 완성
  □ /review 슬래시 커맨드 등록
  □ /blog 슬래시 커맨드 등록
  □ 앱 재설치

동작 확인
  □ /review 테스트
  □ /blog 테스트
  □ Lambda 수동 실행으로 일일 추천 테스트
```
