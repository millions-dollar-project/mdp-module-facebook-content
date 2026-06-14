import React from 'react';
import { PageHeader, Modal, Input, Textarea, Button, useToast } from '../components';
import { PageList } from '../sections/pages/PageList';
import { PageForm, PageFormValue } from '../sections/pages/PageForm';
import { usePages } from '../hooks';
import { fbFetch } from '../lib/api';
import type { FacebookPage } from '../lib/types';

const blank: PageFormValue = { pageId: '', pageName: '', pageAccessToken: '', category: '' };

export const PagesTab: React.FC = () => {
  const { data: pages, reload: reloadPages } = usePages();
  const [editing, setEditing] = React.useState<PageFormValue>(blank);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const toast = useToast();

  // Add-page modal (simple: id + token only — server auto-fills name).
  const [addOpen, setAddOpen] = React.useState(false);
  const [addPageId, setAddPageId] = React.useState('');
  const [addPageToken, setAddPageToken] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const resetAdd = () => { setAddPageId(''); setAddPageToken(''); };

  const handleAdd = async (): Promise<void> => {
    const pageId = addPageId.trim();
    if (!pageId || !addPageToken.trim()) return;
    setAdding(true);
    try {
      toast.info('Đang kết nối Meta để xác thực trang…');
      const created = await fbFetch<FacebookPage>('add-page', {
        method: 'POST',
        body: { pageId, pageAccessToken: addPageToken.trim() },
      });
      toast.success(`Đã thêm trang "${created.pageName}"`);
      setAddOpen(false);
      resetAdd();
      reloadPages();
    } catch (err) {
      toast.error(`Thêm trang thất bại: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  // AI Persona modal
  const [personaPage, setPersonaPage] = React.useState<FacebookPage | null>(null);
  const [personaForm, setPersonaForm] = React.useState({
    aiRole: '',
    aiIndustry: '',
    aiTone: '',
    aiPriceList: '',
    aiLocationInfo: '',
    aiContactChannel: '',
    aiExtraRules: '',
    aiSystemPrompt: '',
  });

  const openPersona = (p: FacebookPage) => {
    setPersonaPage(p);
    setPersonaForm({
      aiRole: p.aiRole ?? '',
      aiIndustry: p.aiIndustry ?? '',
      aiTone: p.aiTone ?? '',
      aiPriceList: p.aiPriceList ?? '',
      aiLocationInfo: p.aiLocationInfo ?? '',
      aiContactChannel: p.aiContactChannel ?? '',
      aiExtraRules: p.aiExtraRules ?? '',
      aiSystemPrompt: p.aiSystemPrompt ?? '',
    });
  };

  const handleSavePersona = async () => {
    if (!personaPage) return;
    try {
      toast.info('Đang lưu persona…');
      await fbFetch('update-page-persona', {
        method: 'POST',
        body: {
          pageId: personaPage.pageId,
          persona: {
            role: personaForm.aiRole || undefined,
            industry: personaForm.aiIndustry || undefined,
            tone: personaForm.aiTone || undefined,
            priceList: personaForm.aiPriceList || undefined,
            locationInfo: personaForm.aiLocationInfo || undefined,
            contactChannel: personaForm.aiContactChannel || undefined,
            extraRules: personaForm.aiExtraRules || undefined,
            systemPrompt: personaForm.aiSystemPrompt || undefined,
          },
        },
      });
      setPersonaPage(null);
      reloadPages();
      toast.success(`Đã lưu cấu hình AI cho "${personaPage.pageName}"`);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  // Edit flow (used by card's "Sửa token" button) — keeps the
  // detailed form for editing an existing page (name, category,
  // token, persona defaults).
  const openEdit = (p: FacebookPage) => {
    setEditingId(p.id);
    setEditing({
      pageId: p.pageId,
      pageName: p.pageName,
      pageAccessToken: p.pageAccessToken,
      category: p.category ?? '',
    });
  };
  const closeEdit = () => { setEditing(blank); setEditingId(null); };

  const handleEditSubmit = async (): Promise<void> => {
    if (!editingId) return;
    try {
      await fbFetch('update-page', { method: 'POST', body: editing });
      toast.success(`Đã cập nhật trang "${editing.pageName}"`);
      closeEdit();
      reloadPages();
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleTest = async (p: FacebookPage): Promise<void> => {
    try {
      await fbFetch('test-page-connection', { method: 'POST', body: { pageId: p.pageId } });
      toast.success(`Trang "${p.pageName}" đã test kết nối thành công`);
    } catch (err) {
      toast.error(`Test kết nối trang "${p.pageName}" thất bại: ${(err as Error).message}`);
    }
  };

  const handleToggle = async (p: FacebookPage): Promise<void> => {
    const enabled = !(p.isActive && p.postingEnabled && p.aiEnabled);
    try {
      await fbFetch('update-page', {
        method: 'POST',
        body: {
          ...p,
          isActive: enabled,
          postingEnabled: enabled,
          aiEnabled: enabled,
        },
      });
      toast.success(
        enabled
          ? `Trang "${p.pageName}" đã bật lại. AI chat và lịch đăng đã hoạt động.`
          : `Trang "${p.pageName}" đã tắt AI chat và đăng bài tự động`,
      );
      reloadPages();
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  // Bulk-select state lives here (PageList is a presentational card list,
  // not a DataTable, so it cannot host its own selection UI).
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  // Prune selection ids that no longer correspond to a known page.
  React.useEffect(() => {
    setSelectedIds((cur) => {
      if (cur.size === 0) return cur;
      const live = new Set(pages.map((p) => p.id));
      let changed = false;
      const next = new Set<string>();
      cur.forEach((id) => {
        if (live.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : cur;
    });
  }, [pages]);

  const toggleSelect = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((cur) => {
      if (cur.size === pages.length) return new Set();
      return new Set(pages.map((p) => p.id));
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fbFetch<{ success: boolean; id: string }>('delete-page', { method: 'POST', body: { id } })),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = ids.length - ok;
      if (ok) toast.success(`Đã xóa ${ok}/${ids.length} trang`);
      if (failed) {
        const errs = results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'unknown')
          .join('; ');
        toast.error(`${failed} lỗi: ${errs}`);
        // Keep only the failed ids selected so the user can retry.
        const failedIds = ids.filter((_, i) => results[i].status === 'rejected');
        setSelectedIds(new Set(failedIds));
      } else {
        setSelectedIds(new Set());
      }
      setConfirmBulkDelete(false);
      reloadPages();
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="fb-tab fb-tab--pages">
      <PageHeader
        title="Quản lý trang"
        subtitle="Mỗi trang cần một page access token riêng — mỗi trang có thể cấu hình độc lập"
      />

      <div className="fb-section__bar">
        <Button onClick={() => setAddOpen(true)}>+ Thêm fanpage</Button>
      </div>

      <div style={{ position: 'relative' }}>
        <PageList
          pages={pages}
          onEdit={openEdit}
          onTest={handleTest}
          onTogglePosting={handleToggle}
          onConfigureAI={openPersona}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />

        {selectedIds.size > 0 && (
          <div className="fb-bulk-bar" role="region" aria-label="Bulk actions">
            <span className="fb-bulk-bar__count">Đã chọn {selectedIds.size}</span>
            <div className="fb-bulk-bar__actions">
              <Button variant="ghost" onClick={clearSelection} disabled={bulkDeleting}>
                Bỏ chọn
              </Button>
              <Button variant="danger" onClick={() => setConfirmBulkDelete(true)} disabled={bulkDeleting}>
                Xóa {selectedIds.size} trang
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add fanpage modal — minimal: only id + token, server fills name. */}
      <Modal
        open={addOpen}
        onClose={() => (adding ? null : (setAddOpen(false), resetAdd()))}
        title="Thêm fanpage"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setAddOpen(false); resetAdd(); }} disabled={adding}>
              Hủy
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!addPageId.trim() || !addPageToken.trim() || adding}
            >
              {adding ? 'Đang xác thực…' : 'Thêm page'}
            </Button>
          </>
        }
      >
        <div className="fb-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Page ID <span style={{ color: 'var(--ds-danger)' }}>*</span>
            <Input
              value={addPageId}
              onChange={(e) => setAddPageId(e.target.value)}
              placeholder="vd: 642546399435985"
              autoFocus
            />
          </label>
          <label>
            Page Access Token <span style={{ color: 'var(--ds-danger)' }}>*</span>
            <Input
              type="password"
              value={addPageToken}
              onChange={(e) => setAddPageToken(e.target.value)}
              placeholder="EAAB…"
              autoComplete="off"
            />
          </label>
          <p className="fb-muted" style={{ fontSize: 12, margin: 0 }}>
            Lấy Page ID từ Meta Business Suite. Token cần là page access token
            dài hạn (long-lived). Tên trang và danh mục sẽ tự động được lấy từ
            Meta. Sau khi thêm, bấm "Sửa token" trên thẻ trang để chỉnh sửa chi tiết.
          </p>
        </div>
      </Modal>

      {/* Edit fanpage modal — detailed form (name, category, token, persona defaults). */}
      <Modal
        open={editingId != null}
        onClose={() => (bulkDeleting ? null : closeEdit())}
        title={`Sửa trang — ${editing.pageName || ''}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeEdit} disabled={bulkDeleting}>Hủy</Button>
            <Button onClick={handleEditSubmit} disabled={bulkDeleting}>Cập nhật</Button>
          </>
        }
      >
        <PageForm
          value={editing}
          onChange={setEditing}
          onSubmit={handleEditSubmit}
          onCancel={closeEdit}
          existingId={editingId ?? undefined}
        />
      </Modal>

      <Modal
        open={personaPage != null}
        onClose={() => setPersonaPage(null)}
        title={`Cấu hình AI — ${personaPage?.pageName ?? ''}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPersonaPage(null)}>Hủy</Button>
            <Button onClick={handleSavePersona}>Lưu persona</Button>
          </>
        }
      >
        <div className="fb-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="fb-muted" style={{ fontSize: 12 }}>
            Để trống sẽ dùng giá trị mặc định. Nếu điền <strong>System Prompt đầy đủ</strong>, các trường khác sẽ bị bỏ qua.
          </p>
          <label>
            Vai trò AI (vd: tư vấn viên tuyển sinh)
            <Input value={personaForm.aiRole} onChange={(e) => setPersonaForm((s) => ({ ...s, aiRole: e.target.value }))} />
          </label>
          <label>
            Ngành / lĩnh vực (vd: giáo dục mầm non, xây dựng, spa…)
            <Input value={personaForm.aiIndustry} onChange={(e) => setPersonaForm((s) => ({ ...s, aiIndustry: e.target.value }))} />
          </label>
          <label>
            Giọng điệu (vd: thân thiện, chuyên nghiệp, hài hước…)
            <Input value={personaForm.aiTone} onChange={(e) => setPersonaForm((s) => ({ ...s, aiTone: e.target.value }))} />
          </label>
          <label>
            Bảng giá / chi phí
            <Textarea value={personaForm.aiPriceList} onChange={(e) => setPersonaForm((s) => ({ ...s, aiPriceList: e.target.value }))} rows={2} />
          </label>
          <label>
            Thông tin địa điểm
            <Textarea value={personaForm.aiLocationInfo} onChange={(e) => setPersonaForm((s) => ({ ...s, aiLocationInfo: e.target.value }))} rows={2} />
          </label>
          <label>
            Kênh liên hệ (vd: Zalo: 0901xxx)
            <Input value={personaForm.aiContactChannel} onChange={(e) => setPersonaForm((s) => ({ ...s, aiContactChannel: e.target.value }))} />
          </label>
          <label>
            Quy tắc thêm (mỗi dòng 1 quy tắc)
            <Textarea value={personaForm.aiExtraRules} onChange={(e) => setPersonaForm((s) => ({ ...s, aiExtraRules: e.target.value }))} rows={3} />
          </label>
          <label>
            System Prompt override (tuỳ chọn — ghi đè toàn bộ prompt)
            <Textarea value={personaForm.aiSystemPrompt} onChange={(e) => setPersonaForm((s) => ({ ...s, aiSystemPrompt: e.target.value }))} rows={5} placeholder="Để trống nếu muốn dùng prompt tự động từ các trường trên…" />
          </label>
        </div>
      </Modal>

      <Modal
        open={confirmBulkDelete}
        onClose={() => (bulkDeleting ? null : setConfirmBulkDelete(false))}
        title={`Xóa ${selectedIds.size} trang đã chọn?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? 'Đang xóa…' : `Xóa ${selectedIds.size} trang`}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Các trang đã chọn sẽ bị xoá khỏi danh sách. Mọi lịch đăng, persona AI và lịch sử inbox liên quan
          sẽ ngừng hoạt động.
        </p>
        <p className="fb-muted" style={{ marginTop: 8, fontSize: 12 }}>
          Lưu ý: page access token đã lưu trong DB sẽ bị xoá theo.
        </p>
      </Modal>
    </div>
  );
};

export default PagesTab;
