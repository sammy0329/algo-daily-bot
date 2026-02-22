# 초기 동기화 가이드

`scripts/sync.ts`는 두 가지 작업을 한 번에 수행합니다:
1. **사용자 프로필 등록**: Slack User ID와 BOJ 핸들을 DynamoDB에 저장
2. **풀이 캐시 초기화**: solved.ac에서 전체 풀이 목록을 가져와 DynamoDB에 저장

이 데이터는 `DailyRecommendFunction`이 이미 푼 문제를 제외하고 추천하는 데 사용됩니다.

---

## 실행 방법

### 사전 조건

1. SAM 배포 완료 (DynamoDB 테이블 생성 후)
2. AWS 자격증명 설정 (`aws configure` 또는 환경변수)
3. ts-node 설치 (`npm install -g ts-node typescript` 또는 `npm install`)

### 명령어

```bash
TABLE_NAME=AlgoDailyBotTable \
  ts-node scripts/sync.ts \
  --slack-user-id U04XXXXXXXXX \
  --handle your_boj_handle
```

### 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `--slack-user-id` | Slack 사용자 ID | `U04ABC123` |
| `--handle` | BOJ(백준) 핸들 | `myhandle123` |

### Slack 사용자 ID 확인 방법

1. Slack 앱에서 본인 프로필 클릭
2. "멤버 ID 복사" 선택
3. `U04...` 형식의 ID 확인

### BOJ 핸들 형식

- 영문자, 숫자, 언더스코어(`_`)만 사용 가능
- 1~20자 이내
- 예: `algorithm_master`, `user123`

---

## 실행 결과 예시

```
📋 초기 설정 시작
  Slack User ID: U04ABC123
  BOJ 핸들: myhandle

1️⃣  사용자 프로필 저장 중...
   ✅ 프로필 저장 완료

2️⃣  solved.ac에서 전체 풀이 목록 조회 중...
   📦 총 342개 문제 조회 완료

3️⃣  DynamoDB에 풀이 캐시 저장 중...
   ✅ 342개 문제 저장 완료

🎉 초기 설정 완료!

다음 단계:
  ts-node scripts/setup-ai.ts --provider gpt --model gpt-4o-mini --api-key sk-...
```

---

## 문제 해결

### `TABLE_NAME 환경변수를 설정해주세요` 오류

```bash
# TABLE_NAME을 명시적으로 설정
export TABLE_NAME=AlgoDailyBotTable
ts-node scripts/sync.ts --slack-user-id ... --handle ...
```

### `BOJ 핸들 형식이 올바르지 않습니다` 오류

- 한글, 특수문자가 포함되었는지 확인
- BOJ 프로필 URL에서 핸들 확인: `https://www.acmicpc.net/user/<핸들>`

### solved.ac API 응답 없음

- solved.ac 서비스 상태 확인
- 잠시 후 재시도

### AWS 권한 오류

```bash
# DynamoDB PutItem, BatchWriteItem 권한 필요
aws sts get-caller-identity  # 현재 자격증명 확인
```

---

## 재실행 (업데이트)

초기화 이후 풀이가 많이 쌓였을 경우 재실행할 수 있습니다. 기존 데이터는 덮어씁니다(upsert).

일반적으로는 `DailyRecommendFunction`이 매일 자동으로 최근 풀이(일일 델타)를 동기화하므로 재실행이 필요하지 않습니다.
