# ADR-0001: EC2 대신 AWS Lambda 선택

- **날짜**: 2026-02-22
- **상태**: 승인됨

## 맥락

슬랙봇의 백엔드 실행 환경을 선택해야 했습니다. 주요 고려 대상은 EC2(상시 실행 서버)와 AWS Lambda(서버리스)였습니다.

이 봇의 특성:
- 트래픽이 매우 간헐적 (Slack 커맨드 사용 시에만 실행)
- 매일 09:00 KST 1회 정기 실행
- 개인 또는 소규모 팀 사용 목적

## 결정

**AWS Lambda (서버리스)** 를 선택합니다.

## 이유

### Lambda 선택 이유

| 항목 | Lambda | EC2 |
|------|--------|-----|
| 비용 | 실행 시간만 과금 (거의 무료 수준) | 24시간 인스턴스 비용 발생 |
| 운영 | 서버 관리 불필요 | OS 패치, 모니터링 필요 |
| 스케일링 | 자동 | 수동 또는 Auto Scaling 설정 |
| 콜드 스타트 | 있음 (초기 1~2초) | 없음 |

### 간헐적 사용 패턴에 최적

이 봇은 하루 수십 번 이하의 요청만 처리합니다. EC2 t3.micro 기준 월 ~$10인 반면, Lambda는 프리 티어 범위 내에서 거의 무료입니다.

### SAM을 통한 IaC

AWS SAM(Serverless Application Model)으로 Lambda, API Gateway, DynamoDB, SQS를 코드로 관리합니다. EC2 대비 인프라 복잡도가 크게 낮습니다.

## 트레이드오프

- **콜드 스타트**: Lambda는 비활성 상태에서 첫 호출 시 초기화 시간이 발생합니다. 이 봇은 Slack 3초 제한이 있지만, 비동기 패턴(SlackEventsFunction → WorkerFunction)으로 해결합니다. → [ADR-0003](0003-async-lambda-pattern-for-slack.md) 참조
- **상태 관리**: Lambda는 무상태(stateless)입니다. 모든 상태는 DynamoDB에 저장합니다.
- **실행 시간 제한**: 최대 15분 (WorkerFunction은 120초로 충분).
