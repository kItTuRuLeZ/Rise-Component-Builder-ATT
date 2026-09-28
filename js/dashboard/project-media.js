/**
 * Project Shared Media Library Controller
 * Manages project-wide media assets stored in IndexedDB and tracks component references.
 */

import { listMedia, saveMediaRecord, deleteMediaRecord, ensureMediaObjectURL } from '../media-storage.js';
import { prepareMediaFile, createMediaReference } from '../media.js';
import { getProject } from '../storage.js';
import { getMediaAssetUsage, replaceMediaAssetReferences } from '../media-usage.js';
import { showConfirmDialog, isolateModal } from './att-modal.js';
import { showMediaPickerModal } from './media-picker-modal.js';
import { showToast } from '../toast.js';

export class ProjectMediaView {
  constructor({ container, projectId, onBack }) {
    this.container = container;
    this.projectId = projectId;
    this.onBack = onBack;

    this.state = {
      mediaList: [],
      filterKind: 'all', // 'all' | 'image' | 'video' | 'audio' | 'used' | 'unused'
      searchQuery: '',
      isLoading: true
    };
  }

  async mount() {
    await this.refreshMediaList();
    this.render();
  }

  unmount() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  async refreshMediaList() {
    try {
      this.state.isLoading = true;
      this.state.mediaList = await listMedia();
      await Promise.all(this.state.mediaList.map(a => ensureMediaObjectURL(a.id).catch(() => '')));
    } catch (err) {
      console.warn('[ProjectMedia] Could not load media items:', err);
      this.state.mediaList = [];
    } finally {
      this.state.isLoading = false;
    }
  }

  getComponentReferences(mediaId) {
    const project = getProject(this.projectId);
    const usage = getMediaAssetUsage(mediaId, { activeProject: project });
    return usage.references.map(r => `${r.componentName} (${r.fieldLabel})`);
  }

  render() {
    if (!this.container) return;
    const project = getProject(this.projectId);
    let items = this.state.mediaList;

    // Filter by kind or reference state
    if (this.state.filterKind === 'image' || this.state.filterKind === 'video' || this.state.filterKind === 'audio') {
      items = items.filter(m => m.kind === this.state.filterKind);
    } else if (this.state.filterKind === 'used') {
      items = items.filter(m => getMediaAssetUsage(m.id, { activeProject: project }).isInUse);
    } else if (this.state.filterKind === 'unused') {
      items = items.filter(m => !getMediaAssetUsage(m.id, { activeProject: project }).isInUse);
    }

    // Filter by search query
    if (this.state.searchQuery.trim()) {
      const q = this.state.searchQuery.toLowerCase();
      items = items.filter(m => m.name?.toLowerCase().includes(q) || m.kind?.toLowerCase().includes(q));
    }

    const totalBytes = this.state.mediaList.reduce((acc, m) => acc + (m.size || 0), 0);
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);

