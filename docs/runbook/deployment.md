# 배포 가이드

## 사전 준비

### 필수 도구

- [AWS CLI](https://aws.amazon.com/ko/cli/) v2 이상
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js 20.x
- TypeScript / ts-node (`npm install -g ts-node typescript`)

### AWS 권한 확인

```bash
aws sts get-caller-identity
# 출력 예시:
# {
#   "UserId": "AIDAXXXXXXXXXXXXXXXXX",
#   "Account": "123456789012",
#   "Arn": "arn:aws:iam::123456789012:user/myuser"
# }
```

---

## 첫 배포 순서

> **주의**: `sam deploy` 명령은 일부 IAM 계정에서 SAM Transform 권한 오류로 실패합니다. 아래는 호환성이 보장된 **로컬 변환 + 표준 CloudFormation** 배포 방식입니다. 자세한 원인은 [troubleshooting.md](../troubleshooting.md)를 참조하세요.

### 1단계: 의존성 설치 및 빌드

```bash
npm install
pip3 install aws-sam-translator pyyaml
sam build
```

### 2단계: S3 패키징

```bash
sam package \
  --resolve-s3 \
  --s3-prefix algo-daily-bot \
  --output-template-file .aws-sam/packaged-template.yaml \
  --region ap-northeast-2
```

### 3단계: 로컬 SAM 변환

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

### 4단계: CloudFormation 배포 (최초 1회)

```bash
aws cloudformation create-stack \
  --stack-name algo-daily-bot \
  --template-body file://.aws-sam/cfn-transformed.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=SlackChannelId,ParameterValue=C0XXXXXXXXX \
    ParameterKey=ReviewDailyLimit,ParameterValue=10 \
    ParameterKey=BlogDailyLimit,ParameterValue=5 \
  --region ap-northeast-2

aws cloudformation wait stack-create-complete \
  --stack-name algo-daily-bot \
  --region ap-northeast-2

echo "배포 완료!"
```

> **주의**: `SlackBotToken`, `SlackSigningSecret`은 여기서 입력하지 않습니다. SSM에서 런타임 조회합니다 (5단계).

### 5단계: SSM 시크릿 등록

```bash
# Slack Bot Token (xoxb-... 형식)
aws ssm put-parameter \
  --name /algo-daily-bot/slack-bot-token \
  --type SecureString \
  --value "xoxb-YOUR-BOT-TOKEN" \
  --region ap-northeast-2

# Slack Signing Secret
aws ssm put-parameter \
  --name /algo-daily-bot/slack-signing-secret \
  --type SecureString \
  --value "YOUR-SIGNING-SECRET" \
  --region ap-northeast-2
```

### 6단계: AI 제공자 설정

```bash
TABLE_NAME=AlgoDailyBotTable \
  ts-node scripts/setup-ai.ts \
  --provider gpt \
  --model gpt-4o-mini \
  --api-key sk-YOUR-OPENAI-KEY
```

AI API 키는 자동으로 SSM `/algo-daily-bot/ai-api-key`에 저장됩니다.

### 7단계: BOJ 핸들 등록 + 풀이 캐시 초기화

```bash
TABLE_NAME=AlgoDailyBotTable \
  ts-node scripts/sync.ts \
  --slack-user-id U04XXXXXXXXX \
  --handle your_boj_handle
```

자세한 내용은 [initial-sync.md](./initial-sync.md)를 참조하세요.

### 8단계: Slack 앱 슬래시 커맨드 URL 설정

배포 완료 후 출력되는 URL을 Slack 앱 설정에 등록합니다:

```bash
# 배포 출력에서 URL 확인
aws cloudformation describe-stacks \
  --stack-name algo-daily-bot \
  --query "Stacks[0].Outputs[?OutputKey=='SlackEventsApiUrl'].OutputValue" \
  --output text
```

출력된 URL을 [Slack API](https://api.slack.com/apps) → 앱 선택 → Slash Commands → `/review`, `/blog` 각각의 Request URL에 등록합니다.

---

## 업데이트 배포

코드 변경 후 (1~3단계 반복 후 `update-stack` 사용):

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

## 배포 확인

```bash
# Lambda 함수 목록 확인
aws lambda list-functions \
  --query "Functions[?starts_with(FunctionName, 'algo-daily-bot')].[FunctionName,LastModified]" \
  --output table \
  --region ap-northeast-2

# DLQ 메시지 수 확인 (0이어야 정상)
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name algo-daily-bot-worker-dlq --query QueueUrl --output text) \
  --attribute-names ApproximateNumberOfMessages
```

---

## 리소스 삭제

```bash
sam delete --stack-name algo-daily-bot
```

> **주의**: DynamoDB 테이블과 SSM 파라미터는 별도로 삭제해야 합니다.

```bash
aws dynamodb delete-table --table-name AlgoDailyBotTable
aws ssm delete-parameter --name /algo-daily-bot/slack-bot-token
aws ssm delete-parameter --name /algo-daily-bot/slack-signing-secret
aws ssm delete-parameter --name /algo-daily-bot/ai-api-key
```
