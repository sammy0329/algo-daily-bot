## 📋 변경사항 요약

### 무엇을 변경했나?

- (변경 내용 구체적으로)

### 왜 변경했나?

- (변경 이유, 배경)

### 어떻게 변경했나?

- (기술적 접근 방식)

---

### API 변경 시 테스트 결과

```bash
# 테스트 실행 결과
npm run test:coverage
# Coverage: 85%+
# Tests passed: xx/xx
```

---

## ✅ 체크리스트

### 코드 품질

- [ ] ESLint/Prettier 통과 (`npm run lint`)
- [ ] TypeScript 타입 작성 완료 (any 사용 금지)
- [ ] 미사용 코드, console.log 제거

### 테스트

- [ ] 유닛 테스트 추가/수정
- [ ] 테스트 커버리지 80% 이상 (`npm run test:coverage`)
- [ ] 핵심 기능 로컬 확인

### 보안

- [ ] API 키, 시크릿 하드코딩 없음
- [ ] 입력값 검증 추가
- [ ] SSM 시크릿 런타임 조회 방식 유지

### 문서

- [ ] CLAUDE.md 업데이트 (해당 시)
- [ ] README.md 업데이트 (해당 시)