    this.container.innerHTML = `
      <div class="project-workspace-view">
        <header class="workspace-header">
          <div class="workspace-breadcrumbs">
            <button id="media-back-btn" class="breadcrumb-back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              ${this.escapeHtml(project?.name || 'Project')}
            </button>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-current">Shared Media Library</span>
          </div>

          <div class="workspace-header-actions">
            <input type="file" id="media-upload-input" multiple accept="image/*,video/*,audio/*" style="display:none;" />
            <button id="media-upload-btn" class="btn-att-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Upload Assets
            </button>
          </div>
        </header>

        <main class="workspace-container">
          <!-- Quota and Media Storage Info Banner -->
          <div class="workspace-banner" style="margin-bottom: 20px;">
            <div class="workspace-banner-info">
              <h1 class="workspace-title">Course Media Library</h1>
              <p class="workspace-desc">
                Assets are stored in this browser on this device (IndexedDB). The library is <strong>shared by every project in this browser</strong>, not kept per course. <strong>Export JSON</strong> saves media references only, not the files; use <strong>Export Package</strong> (in the Open Project menu) or a course ZIP to carry the files themselves.
              </p>
              <div style="margin-top: 8px; font-size: 0.875rem; color: #555555; display: flex; gap: 16px;">
                <span>Total Assets: <strong>${this.state.mediaList.length}</strong></span>
                <span>Storage Footprint: <strong>${totalMb} MB</strong></span>
              </div>
            </div>
          </div>

          <div class="dashboard-controls" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div class="dashboard-filters-group" style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="filter-chip ${this.state.filterKind === 'all' ? 'active' : ''}" data-kind="all">All Assets (${this.state.mediaList.length})</button>
              <button class="filter-chip ${this.state.filterKind === 'image' ? 'active' : ''}" data-kind="image">Images</button>
              <button class="filter-chip ${this.state.filterKind === 'video' ? 'active' : ''}" data-kind="video">Videos</button>
              <button class="filter-chip ${this.state.filterKind === 'audio' ? 'active' : ''}" data-kind="audio">Audio</button>
              <button class="filter-chip ${this.state.filterKind === 'used' ? 'active' : ''}" data-kind="used">In Use</button>
              <button class="filter-chip ${this.state.filterKind === 'unused' ? 'active' : ''}" data-kind="unused">Unused</button>
            </div>

            <div class="dashboard-search-wrap" style="width: 260px;">
              <input type="text" id="media-search-input" class="dashboard-search-input" placeholder="Search media by name..." value="${this.escapeHtml(this.state.searchQuery)}" style="width: 100%;" />
            </div>
          </div>

          ${this.state.isLoading ? `
            <p style="text-align:center; padding: 40px; color:#666;">Loading project media library...</p>
          ` : items.length > 0 ? `
            <div class="dashboard-projects-grid">
              ${items.map(item => this.renderMediaCard(item)).join('')}
            </div>
          ` : `
            <div class="dashboard-empty-state">
              ${this.state.mediaList.length === 0 ? `
                <h3 class="empty-state-title">No media uploaded yet.</h3>
                <p class="empty-state-subtitle">Upload graphics, audio or video to use them in any course component.</p>
              ` : `
                <h3 class="empty-state-title">No matching assets</h3>
                <p class="empty-state-subtitle">${this.state.searchQuery.trim() ? `Nothing in the library matches “${this.escapeHtml(this.state.searchQuery.trim())}”.` : 'No assets match this filter.'} The library has ${this.state.mediaList.length} asset${this.state.mediaList.length === 1 ? '' : 's'}; clear the search or choose “All Assets”.</p>
              `}
              <button id="media-empty-upload-btn" class="btn-att-primary" style="margin-top: 12px;">Upload Media File</button>
            </div>
          `}
        </main>
      </div>
    `;

