# 시스템 아키텍처 개요

## 전체 구조

```mermaid
graph TB
    User["Slack 사용자"]
    SlackWS["Slack Workspace"]
    APIGW["API Gateway<br/>(HTTP API)"]
    SEF["SlackEventsFunction<br/>서명 검증 · 멱등성 · 요청제한<br/>확인 메시지 게시 · 비동기 호출<br/>즉시 HTTP 200 반환"]
    WF["WorkerFunction<br/>AI API 호출<br/>스레드에 결과 게시<br/>(최대 120초)"]
    DRF["DailyRecommendFunction<br/>매일 09:00 KST<br/>문제 추천"]
    EB["EventBridge<br/>cron(0 9 * * ? *)"]
    DDB["DynamoDB<br/>단일 테이블"]
    SSM["SSM Parameter Store<br/>Slack 토큰 / AI API 키"]
    DLQ["SQS Dead Letter Queue<br/>(14일 보관)"]
    AI["AI API<br/>GPT / Claude / Gemini"]
    SOLVEDAC["solved.ac API"]

    User -->|"/review, /blog"| SlackWS
    SlackWS -->|"HTTPS POST"| APIGW
    APIGW --> SEF
    SEF -->|"Lambda.invoke(Event)"| WF
    SEF -->|"멱등성, 요청제한"| DDB
    DDB -->|"결과 반환"| SEF
    WF -->|"AI 결과"| SlackWS
    WF -->|"설정 조회"| DDB
    WF -->|"API 키"| SSM
    WF -->|"Slack 게시 실패 시"| DLQ
    WF --> AI
    AI --> WF
    EB -->|"Schedule Event"| DRF
    DRF -->|"추천 기록, 캐시"| DDB
    DRF --> SOLVEDAC
    SOLVEDAC --> DRF
    DRF -->|"문제 추천"| SlackWS
    SEF -->|"Slack 토큰"| SSM
```

## Lambda 함수 구성

| 함수명 | 역할 | 트리거 | 타임아웃 | 메모리 |
|--------|------|--------|--------|--------|
| `SlackEventsFunction` | 커맨드 수신, 검증, Worker 비동기 호출 | API Gateway (HTTP) | 10초 | 256MB |
| `WorkerFunction` | AI API 호출, 결과 스레드 게시 | Lambda.invoke (비동기) | 120초 | 512MB |
| `DailyRecommendFunction` | 매일 백준 문제 추천 | EventBridge Cron | 60초 | 256MB |

## 공유 인프라

| 서비스 | 용도 | 비고 |
|--------|------|------|
| DynamoDB | 단일 테이블 (멱등성, 요청 제한, 풀이 캐시, AI 설정) | PAY_PER_REQUEST |
| SQS | Worker Dead Letter Queue | MaximumRetryAttempts: 0 |
| SSM Parameter Store | Slack 토큰, AI API 키 (SecureString) | 런타임 조회 |
| CloudWatch | 로그, DLQ 알람 | DLQ 메시지 >= 1 시 알람 |

## DynamoDB 단일 테이블 키 구조

```mermaid
classDiagram
    class IDEMPOTENCY {
        PK: IDEMPOTENCY_eventId
        SK: EVENT
        processedAt: string
        ttl: number (24시간 후 만료)
    }
    class RATELIMIT {
        PK: USER_userId
        SK: RATELIMIT_cmd_date
        count: number
        ttl: number (KST 자정 만료)
    }
    class PROBLEM {
        PK: PROBLEM_id
        SK: RECOMMENDED
        recommendedAt: string
        title: string
    }
    class HISTORY {
        PK: HISTORY
        SK: DATE_YYYY-MM-DD
        problemId: number
        title: string
    }
    class SOLVED_CACHE {
        PK: SOLVED_handle
        SK: PROBLEM_id
        solvedAt: string
    }
    class USER_PROFILE {
        PK: USER_userId
        SK: PROFILE
        handle: string
        registeredAt: string
        GSI2PK: PROFILE
        GSI2SK: USER_userId
    }
    class AI_CONFIG {
        PK: CONFIG
        SK: AI_PROVIDER
        provider: gpt or claude or gemini
        model: string
        apiKeyParam: SSM 경로
    }
```

## 아키텍처 핵심 결정 사항

- **Slack 3초 제한 대응**: SlackEventsFunction이 즉시 200을 반환하고, WorkerFunction을 비동기 호출 → [ADR-0003](../adr/0003-async-lambda-pattern-for-slack.md)
- **단일 테이블 설계**: DynamoDB 비용 최소화 → [ADR-0002](../adr/0002-dynamodb-single-table-design.md)
- **서버리스 선택**: 사용량 기반 과금, 운영 부담 없음 → [ADR-0001](../adr/0001-use-lambda-over-ec2.md)
- **AI 제공자 추상화**: GPT/Claude/Gemini 런타임 전환 가능 → [ADR-0004](../adr/0004-claude-api-over-gpt.md)
