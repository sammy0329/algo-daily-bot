import { describe, it, expect, vi } from 'vitest';
import { syncUserProblems } from '../handlers/dailySync';

describe('syncUserProblems', () => {
  it('solved 문제가 있으면 upsert 호출하고 count 반환', async () => {
    const mockGetLatest = vi.fn().mockResolvedValue([
      { problemId: 1753, titleKo: '최단경로', level: 12, tags: [], url: 'https://boj.kr/1753' },
      { problemId: 1000, titleKo: 'A+B', level: 1, tags: [], url: 'https://boj.kr/1000' },
    ]);
    const mockUpsert = vi.fn().mockResolvedValue(undefined);

    const count = await syncUserProblems('sammy0329', mockGetLatest, mockUpsert);

    expect(mockGetLatest).toHaveBeenCalledWith('sammy0329');
    expect(mockUpsert).toHaveBeenCalledWith('sammy0329', [{ id: 1753 }, { id: 1000 }]);
    expect(count).toBe(2);
  });

  it('solved 문제가 없으면 upsert 미호출, count 0 반환', async () => {
    const mockGetLatest = vi.fn().mockResolvedValue([]);
    const mockUpsert = vi.fn();

    const count = await syncUserProblems('sammy0329', mockGetLatest, mockUpsert);

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it('getLatest 오류 시 에러 throw', async () => {
    const mockGetLatest = vi.fn().mockRejectedValue(new Error('solved.ac API 오류'));
    const mockUpsert = vi.fn();

    await expect(syncUserProblems('sammy0329', mockGetLatest, mockUpsert)).rejects.toThrow(
      'solved.ac API 오류',
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
