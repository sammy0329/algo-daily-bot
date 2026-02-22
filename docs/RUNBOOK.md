# 운영 런북 (RUNBOOK)

> 배포·모니터링·장애 대응을 위한 운영 가이드. 상세 초기 설정은 [user-guide.md](./user-guide.md)를 참조하세요.

---

## 배포

### 코드 변경 후 재배포

```bash
# 1. 빌드 + 패키징 + 로컬 변환
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
cfn_template = transform(sam_template, {'AccountId': '\${ACCOUNT_ID}', 'Region': 'ap-northeast-2'}, loader)
with open('.aws-sam/cfn-transformed.json', 'w') as f:
    json.dump(cfn_template, f, indent=2)
"

# 2. CloudFormation 스택 업데이트
aws cloudformation update-stack \
  --stack-name algo-daily-bot \
  --template-body file://.aws-sam/cfn-transformed.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=SlackChannelId,UsePreviousValue=true \
    ParameterKey=ReviewDailyLimit,UsePreviousValue=true \
    ParameterKey=BlogDailyLimit,UsePreviousValue=true \
  --region ap-northeast-2

# 3. 완료 대기
aws cloudformation wait stack-update-complete \
  --stack-name algo-daily-bot \
  --region ap-northeast-2 && echo "재배포 완료!"
```

### 배포 확인

```bash
aws lambda list-functions \
  --query "Functions[?starts_with(FunctionName, 'algo-daily-bot')].[FunctionName,LastModified]" \
  --output table \
  --region ap-northeast-2
```

### Slack 채널 ID 변경

```bash
aws cloudformation update-stack \
  --stack-name algo-daily-bot \
  --use-previous-template \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=SlackChannelId,ParameterValue=C새채널ID \
    ParameterKey=ReviewDailyLimit,UsePreviousValue=true \
    ParameterKey=BlogDailyLimit,UsePreviousValue=true \
  --region ap-northeast-2
```

---

## Lambda 수동 실행 (테스트)

### 일일 문제 추천 즉시 실행

```bash
aws lambda invoke \
  --function-name algo-daily-bot-daily-recommend \
  --payload '{"source":"aws.events","detail-type":"Scheduled Event"}' \
  --cli-binary-format raw-in-base64-out \
  --log-type Tail \
  --region ap-northeast-2 \
  /tmp/output.json
```

### solved.ac 동기화 즉시 실행

```bash
aws lambda invoke \
  --function-name algo-daily-bot-daily-sync \
  --payload '{"source":"aws.events","detail-type":"Scheduled Event"}' \
  --cli-binary-format raw-in-base64-out \
  --log-type Tail \
  --region ap-northeast-2 \
  /tmp/output.json
```

---

## 모니터링

### CloudWatch 로그 실시간 확인

```bash
# SlackEventsFunction
aws logs tail /aws/lambda/algo-daily-bot-slack-events --follow --region ap-northeast-2

# WorkerFunction
aws logs tail /aws/lambda/algo-daily-bot-worker --follow --region ap-northeast-2

# 일일 추천
aws logs tail /aws/lambda/algo-daily-bot-daily-recommend --follow --region ap-northeast-2

# solved.ac 동기화
aws logs tail /aws/lambda/algo-daily-bot-daily-sync --follow --region ap-northeast-2
```

### DLQ 메시지 확인

```bash
QUEUE_URL=$(aws sqs get-queue-url \
  --queue-name algo-daily-bot-worker-dlq \
  --query QueueUrl --output text \
  --region ap-northeast-2)

# 메시지 수 확인 (0이어야 정상)
aws sqs get-queue-attributes \
  --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages \
  --region ap-northeast-2

# 메시지 내용 확인
aws sqs receive-message --queue-url $QUEUE_URL --region ap-northeast-2
```

---

## 장애 대응

### Slack 커맨드 응답 없음

1. **서명 검증 실패 확인**
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/algo-daily-bot-slack-events \
  --filter-pattern "서명" \
  --region ap-northeast-2
```
→ SSM의 Signing Secret과 Slack 앱 설정값이 일치하는지 확인

2. **SlackEventsFunction 오류 확인**
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/algo-daily-bot-slack-events \
  --filter-pattern "ERROR" \
  --region ap-northeast-2
```

### AI 리뷰가 오지 않음 (커맨드 접수 후)

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/algo-daily-bot-worker \
  --filter-pattern "ERROR" \
  --region ap-northeast-2
```

주요 원인:
- AI API 키 만료 → `npm run setup-ai`로 재설정
- SSM 파라미터 미등록 → SSM 확인
- DLQ에 메시지 쌓임 → DLQ 내용 확인

### 일일 추천이 오지 않음

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/algo-daily-bot-daily-recommend \
  --start-time $(date -d '1 day ago' +%s)000 \
  --filter-pattern "ERROR 소진" \
  --region ap-northeast-2
```

주요 원인:
- 채널 ID 오류 → Lambda 환경변수 확인
- 봇이 채널에 없음 → `/invite @algo-daily-bot`
- 추천 후보 소진 → DynamoDB `PROBLEM#*` 기록 누적 (정상 동작)

### SSM 파라미터 확인/수정

```bash
# 현재 값 확인
aws ssm get-parameter --name /algo-daily-bot/slack-bot-token \
  --with-decryption --query Parameter.Value --output text --region ap-northeast-2

# 값 업데이트
aws ssm put-parameter --name /algo-daily-bot/slack-bot-token \
  --type SecureString --value "xoxb-NEW-TOKEN" --overwrite --region ap-northeast-2
```

---

## AI 제공자 변경

Lambda 재배포 없이 즉시 전환됩니다.

```bash
TABLE_NAME=AlgoDailyBotTable \
  npm run setup-ai -- --provider claude --model claude-haiku-4-5 --api-key sk-ant-...
```

---

## 리소스 삭제

```bash
# CloudFormation 스택 삭제 (Lambda, API Gateway, EventBridge, SQS 포함)
aws cloudformation delete-stack --stack-name algo-daily-bot --region ap-northeast-2

# DynamoDB 별도 삭제
aws dynamodb delete-table --table-name AlgoDailyBotTable --region ap-northeast-2

# SSM 파라미터 별도 삭제
aws ssm delete-parameter --name /algo-daily-bot/slack-bot-token --region ap-northeast-2
aws ssm delete-parameter --name /algo-daily-bot/slack-signing-secret --region ap-northeast-2
aws ssm delete-parameter --name /algo-daily-bot/ai-api-key --region ap-northeast-2
```
