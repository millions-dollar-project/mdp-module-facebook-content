import { useFacebookApi } from './useFacebookApi';
import { MOCK_COMMENTS } from '../mocks';
import type { FacebookComment } from '../lib/types';

export const useComments = (pageId: string | null): ReturnType<typeof useFacebookApi<FacebookComment[]>> => {
  // MOCK_COMMENTS không gắn pageId, nên khi backend fail thì hiển thị tất cả mock
  // thay vì danh sách trống — đảm bảo người dùng thấy được dữ liệu ngay từ lần
  // click đầu tiên.
  return useFacebookApi<FacebookComment[]>(
    pageId ? `comments?pageId=${encodeURIComponent(pageId)}` : null,
    pageId ? MOCK_COMMENTS : [],
    { pollMs: 30000 }
  );
};

export default useComments;
