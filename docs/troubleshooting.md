# 트러블슈팅 가이드

## SAM Transform 배포 권한 오류

### 증상

`sam deploy` 또는 `aws cloudformation create-stack` 실행 시 아래 오류가 발생하며 스택이 ROLLBACK_COMPLETE 상태로 전환됩니다:

```
User: arn:aws:iam::XXXXXXXXXXXX:user/algo-bot-user is not authorized to perform:
cloudformation:CreateChangeSet on resource:
arn:aws:cloudformation:ap-northeast-2:aws:transform/Serverless-2021-10-31.
Rollback requested by user.
```

### 원인

AWS SAM 템플릿의 `Transform: AWS::Serverless-2021-10-31` 디렉티브를 CloudFormation이 처리할 때, `cloudformation:CreateChangeSet` 권한을 `arn:aws:cloudformation:REGION:aws:transform/Serverless-2021-10-31` 리소스에 대해 검사합니다.

이 리소스 ARN은 계정 ID 자리에 `aws`가 들어가는 AWS 소유 리소스입니다. AWS IAM 정책의 `Resource: "*"` 와일드카드는 고객 계정 내 리소스만 커버하므로, **`AdministratorAccess`를 포함한 어떤 IAM 정책으로도 이 권한을 부여할 수 없습니다.**

IAM 정책 시뮬레이터(`simulate-principal-policy`)로 확인해도 `MatchedStatements: []`, `EvalDecision: implicitDeny`가 반환됩니다.

**시도했지만 효과 없는 조치들:**

| 조치 | 결과 |
|------|------|
| `CAPABILITY_AUTO_EXPAND` 추가 | 효과 없음 |
| 명시적 인라인 정책 추가 (`arn:aws:cloudformation:*:aws:transform/*`) | 효과 없음 |
| CloudFormation 서비스 역할 사용 (`--role-arn`) | 효과 없음 (호출자 IAM 체크는 여전히 적용) |
| AWS Organizations 확인 | 미가입 확인됨 (SCPs 없음) |
| 권한 경계 확인 | 없음 확인됨 |

### 해결책: 로컬 SAM 변환 후 표준 CloudFormation 배포

SAM 변환을 CloudFormation 서비스에 맡기는 대신, `aws-sam-translator` Python 라이브러리로 **로컬에서 변환**한 뒤 표준 CloudFormation 템플릿으로 배포합니다.

#### 1단계: 의존성 설치

```bash
# Python 라이브러리
pip3 install aws-sam-translator pyyaml

# esbuild (TypeScript 번들링용)
brew install esbuild
```

#### 2단계: 빌드 및 패키징

```bash
# TypeScript 빌드
sam build

# Lambda 코드를 S3에 업로드하고 packaged-template.yaml 생성
# (S3 버킷은 --resolve-s3로 자동 생성/재사용)
sam package \
  --resolve-s3 \
  --s3-prefix algo-daily-bot \
  --output-template-file .aws-sam/packaged-template.yaml \
  --region ap-northeast-2
```

#### 3단계: 로컬 SAM 변환

```bash
python3 -c "
import json, sys
from samtranslator.yaml_helper import yaml_parse
from samtranslator.public.translator import ManagedPolicyLoader
from samtranslator.translator.transform import transform
import boto3

with open('.aws-sam/packaged-template.yaml') as f:
    sam_template = yaml_parse(f)

iam_client = boto3.client('iam', region_name='ap-northeast-2')
loader = ManagedPolicyLoader(iam_client)
cfn_template = transform(
    sam_template,
    {'AccountId': '$(aws sts get-caller-identity --query Account --output text)',
     'Region': 'ap-northeast-2'},
    loader
)
with open('.aws-sam/cfn-transformed.json', 'w') as f:
    json.dump(cfn_template, f, indent=2)
print('변환 완료')
"
```

> **주의**: `AccountId` 값을 본인 계정 ID로 교체하세요. `aws sts get-caller-identity --query Account --output text` 로 확인할 수 있습니다.

#### 4단계: 배포

**최초 배포:**

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

# 완료 대기
aws cloudformation wait stack-create-complete \
  --stack-name algo-daily-bot \
  --region ap-northeast-2
```

**재배포 (코드 변경 후):**

```bash
aws cloudformation update-stack \
  --stack-name algo-daily-bot \
  --template-body file://.aws-sam/cfn-transformed.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=SlackChannelId,UsePreviousValue=true \
    ParameterKey=ReviewDailyLimit,UsePreviousValue=true \
    ParameterKey=BlogDailyLimit,UsePreviousValue=true \
  --region ap-northeast-2

# 완료 대기
aws cloudformation wait stack-update-complete \
  --stack-name algo-daily-bot \
  --region ap-northeast-2
```

#### 5단계: API URL 확인

```bash
aws cloudformation describe-stacks \
  --stack-name algo-daily-bot \
  --region ap-northeast-2 \
  --query "Stacks[0].Outputs[?OutputKey=='SlackEventsApiUrl'].OutputValue" \
  --output text
```

---

## 기타 알려진 이슈

### `sam build` 중 `package.json file not found` 경고

```
package.json file not found. Bundling source without installing dependencies.
```

**정상입니다.** esbuild가 각 핸들러 디렉터리 내 `package.json`을 찾지 못해도, 루트 `node_modules`에서 의존성을 자동으로 번들링합니다.

---

### `samconfig.toml` 버전 오류

```
SamConfigVersionException: ...
```

`samconfig.toml` 파일 첫 줄에 `version = 0.1`이 없으면 발생합니다. 파일 최상단에 추가하세요:

```toml
version = 0.1
```

---

### Lambda 함수명 확인

SAM → 표준 CloudFormation 변환 후 함수명이 다를 수 있습니다. 실제 함수명 확인:

```bash
aws lambda list-functions \
  --query "Functions[?starts_with(FunctionName, 'algo-daily-bot')].[FunctionName]" \
  --output text \
  --region ap-northeast-2
```
