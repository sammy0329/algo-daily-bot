import { ScheduledEvent } from 'aws-lambda';
import {
  getAllProfiles,
  isProblemRecommended,
  isSolvedProblem,
  recordRecommendation,
  upsertSolvedProblems,
} from '../shared/dynamodb';
import { searchProblems, getLatestSolvedPage, getTierName } from '../shared/solvedac';
import { postMessage, postProblemRecommendation } from '../shared/slack';
import { logger } from '../shared/logger';

const LEVEL_MIN = parseInt(process.env.PROBLEM_LEVEL_MIN ?? '11', 10); // Gold V
const LEVEL_MAX = parseInt(process.env.PROBLEM_LEVEL_MAX ?? '15', 10); // Gold I
const MAX_RETRIES = 5;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return value;
}

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  if ((_event as unknown as { source?: string }).source === 'prewarm') return;

  try {
    await run();
  } catch (err) {
    logger.error('DailyRecommendFunction 예상치 못한 오류', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const channel = requireEnv('SLACK_CHANNEL_ID');
    await postMessage({
      channel,
      text: '오늘의 문제 추천 중 오류가 발생했습니다. 관리자에게 문의해주세요.',
    }).catch(() => {});
  }
};

async function run(): Promise<void> {
  // 1. 등록된 프로필에서 핸들 조회
  const profiles = await getAllProfiles();
  if (profiles.length === 0) {
    logger.warn('등록된 사용자 프로필이 없습니다. scripts/sync.ts를 실행해주세요.');
    return;
  }
  const handle = profiles[0].handle; // v1: 단일 사용자

  const channel = requireEnv('SLACK_CHANNEL_ID');
  let candidate = null;
  let lastPage = 1;

  // 2~4. 후보 탐색 (최대 5회 페이지 시도)
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { items } = await searchProblems({
      levelMin: LEVEL_MIN,
      levelMax: LEVEL_MAX,
      page: lastPage,
    });

    if (items.length === 0) {
      logger.warn('solved.ac 검색 결과 없음', { levelMin: LEVEL_MIN, levelMax: LEVEL_MAX, page: lastPage });
      break;
    }

    // 5. 각 후보에 대해 중복·풀이 여부 병렬 확인
    const checks = await Promise.all(
      items.map(async (problem) => {
        const [recommended, solved] = await Promise.all([
          isProblemRecommended(problem.problemId),
          isSolvedProblem(handle, problem.problemId),
        ]);
        return { problem, excluded: recommended || solved };
      }),
    );

    const fresh = checks.filter((c) => !c.excluded).map((c) => c.problem);

    if (fresh.length > 0) {
      candidate = fresh[Math.floor(Math.random() * fresh.length)];
      break;
    }

    logger.info(`시도 ${attempt}/${MAX_RETRIES}: 신규 문제 없음, 다음 페이지 탐색`, { page: lastPage });
    lastPage++;
  }

  // 4-소진: 5회 재시도 후에도 신규 문제 없음
  if (!candidate) {
    logger.error('DailyRecommendFunction 후보 소진', {
      event: 'exhaustion',
      retriesAttempted: MAX_RETRIES,
      date: new Date().toISOString(),
    });
    await postMessage({
      channel,
      text: '오늘의 문제를 가져오는 데 실패했습니다. /review 또는 /blog는 정상 이용 가능합니다.',
    });
    return; // DynamoDB에 아무것도 쓰지 않고 종료
  }

  // 6. Slack에 문제 추천 게시
  await postProblemRecommendation({
    channel,
    problemId: candidate.problemId,
    title: candidate.titleKo,
    tier: getTierName(candidate.level),
    url: candidate.url,
    tags: candidate.tags,
  });

  // 7. DynamoDB에 추천 기록
  await recordRecommendation(candidate.problemId, {
    title: candidate.titleKo,
    tier: getTierName(candidate.level),
    url: candidate.url,
  });

  logger.info('일일 문제 추천 완료', {
    problemId: candidate.problemId,
    title: candidate.titleKo,
    tier: getTierName(candidate.level),
  });

  // 8. 일일 델타 동기화 (실패해도 추천에 영향 없음)
  try {
    const latest = await getLatestSolvedPage(handle);
    if (latest.length > 0) {
      await upsertSolvedProblems(
        handle,
        latest.map((p) => ({ id: p.problemId })),
      );
      logger.info('일일 델타 동기화 완료', { handle, count: latest.length });
    }
  } catch (err) {
    logger.warn('일일 델타 동기화 실패 (추천에는 영향 없음)', {
      handle,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
