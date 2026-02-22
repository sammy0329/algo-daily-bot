import { ScheduledEvent } from 'aws-lambda';
import { getAllProfiles, upsertSolvedProblems } from '../shared/dynamodb';
import { getLatestSolvedPage, SolvedProblem } from '../shared/solvedac';
import { logger } from '../shared/logger';

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  const profiles = await getAllProfiles();
  if (profiles.length === 0) {
    logger.warn('등록된 사용자 없음, 동기화 건너뜀');
    return;
  }

  logger.info('일일 solved.ac 동기화 시작', { userCount: profiles.length });

  const results = await Promise.allSettled(
    profiles.map((profile) => syncUserProblems(profile.handle)),
  );

  const summary = results.map((r, i) => ({
    handle: profiles[i].handle,
    ...(r.status === 'fulfilled'
      ? { count: r.value }
      : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) }),
  }));

  logger.info('일일 solved.ac 동기화 완료', { summary });
};

/** 단일 사용자의 최근 풀이를 동기화한다. 테스트 가능하도록 export. */
export async function syncUserProblems(
  handle: string,
  getLatest: (handle: string) => Promise<SolvedProblem[]> = getLatestSolvedPage,
  upsert: (
    handle: string,
    problems: Array<{ id: number; solvedAt?: string }>,
  ) => Promise<void> = upsertSolvedProblems,
): Promise<number> {
  const latest = await getLatest(handle);
  if (latest.length === 0) return 0;

  await upsert(
    handle,
    latest.map((p) => ({ id: p.problemId })),
  );
  logger.info('사용자 solved.ac 동기화 완료', { handle, count: latest.length });
  return latest.length;
}
