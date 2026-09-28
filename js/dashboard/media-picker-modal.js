/**
 * @file media-picker-modal.js
 * Accessible, AT&T Brand styled Media Picker Modal Dialog ("Choose Media").
 * Allows instructional designers to browse, preview, search, filter, upload,
 * and select assets from the project Media Library into any component media field.
 */

import { listMedia, saveMediaRecord, ensureMediaObjectURL, peekMediaObjectURL } from '../media-storage.js';
import { prepareMediaFile, createMediaReference, formatFileSize } from '../media.js';
import { getMediaAssetUsage } from '../media-usage.js';
import { isolateModal } from './att-modal.js';
import { showToast } from '../toast.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Opens the accessible Media Picker Modal.
 * @param {Object} options
 * @param {'all'|'image'|'audio'|'video'} [options.filterKind='all'] - Expected media type
 * @param {string} [options.currentMediaId=''] - Currently selected asset ID
 * @param {Element|null} [options.triggerElement=null] - Opener button for focus restoration
 * @param {Object} [options.limits] - Custom media limits
 * @param {Object} [options.store] - Optional custom IndexedDB store
 * @returns {Promise<Object|null>} Resolves with the chosen serializable media reference or null if cancelled
 */
export async function showMediaPickerModal({
  filterKind = 'all',
  currentMediaId = '',
  triggerElement = null,
  limits = null,
  store = undefined
} = {}) {
  const host = document.getElementById('modal-root') || document.body;
  let allAssets = [];
  try {
    allAssets = await listMedia(store);
  } catch (err) {
    console.warn('[MediaPicker] Could not load media assets:', err);
    allAssets = [];
  }

  // Pre-generate object URLs for previewing images/audio/video in picker
  await Promise.all(allAssets.map(asset => ensureMediaObjectURL(asset.id, store).catch(() => '')));

  return new Promise((resolve) => {
    let activeFilter = filterKind !== 'all' ? filterKind : 'all';
    let searchQuery = '';
    let selectedId = currentMediaId || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay media-picker-overlay';
    overlay.id = `media-picker-modal-${Date.now()}`;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', `${overlay.id}-title`);

    function renderModalContent() {
      // Filter assets
      let visibleAssets = allAssets;
      if (activeFilter !== 'all') {
        visibleAssets = visibleAssets.filter(a => a.kind === activeFilter);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        visibleAssets = visibleAssets.filter(a =>
          a.name?.toLowerCase().includes(q) ||
          a.kind?.toLowerCase().includes(q) ||
          a.altText?.toLowerCase().includes(q)
        );
      }

      const selectedAsset = allAssets.find(a => a.id === selectedId);
      const isSelectionCompatible = selectedAsset
        ? (filterKind === 'all' || selectedAsset.kind === filterKind)
        : false;

      const kindLabels = {
        all: 'All Compatible',
        image: 'Images',
        audio: 'Audio Clips',
        video: 'Videos'
      };

      overlay.innerHTML = `
        <div class="modal-dialog media-picker-dialog" style="max-width: 920px; width: 94vw; max-height: 88vh; display: flex; flex-direction: column; background: #ffffff; border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,0.22); overflow: hidden;">
          <!-- Modal Header -->
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #E4E7EB; background: #F8FAFC;">
            <div>
              <h2 id="${overlay.id}-title" class="modal-title" style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #111928;">Choose Media</h2>
              <p style="margin: 4px 0 0; font-size: 0.875rem; color: #4B5563;">
                Select an asset from the Course Media Library or upload a new file.
                ${filterKind !== 'all' ? `<span class="badge" style="margin-left: 6px; background: #E0F2FE; color: #0369A1; padding: 2px 8px; border-radius: 12px; font-size: 0.875rem; font-weight: 600;">Filtering for: ${kindLabels[filterKind] || filterKind}</span>` : ''}
              </p>
            </div>
            <button type="button" class="modal-close-btn" id="picker-close-btn" aria-label="Close Choose Media dialog" style="background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: #64748B; padding: 4px 8px; border-radius: 4px;">&times;</button>
          </div>

          <!-- Toolbar: Filters, Search, Upload Button -->
          <div class="media-picker-toolbar" style="padding: 12px 24px; background: #ffffff; border-bottom: 1px solid #E4E7EB; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div class="media-picker-filters" style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${filterKind === 'all' ? `
                <button type="button" class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${allAssets.length})</button>
                <button type="button" class="filter-chip ${activeFilter === 'image' ? 'active' : ''}" data-filter="image">Images</button>
                <button type="button" class="filter-chip ${activeFilter === 'audio' ? 'active' : ''}" data-filter="audio">Audio</button>
                <button type="button" class="filter-chip ${activeFilter === 'video' ? 'active' : ''}" data-filter="video">Videos</button>
              ` : `
                <button type="button" class="filter-chip active" data-filter="${filterKind}">${kindLabels[filterKind] || filterKind} (${visibleAssets.length})</button>
              `}
            </div>

            <div style="display: flex; gap: 10px; align-items: center;">
              <div class="search-input-wrapper" style="position: relative; width: 220px;">
                <input type="text" id="picker-search-input" class="dashboard-search-input" placeholder="Search assets..." value="${escapeHtml(searchQuery)}" style="width: 100%; padding: 6px 12px; font-size: 0.875rem; border: 1px solid #CBD5E1; border-radius: 6px;" />
              </div>
              <input type="file" id="picker-upload-input" accept="${filterKind === 'image' ? 'image/*' : filterKind === 'audio' ? 'audio/*' : filterKind === 'video' ? 'video/*' : 'image/*,audio/*,video/*'}" style="display:none;" />
              <button type="button" id="picker-upload-btn" class="btn btn-secondary btn-small" style="display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Upload New
              </button>
            </div>
          </div>

          <!-- Body: Asset Cards Grid -->
          <div class="media-picker-grid-scroll" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #F8FAFC;">
            ${visibleAssets.length === 0 ? `
              <div class="dashboard-empty-state" style="text-align: center; padding: 48px 20px;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">🖼️</div>
                <h3 class="empty-state-title" style="font-size: 1.125rem; font-weight: 700; color: #1E293B; margin-bottom: 4px;">${allAssets.length === 0 ? 'No media uploaded yet.' : 'No matching assets'}</h3>
                <p class="empty-state-subtitle" style="font-size: 0.9375rem; color: #64748B; margin-bottom: 16px;">
                  ${allAssets.length === 0
                    ? 'Upload a file to add it to the library, which is shared by every project in this browser.'
                    : searchQuery ? `No assets match "${escapeHtml(searchQuery)}". The library has ${allAssets.length} asset${allAssets.length === 1 ? '' : 's'}.` : `No ${filterKind !== 'all' ? filterKind : ''} assets match this filter (the library has ${allAssets.length}).`}
                </p>
                <button type="button" id="picker-empty-upload-btn" class="btn-att-primary btn-small">Upload Asset Now</button>
              </div>
            ` : `
              <div class="media-picker-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;" role="listbox" aria-label="Available media assets">
                ${visibleAssets.map(asset => {
                  const isSelected = asset.id === selectedId;
                  const isCompatible = filterKind === 'all' || asset.kind === filterKind;
                  const usage = getMediaAssetUsage(asset.id);
                  const objUrl = peekMediaObjectURL(asset.id);
                  const sizeKb = Math.round((asset.size || 0) / 1024);

                  return `
                    <div class="media-picker-card ${isSelected ? 'is-selected' : ''} ${!isCompatible ? 'is-incompatible' : ''}"
                         data-asset-id="${asset.id}"
                         role="option"
                         aria-selected="${isSelected}"
                         tabindex="0"
                         style="background: #ffffff; border: 2px solid ${isSelected ? '#0057B8' : '#E2E8F0'}; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; cursor: pointer; transition: all 0.15s ease; box-shadow: ${isSelected ? '0 0 0 3px rgba(0,87,184,0.2)' : '0 1px 3px rgba(0,0,0,0.05)'};">
                      <!-- Asset Preview Banner -->
                      <div class="media-card-preview-shell" style="height: 130px; background: #0F172A; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                        ${asset.kind === 'image' ? `
                          <img src="${objUrl}" alt="${escapeHtml(asset.altText || asset.name)}" style="width: 100%; height: 100%; object-fit: contain; background: #1E293B;" loading="lazy" />
                        ` : asset.kind === 'audio' ? `
                          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 10px; background: #1E293B;">
                            <span style="font-size: 2rem; margin-bottom: 4px;">🎵</span>
                            <audio src="${objUrl}" controls style="width: 90%; height: 32px; max-width: 200px;" preload="none" onclick="event.stopPropagation()"></audio>
                          </div>
                        ` : asset.kind === 'video' ? `
                          <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
                            <video src="${objUrl}" style="width: 100%; height: 100%; object-fit: contain;" preload="metadata" muted onclick="event.stopPropagation()"></video>
                            <span style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); color: #fff; font-size: 13px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">VIDEO</span>
                          </div>
                        ` : `
                          <span style="color: #94A3B8; font-size: 0.875rem;">File Asset</span>
                        `}

                        ${isSelected ? `
                          <div style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 50%; background: #0057B8; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                            ✓
                          </div>
                        ` : ''}
                      </div>

                      <!-- Asset Metadata Details -->
                      <div class="media-card-info" style="padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: #64748B; background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">${asset.kind}</span>
                            <span style="font-size: 13px; color: #64748B;">${sizeKb} KB</span>
                          </div>
                          <h4 style="margin: 0 0 4px; font-size: 0.9375rem; font-weight: 600; color: #1E293B; word-break: break-all; line-height: 1.3;" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</h4>
                        </div>
                        <div style="margin-top: 8px; font-size: 13px; color: #64748B; display: flex; justify-content: space-between; align-items: center;">
                          <span>${new Date(asset.createdAt).toLocaleDateString()}</span>
                          <span class="badge ${usage.isInUse ? 'badge-primary' : 'badge-neutral'}" style="font-size: 13px; padding: 2px 6px; border-radius: 10px; background: ${usage.isInUse ? '#E0F2FE' : '#F1F5F9'}; color: ${usage.isInUse ? '#0369A1' : '#64748B'};">
                            ${usage.totalUses} ${usage.totalUses === 1 ? 'use' : 'uses'}
                          </span>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          <!-- Modal Footer Actions -->
          <div class="modal-footer" style="padding: 16px 24px; border-top: 1px solid #E4E7EB; background: #ffffff; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 0.875rem; color: #64748B;">
              ${selectedAsset ? `Selected: <strong>${escapeHtml(selectedAsset.name)}</strong> (${selectedAsset.kind})` : 'No asset selected'}
            </div>
            <div style="display: flex; gap: 10px;">
              <button type="button" id="picker-cancel-btn" class="btn btn-text" style="padding: 8px 16px;">Cancel</button>
              <button type="button" id="picker-confirm-btn" class="btn-att-primary" ${!isSelectionCompatible ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} style="padding: 8px 20px;">
                Use Selected Asset
              </button>
            </div>
          </div>
        </div>
      `;

      attachModalEvents();
    }

    function closeDialog(result = null) {
      cleanupIsolation();
      overlay.remove();
      resolve(result);
    }

    function attachModalEvents() {
      // Close / Cancel
      overlay.querySelector('#picker-close-btn')?.addEventListener('click', () => closeDialog(null));
      overlay.querySelector('#picker-cancel-btn')?.addEventListener('click', () => closeDialog(null));

      // Filter chips
      overlay.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          activeFilter = /** @type {HTMLElement} */ (btn).dataset.filter || 'all';
          renderModalContent();
        });
      });

      // Search input
      const searchInput = /** @type {HTMLInputElement|null} */ (overlay.querySelector('#picker-search-input'));
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const input = /** @type {HTMLInputElement} */ (e.target);
          searchQuery = input.value;
          renderModalContent();
          const nextInput = /** @type {HTMLInputElement|null} */ (overlay.querySelector('#picker-search-input'));
          if (nextInput) {
            nextInput.focus();
            nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
          }
        });
      }

      // Card selection
      overlay.querySelectorAll('.media-picker-card').forEach(card => {
        const assetId = /** @type {HTMLElement} */ (card).dataset.assetId || '';
        const selectAction = () => {
          selectedId = assetId;
          renderModalContent();
        };

        card.addEventListener('click', selectAction);
        card.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectAction();
          }
        });
        card.addEventListener('dblclick', () => {
          selectedId = assetId;
          const chosen = allAssets.find(a => a.id === selectedId);
          if (chosen && (filterKind === 'all' || chosen.kind === filterKind)) {
            closeDialog(createMediaReference(chosen));
          }
        });
      });

      // Confirm button
      overlay.querySelector('#picker-confirm-btn')?.addEventListener('click', () => {
        const chosen = allAssets.find(a => a.id === selectedId);
        if (chosen) {
          closeDialog(createMediaReference(chosen));
        }
      });

      // Upload button
      const fileInput = /** @type {HTMLInputElement|null} */ (overlay.querySelector('#picker-upload-input'));
      const uploadBtn = overlay.querySelector('#picker-upload-btn');
      const emptyUploadBtn = overlay.querySelector('#picker-empty-upload-btn');

      const triggerUpload = () => fileInput?.click();
      if (uploadBtn) uploadBtn.addEventListener('click', triggerUpload);
      if (emptyUploadBtn) emptyUploadBtn.addEventListener('click', triggerUpload);

      if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
          const inputTarget = /** @type {HTMLInputElement} */ (e.target);
          const files = Array.from(inputTarget.files || []);
          if (!files.length) return;
          try {
            for (const file of files) {
              const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
              const record = await prepareMediaFile(file, kind, { limits });
              await saveMediaRecord(record, store);
              await ensureMediaObjectURL(record.id, store);
              allAssets.unshift(record);
              selectedId = record.id;
            }
            showToast('Asset uploaded and selected.', 'success');
            renderModalContent();
          } catch (err) {
            console.error('[MediaPicker] Upload error:', err);
            showToast(`Upload failed: ${err.message}`, 'error');
          } finally {
            fileInput.value = '';
          }
        });
      }
    }

    host.appendChild(overlay);
    renderModalContent();

    const cleanupIsolation = isolateModal(overlay, {
      triggerElement,
      onDismiss: () => closeDialog(null)
    });
  });
}
