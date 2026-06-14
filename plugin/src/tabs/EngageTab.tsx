import React from 'react';
import { PageHeader, Tabs } from '../components';
import { usePages } from '../hooks';
import { InboxTab } from './InboxTab';
import { CommentsTab } from './CommentsTab';

type SubTab = 'inbox' | 'comments';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Hộp thư', icon: '✉' },
  { id: 'comments', label: 'Bình luận', icon: '✦' },
];

/**
 * Tab "Trả lời tự động" gộp Hộp thư Messenger + Bình luận vào cùng một màn hình
 * với 2 sub-tab. Cả hai sub-view dùng chung state `pages` + `currentPageId`
 * để khi đổi trang thì danh sách của cả hai cùng cập nhật.
 */
export const EngageTab: React.FC = () => {
  const { data: pages } = usePages();
  const [currentPageId, setCurrentPageId] = React.useState<string | null>(null);
  const [subTab, setSubTab] = React.useState<SubTab>('inbox');

  // Tự chọn trang đầu tiên ngay khi `pages` load xong. Đây là chỗ fix bug
  // "không hiện danh sách của page đầu tiên khi vừa ấn vào" trước đây: effect
  // phải chạy đồng bộ sau render đầu tiên thay vì phụ thuộc vào API round-trip.
  React.useEffect(() => {
    if (pages.length > 0 && !currentPageId) {
      setCurrentPageId(pages[0]!.id);
    }
  }, [pages, currentPageId]);

  return (
    <div className="fb-tab fb-tab--engage">
      <PageHeader
        title="Trả lời tự động"
        actions={
          <Tabs<SubTab>
            items={SUB_TABS}
            value={subTab}
            onChange={setSubTab}
            size="sm"
          />
        }
      />

      {subTab === 'inbox' && (
        <InboxTab
          pages={pages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          embedded
        />
      )}
      {subTab === 'comments' && (
        <CommentsTab
          pages={pages}
          currentPageId={currentPageId}
          onPageChange={setCurrentPageId}
          embedded
        />
      )}
    </div>
  );
};

export default EngageTab;
