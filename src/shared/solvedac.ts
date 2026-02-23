import { logger } from './logger';
import { ProblemContext } from './types';

const BASE_URL = 'https://solved.ac/api/v3';

export interface SolvedProblem {
  problemId: number;
  titleKo: string;
  level: number;     // 0=Unrated, 1~5=Bronze, 6~10=Silver, 11~15=Gold, 16~20=Platinum, 21~25=Diamond, 26~30=Ruby
  tags: string[];
  url: string;
}

export interface SolvedacSearchResult {
  count: number;
  items: SolvedProblem[];
}

const TIER_NAMES: Record<number, string> = {
  0: 'Unrated',
  1: 'Bronze V', 2: 'Bronze IV', 3: 'Bronze III', 4: 'Bronze II', 5: 'Bronze I',
  6: 'Silver V', 7: 'Silver IV', 8: 'Silver III', 9: 'Silver II', 10: 'Silver I',
  11: 'Gold V', 12: 'Gold IV', 13: 'Gold III', 14: 'Gold II', 15: 'Gold I',
  16: 'Platinum V', 17: 'Platinum IV', 18: 'Platinum III', 19: 'Platinum II', 20: 'Platinum I',
  21: 'Diamond V', 22: 'Diamond IV', 23: 'Diamond III', 24: 'Diamond II', 25: 'Diamond I',
  26: 'Ruby V', 27: 'Ruby IV', 28: 'Ruby III', 29: 'Ruby II', 30: 'Ruby I',
};

export function getTierName(level: number): string {
  return TIER_NAMES[level] ?? 'Unrated';
}

/** solved.ac API를 호출한다. 실패 시 지수 백오프로 재시도한다. */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<unknown> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`solved.ac API 오류: ${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 500;
      logger.warn(`solved.ac API 재시도 (${attempt}/${maxRetries})`, { url, delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * 난이도 범위로 문제를 검색한다.
 * levelMin, levelMax: solved.ac 티어 레벨 (예: 11=Gold V, 15=Gold I)
 */
export async function searchProblems(params: {
  levelMin: number;
  levelMax: number;
  page?: number;
}): Promise<SolvedacSearchResult> {
  const { levelMin, levelMax, page = 1 } = params;
  const query = encodeURIComponent(`*${levelMin}..${levelMax}`);
  const url = `${BASE_URL}/search/problem?query=${query}&page=${page}&sort=random`;

  const data = (await fetchWithRetry(url)) as {
    count: number;
    items: Array<{
      problemId: number;
      titleKo: string;
      level: number;
      tags: Array<{ key: string }>;
    }>;
  };

  return {
    count: data.count,
    items: data.items.map((item) => ({
      problemId: item.problemId,
      titleKo: item.titleKo,
      level: item.level,
      tags: item.tags.map((t) => t.key),
      url: `https://boj.kr/${item.problemId}`,
    })),
  };
}

/**
 * 사용자가 푼 문제 목록을 페이지 단위로 조회한다.
 * sort 미지정 시 API 기본 정렬(최신 풀이순)이 적용된다.
 */
export async function getSolvedProblems(params: {
  handle: string;
  page?: number;
  sort?: 'id' | 'level' | 'title' | 'solved' | 'average-try';
}): Promise<SolvedacSearchResult> {
  const { handle, page = 1, sort } = params;
  const query = encodeURIComponent(`@${handle}`);
  const sortParam = sort ? `&sort=${sort}` : '';
  const url = `${BASE_URL}/search/problem?query=${query}&page=${page}${sortParam}`;

  const data = (await fetchWithRetry(url)) as {
    count: number;
    items: Array<{
      problemId: number;
      titleKo: string;
      level: number;
      tags: Array<{ key: string }>;
      acceptedUserCount?: number;
    }>;
  };

  return {
    count: data.count,
    items: data.items.map((item) => ({
      problemId: item.problemId,
      titleKo: item.titleKo,
      level: item.level,
      tags: item.tags.map((t) => t.key),
      url: `https://boj.kr/${item.problemId}`,
    })),
  };
}

/** 최근 풀이 첫 페이지만 조회한다 (일일 델타 동기화용). sort 미지정 → API 기본 최신순 */
export async function getLatestSolvedPage(handle: string): Promise<SolvedProblem[]> {
  const result = await getSolvedProblems({ handle, page: 1 });
  return result.items;
}

/**
 * 단일 문제 정보를 조회한다. 실패 시 null 반환 (graceful degradation).
 * worker.ts에서 /review 명령어 처리 시 문제 맥락 주입에 사용된다.
 */
export async function getProblemById(problemId: number): Promise<ProblemContext | null> {
  try {
    const url = `${BASE_URL}/problem/show?problemId=${problemId}`;
    const data = (await fetchWithRetry(url, 2)) as {
      problemId: number;
      titleKo: string;
      level: number;
      tags: Array<{ key: string }>;
    };

    return {
      problemId: data.problemId,
      title: data.titleKo,
      tier: getTierName(data.level),
      tags: data.tags.map((t) => t.key),
      url: `https://boj.kr/${data.problemId}`,
    };
  } catch (err) {
    logger.warn('getProblemById 실패 (무시)', { problemId, err });
    return null;
  }
}

/** 모든 풀이 문제를 페이지네이션으로 전체 수집한다 (초기 동기화용). */
export async function getAllSolvedProblems(handle: string): Promise<SolvedProblem[]> {
  const allProblems: SolvedProblem[] = [];
  let page = 1;

  while (true) {
    const result = await getSolvedProblems({ handle, page, sort: 'id' }); // 페이지네이션 안정성을 위해 sort=id 고정
    allProblems.push(...result.items);

    const totalPages = Math.ceil(result.count / 50);
    logger.info(`solved.ac 풀이 목록 조회 중`, {
      handle,
      page,
      totalPages,
      collected: allProblems.length,
      total: result.count,
    });

    if (page >= totalPages || result.items.length === 0) break;
    page++;

    // API 레이트 리밋 방어
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return allProblems;
}