    this.attachEventListeners();
  }

  renderMediaCard(item) {
    const refs = this.getComponentReferences(item.id);
    const sizeKb = Math.round((item.size || 0) / 1024);

    return `
      <div class="project-card" style="cursor: default;">
        <div class="project-card-header">
          <span class="project-client-badge" style="text-transform: uppercase;">${this.escapeHtml(item.kind || 'media')}</span>
          <button class="project-menu-btn text-danger" data-action="delete-media" data-id="${item.id}" title="Delete asset">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>

        <h4 class="project-card-title" style="font-size: 1rem; word-break: break-all;">${this.escapeHtml(item.name)}</h4>
        <p class="project-card-desc" style="font-size: 0.875rem;">
          Size: ${sizeKb} KB · Uploaded ${new Date(item.createdAt).toLocaleDateString()}
        </p>

        <div class="project-card-stats" style="flex-direction: column; align-items: flex-start; gap: 4px;">
          <span style="font-size: 0.875rem; font-weight: 700; color: #555;">Used in ${refs.length} ${refs.length === 1 ? 'place' : 'places'}:</span>
          ${refs.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${refs.map(r => `<span class="component-status-badge draft" style="font-size: 13px;">${this.escapeHtml(r)}</span>`).join('')}
            </div>
          ` : `
            <span style="font-size: 13px; color: #999;">Unreferenced</span>
          `}
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    this.container.querySelector('#media-back-btn')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    this.container.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.filterKind = btn.dataset.kind;
        this.render();
      });
    });

    const searchInput = this.container.querySelector('#media-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value;
        this.render();
        const newSearch = this.container.querySelector('#media-search-input');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
        }
      });
    }

    const fileInput = this.container.querySelector('#media-upload-input');
    const uploadBtn = this.container.querySelector('#media-upload-btn');
    const emptyUploadBtn = this.container.querySelector('#media-empty-upload-btn');

    const triggerUpload = () => fileInput?.click();
    if (uploadBtn) uploadBtn.addEventListener('click', triggerUpload);
    if (emptyUploadBtn) emptyUploadBtn.addEventListener('click', triggerUpload);

    if (fileInput) {
      fileInput.addEventListener('change', async (event) => {
        try {
          const files = Array.from(event.target.files || []);
          if (!files.length) return;
          let uploadedCount = 0;
          for (const file of files) {
            const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
            const record = await prepareMediaFile(file, kind);
            await saveMediaRecord(record);
            uploadedCount++;
          }
          await this.refreshMediaList();
          this.render();
          showToast(`${uploadedCount} ${uploadedCount === 1 ? 'asset' : 'assets'} uploaded successfully.`, 'success');
        } catch (err) {
          console.error('[ProjectMedia] Upload failed:', err);
          showToast(`Upload failed: ${err.message}`, 'error', 5000);
        } finally {
          fileInput.value = '';
        }
      });
    }

    this.container.querySelectorAll('[data-action="delete-media"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const id = btn.dataset.id;
          const targetAsset = this.state.mediaList.find(a => a.id === id);
          const assetName = targetAsset?.name || 'this media asset';
          const usage = getMediaAssetUsage(id);

          if (usage.totalUses > 0) {
            // In-use Delete & Replace Protection Dialog
            const action = await this.showInUseDeleteDialog(targetAsset, usage, btn);
            if (action === 'delete') {
              await deleteMediaRecord(id);
              await this.refreshMediaList();
              this.render();
              showToast(`Deleted “${assetName}”. Components will show missing asset placeholder.`, 'warning');
            } else if (action === 'replace') {
              const replacement = await showMediaPickerModal({
                filterKind: targetAsset.kind,
                triggerElement: btn
              });
              if (replacement && (replacement.mediaId || replacement.assetId) !== id) {
                const count = replaceMediaAssetReferences(id, replacement);
                await deleteMediaRecord(id);
                await this.refreshMediaList();
                this.render();
                showToast(`Replaced ${count} reference(s) with “${replacement.name}” and removed old asset.`, 'success');
              }
            }
          } else {
            // Unused simple confirmation
            const ok = await showConfirmDialog({
              title: 'Delete Media Asset',
              message: `Are you sure you want to delete “${assetName}”? This asset is not currently referenced in any course components.`,
              confirmText: 'Delete Asset',
              isDanger: true
            });
            if (ok) {
              await deleteMediaRecord(id);
              await this.refreshMediaList();
              this.render();
              showToast('Media asset deleted.', 'info');
            }
          }
        } catch (err) {
          console.error('[ProjectMedia] Delete failed:', err);
          showToast(`Could not delete asset: ${err.message}`, 'error', 5000);
        }
      });
    });
  }

  showInUseDeleteDialog(asset, usage, triggerElement) {
    const host = document.getElementById('modal-root') || document.body;
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const affectedList = usage.references
        .map(r => `<li><strong>${this.escapeHtml(r.componentName)}</strong> in <em>${this.escapeHtml(r.projectName)}</em> (${this.escapeHtml(r.fieldLabel)})</li>`)
        .join('');

      overlay.innerHTML = `
        <div class="modal-dialog" style="max-width: 540px; width: 92vw; background: #fff; border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,0.25); overflow: hidden;">
          <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid #E2E8F0; background: #FEF2F2;">
            <h3 style="margin: 0; color: #991B1B; font-size: 1.125rem; font-weight: 700;">⚠️ Asset In Use (${usage.totalUses} ${usage.totalUses === 1 ? 'Reference' : 'References'})</h3>
          </div>
          <div class="modal-body" style="padding: 20px; font-size: 0.9375rem; color: #334155; line-height: 1.5;">
            <p style="margin: 0 0 12px;"><strong>“${this.escapeHtml(asset?.name || 'Asset')}”</strong> is currently used in the following components:</p>
            <div style="max-height: 140px; overflow-y: auto; background: #F8FAFC; padding: 10px 14px; border-radius: 6px; border: 1px solid #E2E8F0; margin-bottom: 14px;">
              <ul style="margin: 0; padding-left: 20px; font-size: 0.875rem;">
                ${affectedList}
              </ul>
            </div>
            <p style="margin: 0; color: #64748B; font-size: 0.875rem;">
              Deleting this asset will leave missing media placeholders in the affected components. You can replace all references with another asset first.
            </p>
          </div>
          <div class="modal-footer" style="padding: 14px 20px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn-text" id="dlg-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-secondary" id="dlg-replace-btn">Replace References</button>
            <button type="button" class="btn btn-danger" id="dlg-delete-btn">Delete Anyway</button>
          </div>
        </div>
      `;

      function close(choice) {
        cleanup();
        overlay.remove();
        resolve(choice);
      }

      overlay.querySelector('#dlg-cancel-btn').addEventListener('click', () => close(null));
      overlay.querySelector('#dlg-replace-btn').addEventListener('click', () => close('replace'));
      overlay.querySelector('#dlg-delete-btn').addEventListener('click', () => close('delete'));

      host.appendChild(overlay);
      const cleanup = isolateModal(overlay, { triggerElement, onDismiss: () => close(null) });
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

