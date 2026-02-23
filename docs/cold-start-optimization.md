# Lambda 콜드 스타트 최적화

> **목적**: algo-daily-bot의 Lambda 함수 콜드 스타트 및 메모리 낭비를 측정하고, 개선 전후를 비교한다.

---

## 측정 환경

| 항목 | 값 |
|------|-----|
| **측정 일시** | 2026-02-23 |
| **런타임** | Node.js 20.x (ARM64) |
| **리전** | ap-northeast-2 (서울) |
| **측정 방법** | 실제 Slack 커맨드 실행 → CloudWatch REPORT 로그 파싱 |
| **빌드 도구** | AWS SAM + esbuild |

> CloudWatch REPORT 로그의 `Init Duration` 필드가 있는 호출 = 콜드 스타트, 없는 호출 = 웜 스타트

---

## Before — 베이스라인 (v1.1)

### 콜드 스타트 Init Duration

| 함수 | Init Duration | 측정 방법 |
|------|-------------:|---------|
| `WorkerFunction` (`/review`) | **471ms** | 실제 Slack 커맨드 |
| `WorkerFunction` (`/blog`) | **451ms** | 실제 Slack 커맨드 |
| `SlackEventsFunction` | **416ms** | `aws lambda invoke` (직접 호출) |
| `DailyRecommendFunction` | **399ms** | `aws lambda invoke` (직접 호출) |
| `DailySyncFunction` | **331ms** | `aws lambda invoke` (직접 호출) |

> WorkerFunction의 실행 시간(Duration)은 AI 응답 길이에 따라 매번 달라지므로 비교 지표에서 제외.
> SlackEventsFunction의 Duration은 Before(직접 호출)와 After(실제 Slack 커맨드) 측정 방식이 달라 비교 불가 — Init Duration만 유효.

### 웜 스타트

| 함수 | Init Duration | 웜 스타트 실행 시간 |
|------|-------------:|------------------:|
| `SlackEventsFunction` | 416ms (콜드) | **2ms** (웜) |

> 콜드(416ms+) vs 웜(2ms) 차이가 **200배 이상**. 사용자가 `/review`·`/blog`를 뜸하게 입력하면 매번 콜드 스타트가 발생.
> 웜 스타트 2ms는 `aws lambda invoke` 빈 페이로드 측정값. 실제 Slack 커맨드는 서명 검증·DynamoDB 조회 포함으로 더 길다.

### 메모리 할당 vs 실사용

| 함수 | 할당 | 실사용 | 낭비율 |
|------|-----:|------:|------:|
| `WorkerFunction` (`/review`) | 512MB | 179MB | **65%** |
| `WorkerFunction` (`/blog`) | 512MB | 145MB | **72%** |
| `SlackEventsFunction` | 256MB | 124MB | **52%** |
| `DailySyncFunction` | 256MB | 138MB | **46%** |
| `DailyRecommendFunction` | 256MB | 164MB | **36%** |

### 번들 크기 (Minify: false)

| 함수 | JS 번들 | 디렉토리 전체 |
|------|--------:|-------------:|
| `WorkerFunction` | **3.2MB** | 9.2MB |
| `SlackEventsFunction` | **2.5MB** | 6.3MB |
| `DailyRecommendFunction` | **2.2MB** | 5.6MB |
| `DailySyncFunction` | **1.1MB** | 2.9MB |

### 빌드 시간

| 항목 | 측정값 |
|------|--------|
| `sam build` | **1.46초** |

---

## 개선 항목

### 1. esbuild Minify 활성화

**대상**: 전체 함수 (`template.yaml` 4곳)

**현재**
```yaml
BuildProperties:
  Minify: false
```

**변경**
```yaml
BuildProperties:
  Minify: true
```

**기대 효과**
- JS 번들 크기 약 70~75% 감소 (공백·변수명 압축)
- Lambda 패키지 업로드·압축 해제 시간 단축 → **콜드 스타트 Init Duration 감소**
- Sourcemap은 유지하여 CloudWatch 스택 트레이스 영향 없음

---

### 2. CloudWatch 로그 보존 기간 설정

**대상**: 전체 함수

**현재**: 로그 그룹 미설정 → AWS 기본값(무기한 보존)

**변경**: `AWS::Logs::LogGroup` 리소스 추가

```yaml
DailyRecommendLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: /aws/lambda/algo-daily-bot-daily-recommend
    RetentionInDays: 7

WorkerLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: /aws/lambda/algo-daily-bot-worker
    RetentionInDays: 14   # AI 오류 추적용 조금 더 보관
```

**기대 효과**
- CloudWatch Logs 스토리지 비용 무기한 누적 방지
- GB당 $0.03/월 절감 (장기 운영 시 의미 있음)

---

### 3. DailyRecommendFunction 예열 트리거

**대상**: `DailyRecommendFunction`

**현재**: 매일 09:00에 1회 실행 → 24시간 공백 → **항상 콜드 스타트 보장**

**변경**: 08:59에 예열 이벤트 추가

```yaml
PreWarmSchedule:
  Type: ScheduleV2
  Properties:
    ScheduleExpression: "cron(59 8 * * ? *)"
    ScheduleExpressionTimezone: Asia/Seoul
    Input: '{"source":"prewarm"}'
```

```typescript
// dailyRecommend.ts 핸들러 첫 줄에 추가
if ((event as any).source === 'prewarm') return;
```

**기대 효과**
- 09:00 실행 시 Init Duration 0ms (컨테이너 이미 준비됨)
- 추가 Lambda 실행 2회/일 → 월 60회 → **프리 티어(100만 회) 내 비용 $0**

---

