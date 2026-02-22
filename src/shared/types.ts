// slackEvents.ts와 worker.ts가 공유하는 타입 정의

export interface WorkerPayload {
  command: 'review' | 'blog';
  channel: string;
  threadTs: string;
  userId: string;
  payload: Record<string, unknown>;
}

/** solved.ac에서 조회한 문제 맥락 */
export interface ProblemContext {
  problemId: number;
  title: string;
  tier: string;
  tags: string[];
  url: string;
}
