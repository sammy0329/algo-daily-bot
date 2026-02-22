/**
 * 초기 설정 스크립트
 * 사용법: ts-node scripts/sync.ts --slack-user-id U04ABC123 --handle myhandle
 *
 * 실행 전 환경변수 설정 필요:
 *   TABLE_NAME=AlgoDailyBotTable
 *   AWS_REGION=ap-northeast-2 (또는 AWS 프로필 설정)
 */

import { upsertProfile, upsertSolvedProblems } from '../src/shared/dynamodb';
import { getAllSolvedProblems } from '../src/shared/solvedac';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slackUserId = args['slack-user-id'];
  const handle = args['handle'];

  if (!slackUserId || !handle) {
    console.error('사용법: ts-node scripts/sync.ts --slack-user-id <id> --handle <handle>');
    process.exit(1);
  }

  // BOJ 핸들 형식 검증: 영문자, 숫자, 언더스코어, 1~20자
  if (!/^[a-zA-Z0-9_]{1,20}$/.test(handle)) {
    console.error('오류: BOJ 핸들은 영문자, 숫자, 언더스코어(_)만 사용 가능하며 1~20자여야 합니다.');
    process.exit(1);
  }

  if (!process.env.TABLE_NAME) {
    console.error('TABLE_NAME 환경변수를 설정해주세요.');
    process.exit(1);
  }

  console.log(`\n📋 초기 설정 시작`);
  console.log(`  Slack User ID: ${slackUserId}`);
  console.log(`  BOJ 핸들: ${handle}\n`);

  // 1. 사용자 프로필 저장
  console.log('1️⃣  사용자 프로필 저장 중...');
  await upsertProfile(slackUserId, handle);
  console.log('   ✅ 프로필 저장 완료\n');

  // 2. 전체 풀이 목록 조회 및 저장
  console.log('2️⃣  solved.ac에서 전체 풀이 목록 조회 중...');
  const problems = await getAllSolvedProblems(handle);
  console.log(`   📦 총 ${problems.length}개 문제 조회 완료\n`);

  if (problems.length > 0) {
    console.log('3️⃣  DynamoDB에 풀이 캐시 저장 중...');
    await upsertSolvedProblems(
      handle,
      problems.map((p) => ({ id: p.problemId })),
    );
    console.log(`   ✅ ${problems.length}개 문제 저장 완료\n`);
  }

  console.log('🎉 초기 설정 완료!\n');
  console.log('다음 단계:');
  console.log('  ts-node scripts/setup-ai.ts --provider gpt --model gpt-4o-mini --api-key sk-...\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      result[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return result;
}

main().catch((err) => {
  console.error('오류 발생:', err);
  process.exit(1);
});