### 4. Lambda 메모리 최적화

**근거**: 실사용량이 할당량의 40~50% 수준

| 함수 | 현재 | 변경 | 근거 |
|------|-----:|-----:|------|
| `SlackEventsFunction` | 256MB | **128MB** | 실사용 124MB. 서명 검증·DynamoDB 조회만 수행 |
| `DailySyncFunction` | 256MB | **128MB** | 실사용 138MB. API 1회 호출 + DynamoDB write |
| `DailyRecommendFunction` | 256MB | **256MB** | 실사용 164MB. 유지 (외부 API 다수 호출) |
| `WorkerFunction` | 512MB | **256MB** | 실사용 179MB. AI 응답 처리 감안 여유 확보 |

> ⚠️ Lambda는 메모리와 CPU가 비례 관계. 메모리를 낮추면 실행 시간이 늘어날 수 있음.
> 단, 요금은 `메모리(GB) × 실행시간(초)` 기준이므로 실행 시간이 늘어도 총 비용은 줄어드는 경우가 많음.

---

## After — 개선 결과 (v1.2)

### 콜드 스타트 Init Duration

| 함수 | Before | After | 감소 |
|------|-------:|------:|-----:|
| `WorkerFunction` (`/review`) | 471ms | **418ms** | **-11%** |
| `WorkerFunction` (`/blog`) | 451ms | **378ms** | **-16%** |
| `SlackEventsFunction` | 416ms | **414ms** | -0.5% |
| `DailyRecommendFunction` | 399ms | **408ms** | +2%* |
| `DailySyncFunction` | 331ms | **226ms** | **-32%** |

> *`DailyRecommendFunction` Init Duration은 측정 편차 수준. 예열 트리거 적용으로 실제 09:00 실행 시 Init Duration **0ms** 기대.
> `DailySyncFunction`은 번들 크기 감소(-52%) + 메모리 축소(-50%)의 복합 효과로 가장 큰 감소폭.

### 웜 스타트

| 함수 | 콜드 스타트 | 웜 스타트 | 차이 |
|------|----------:|--------:|-----:|
| `WorkerFunction` (`/blog`) | 378ms + 16,912ms | 12,216ms | - |
| `SlackEventsFunction` | 414ms + 2,727ms | 1,634ms | - |

> WorkerFunction 웜 스타트는 AI 응답 길이 편차로 인해 절대값 비교보다 Init Duration 제거 효과에 주목.

### 메모리 실사용

| 함수 | 할당 Before | 할당 After | 실사용 After | 여유 |
|------|----------:|----------:|------------:|-----:|
| `WorkerFunction` (`/review`) | 512MB | **256MB** | 173MB | 83MB |
| `WorkerFunction` (`/blog`) | 512MB | **256MB** | 157MB | 99MB |
| `SlackEventsFunction` | 256MB | **128MB** | 111MB | 17MB |
| `DailyRecommendFunction` | 256MB | **256MB** | 165MB | 91MB |
| `DailySyncFunction` | 256MB | **128MB** | 118MB | 10MB |

### 실행 시간 (DailySyncFunction)

메모리를 256MB → 128MB로 낮췄으나, 실행 시간도 함께 감소했다.
DailySyncFunction은 I/O 대기(solved.ac API, DynamoDB)가 지배적이라 CPU 감소 영향이 미미하다.

| | Before | After |
|--|--:|--:|
| 메모리 | 256MB | 128MB |
| Init Duration | 331ms | 226ms (-32%) |
| 실행 시간 (웜) | 4,111ms | ~2,941ms (-28%) |
| Max Memory Used | 138MB | 98~111MB |
| **GB-초** | **1.028** | **~0.376 (-63%)** |

### 번들 크기

| 함수 | Before | After | 감소율 |
|------|-------:|------:|------:|
| `WorkerFunction` | 3.2MB | **1.65MB** | **-48%** |
| `SlackEventsFunction` | 2.5MB | **1.25MB** | **-50%** |
| `DailyRecommendFunction` | 2.2MB | **1.09MB** | **-50%** |
| `DailySyncFunction` | 1.1MB | **0.53MB** | **-52%** |

### 빌드 시간

| 항목 | Before | After |
|------|-------:|------:|
| `sam build` | 1.46초 | **1.97초** |

> Minify 활성화로 빌드 시간이 소폭 증가(+0.51초)하지만 배포 시 1회성. 번들 크기 감소 효과가 훨씬 큼.

---

## 항목별 효과 요약

| 개선 항목 | 영향 지표 | 난이도 | 비용 변화 |
|----------|----------|:------:|-------:|
| esbuild Minify | 번들 크기 · 콜드 스타트 | ⭐ | $0 |
| CloudWatch 로그 보존 | 스토리지 비용 | ⭐ | 절감 |
| 예열 트리거 | DailyRecommend 콜드 스타트 | ⭐⭐ | $0 |
| 메모리 최적화 | 메모리 비용 · 콜드 스타트 | ⭐⭐⭐ | 절감 |

---

## References

- [serverless-openclaw cost-optimization.md](https://github.com/serithemage/serverless-openclaw/blob/main/docs/cost-optimization.md) — Fargate Spot, API Gateway vs ALB, SSM vs Secrets Manager 비용 비교
- [AWS Lambda – Lambda 함수 성능 최적화](https://docs.aws.amazon.com/ko_kr/lambda/latest/dg/best-practices.html)
- [AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning) — 메모리 최적값 탐색 도구
- [esbuild Minify 문서](https://esbuild.github.io/api/#minify)
- [CloudWatch Logs 요금](https://aws.amazon.com/ko/cloudwatch/pricing/)
