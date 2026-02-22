import { describe, it, expect, vi, afterEach } from 'vitest';
import { getProblemById } from '../shared/solvedac';

describe('getProblemById', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('정상 응답 → ProblemContext 반환', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          problemId: 1753,
          titleKo: '최단경로',
          level: 12, // Gold IV
          tags: [{ key: 'dijkstra' }, { key: 'graph' }],
        }),
      }),
    );

    const result = await getProblemById(1753);
    expect(result).not.toBeNull();
    expect(result!.problemId).toBe(1753);
    expect(result!.title).toBe('최단경로');
    expect(result!.tier).toBe('Gold IV');
    expect(result!.tags).toEqual(['dijkstra', 'graph']);
    expect(result!.url).toBe('https://boj.kr/1753');
  });

  it('태그 없는 문제 → 빈 tags 배열', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          problemId: 1000,
          titleKo: 'A+B',
          level: 1, // Bronze V
          tags: [],
        }),
      }),
    );

    const result = await getProblemById(1000);
    expect(result).not.toBeNull();
    expect(result!.tags).toEqual([]);
    expect(result!.tier).toBe('Bronze V');
  });

  it('API 404 응답 → null 반환 (graceful degradation)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const result = await getProblemById(99999);
    expect(result).toBeNull();
  });

  it('네트워크 오류 → null 반환 (graceful degradation)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const result = await getProblemById(1234);
    expect(result).toBeNull();
  });
});
