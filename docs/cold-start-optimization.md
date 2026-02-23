# Lambda 콜드 스타트 최적화

> **목적**: algo-daily-bot의 Lambda 함수 콜드 스타트 및 메모리 낭비를 측정하고, 개선 전후를 비교한다.

---

## 측정 환경

| 항목 | 값 |
|------|-----|
| **측정 일시** | 2026-02-23 |
| **런타임** | Node.js 20.x (ARM64) |
| **리전** | ap-northeast-2 (서울) |
| **측정 방법** | `aws lambda invoke --log-type Tail` → CloudWatch REPORT 로그 파싱 |
| **빌드 도구** | AWS SAM + esbuild |

> CloudWatch REPORT 로그의 `Init Duration` 필드가 있는 호출 = 콜드 스타트, 없는 호출 = 웜 스타트

---

## Before — 베이스라인 (v1.1)

### 콜드 스타트 측정값

| 함수 | Init Duration | 실행 시간 | 총 체감 시간 | 빌링 시간 |
|------|-------------:|--------:|------------:|---------:|
| `WorkerFunction` (`/review`) | **471ms** | 23,202ms | **23,673ms** | 23,674ms |
| `WorkerFunction` (`/blog`) | **451ms** | 10,079ms | **10,530ms** | 10,530ms |
| `SlackEventsFunction` | **416ms** | 511ms | **927ms** | 928ms |
| `DailyRecommendFunction` | **399ms** | 8,454ms | **8,853ms** | 8,853ms |
| `DailySyncFunction` | **331ms** | 4,111ms | **4,442ms** | 4,442ms |

> WorkerFunction Init Duration은 `/review`·`/blog` 모두 450~471ms 수준으로 일관됨. 실행 시간은 AI 프롬프트 길이에 따라 커맨드별로 차이 발생.

### 웜 스타트 측정값

| 함수 | 실행 시간 | 콜드 대비 감소 |
|------|--------:|-------------:|
| `SlackEventsFunction` (2차 호출) | **2ms** | -99.6% |

> SlackEventsFunction의 콜드(927ms) vs 웜(2ms) 차이가 **464배**로 가장 극단적이다.
> 사용자가 `/review`를 뜸하게 입력하면 매번 콜드 스타트가 발생한다.

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
| `WorkerFunction` | 512MB | **256MB** | 실사용 200MB. AI 응답 처리 감안 여유 확보 |

> ⚠️ Lambda는 메모리와 CPU가 비례 관계. 너무 낮추면 실행 시간이 길어져 빌링이 늘어날 수 있음.
> 조정 후 실행 시간 재측정 필수.

---

## After — 개선 결과 (v1.2)

> 최적화 적용 후 측정값으로 업데이트 예정

### 콜드 스타트 (Init Duration)

| 함수 | Before | After | 감소 |
|------|-------:|------:|-----:|
| `WorkerFunction` | ~461ms | - | - |
| `SlackEventsFunction` | 416ms | - | - |
| `DailyRecommendFunction` | 399ms | - | - |
| `DailySyncFunction` | 331ms | - | - |

### 메모리 할당 → 변경

| 함수 | Before | After |
|------|-------:|------:|
| `WorkerFunction` | 512MB | 256MB |
| `SlackEventsFunction` | 256MB | 128MB |
| `DailyRecommendFunction` | 256MB | 256MB |
| `DailySyncFunction` | 256MB | 128MB |

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
| `sam build` | 1.46초 | - |

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
