// Blackboard Library Application Logic
// Direct Supabase Cloud Storage (100% Cloud-Only, No LocalStorage)

(function () {
    // State
    let items = [];
    let currentFilter = 'all'; // 'all' | 'use' | 'not_use'
    let searchQuery = '';
    let supabase = null;

    // DOM Elements
    const gridContainer = document.getElementById('libraryGrid');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('searchInput');
    const countAll = document.getElementById('countAll');
    const countUse = document.getElementById('countUse');
    const countNotUse = document.getElementById('countNotUse');
    const connectionStatus = document.getElementById('connectionStatus');
    const connectionText = document.getElementById('connectionText');

    // Modals
    const addModal = document.getElementById('addModal');
    const openAddModalBtn = document.getElementById('openAddModalBtn');
    const closeAddModalBtn = document.getElementById('closeAddModalBtn');
    const cancelAddBtn = document.getElementById('cancelAddBtn');
    const addItemForm = document.getElementById('addItemForm');

    // Add Form Inputs & Preview
    const inputTitle = document.getElementById('itemTitle');
    const inputUrl = document.getElementById('itemUrl');
    const inputDesc = document.getElementById('itemDesc');
    const inputCategory = document.getElementById('itemCategory');
    const livePreviewContainer = document.getElementById('livePreviewContainer');
    const previewFavicon = document.getElementById('previewFavicon');
    const previewDomain = document.getElementById('previewDomain');
    const previewTitleText = document.getElementById('previewTitleText');

    // Full Preview Modal
    const previewModal = document.getElementById('previewModal');
    const closePreviewModalBtn = document.getElementById('closePreviewModalBtn');
    const previewModalTitle = document.getElementById('previewModalTitle');
    const previewIframe = document.getElementById('previewIframe');
    const externalLinkBtn = document.getElementById('externalLinkBtn');
    const iframeFallback = document.getElementById('iframeFallback');
    const fallbackLink = document.getElementById('fallbackLink');

    // --- Helper: Extract domain and favicon ---
    function getDomain(url) {
        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            return parsed.hostname;
        } catch (e) {
            return url;
        }
    }

    function getFaviconUrl(url) {
        const domain = getDomain(url);
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }

    // --- Supabase Setup ---
    function initSupabase() {
        const config = window.SUPABASE_CONFIG || {};

        if (config.url && config.anonKey && window.supabase) {
            try {
                supabase = window.supabase.createClient(config.url, config.anonKey);
                setConnectionBadge('Supabase Live (เชื่อมต่อคลาวด์แล้ว)', true);
                fetchSupabaseData();
                subscribeToRealtime();
                return;
            } catch (err) {
                console.error('Supabase init error:', err);
                setConnectionBadge('เชื่อมต่อ Supabase ผิดพลาด', false);
                showErrorState('ไม่สามารถเชื่อมต่อ Supabase ได้: ' + err.message);
            }
        } else {
            setConnectionBadge('ยังไม่ได้ระบุ Supabase URL/Key', false);
            showErrorState('กรุณาระบุ URL และ Anon Key ใน js/config.js');
        }
    }

    function setConnectionBadge(text, isOnline) {
        connectionText.textContent = text;
        const dot = connectionStatus.querySelector('.status-dot');
        if (isOnline) {
            dot.className = 'status-dot online';
        } else {
            dot.className = 'status-dot demo';
        }
    }

    function showErrorState(msg) {
        gridContainer.innerHTML = `
            <div class="empty-state">
                <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #fb7185;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <h3>เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล</h3>
                <p style="color: #cbd5e1;">${escapeHtml(msg)}</p>
                <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 8px;">
                    อย่าลืมนำสคริปต์ใน <code>database/schema.sql</code> ไปรันใน Supabase SQL Editor
                </p>
            </div>
        `;
    }

    // --- Realtime Subscriptions ---
    function subscribeToRealtime() {
        if (!supabase) return;
        supabase
            .channel('public:items')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
                fetchSupabaseData();
            })
            .subscribe();
    }

    // --- Data Fetching from Supabase Only ---
    async function fetchSupabaseData() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('items')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Fetch error:', error);
                if (error.code === '42P01') {
                    showErrorState('ยังไม่พบตาราง "items" ใน Supabase กรุณารันคำสั่งใน database/schema.sql ที่ Supabase SQL Editor');
                } else {
                    showErrorState(error.message);
                }
                return;
            }

            items = data || [];
            renderGrid();
        } catch (err) {
            console.error('Error fetching Supabase items:', err);
            showErrorState(err.message);
        }
    }

    // --- Actions: Toggle Status (Use / Not Use) ---
    window.toggleItemStatus = async function (id) {
        const item = items.find((i) => i.id === id);
        if (!item || !supabase) return;

        const newStatus = item.status === 'use' ? 'not_use' : 'use';

        // Optimistic UI update
        item.status = newStatus;
        renderGrid();

        const { error } = await supabase
            .from('items')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ' + error.message);
            fetchSupabaseData();
        }
    };

    // --- Actions: Delete Item ---
    window.deleteItem = async function (id) {
        if (!confirm('คุณแน่ใจว่าต้องการลบรายการนี้ออกจาก Library?')) return;
        if (!supabase) return;

        items = items.filter((i) => i.id !== id);
        renderGrid();

        const { error } = await supabase
            .from('items')
            .delete()
            .eq('id', id);

        if (error) {
            alert('ไม่สามารถลบรายการได้: ' + error.message);
            fetchSupabaseData();
        }
    };

    // --- Actions: Open Full Preview ---
    window.openPreviewModal = function (url, title) {
        let fullUrl = url.trim();
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            fullUrl = 'https://' + fullUrl;
        }

        previewModalTitle.textContent = title;
        externalLinkBtn.href = fullUrl;
        fallbackLink.href = fullUrl;

        previewIframe.src = fullUrl;
        iframeFallback.style.display = 'none';

        previewIframe.onerror = () => {
            iframeFallback.style.display = 'flex';
        };

        previewModal.style.display = 'flex';
    };

    // --- Add New Item directly to Supabase ---
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!supabase) {
            alert('ยังไม่ได้เชื่อมต่อฐานข้อมูล Supabase');
            return;
        }

        let rawUrl = inputUrl.value.trim();
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            rawUrl = 'https://' + rawUrl;
        }

        const title = inputTitle.value.trim();
        const description = inputDesc.value.trim();
        const category = inputCategory.value || 'General';

        const submitBtn = addItemForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังบันทึก...';

        const { error } = await supabase.from('items').insert([{
            title: title,
            url: rawUrl,
            description: description,
            category: category,
            status: 'use'
        }]);

        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            บันทึกเข้า Library
        `;

        if (error) {
            alert('เกิดข้อผิดพลาดในการบันทึกลง Supabase: ' + error.message);
            return;
        }

        // Close and reset modal
        closeModal(addModal);
        addItemForm.reset();
        livePreviewContainer.style.display = 'none';
        await fetchSupabaseData();
    });

    // --- Realtime Input preview inside Modal ---
    inputUrl.addEventListener('input', () => {
        const url = inputUrl.value.trim();
        if (url.length > 3) {
            const domain = getDomain(url);
            previewDomain.textContent = domain;
            previewFavicon.src = getFaviconUrl(url);
            previewTitleText.textContent = inputTitle.value.trim() || domain;
            livePreviewContainer.style.display = 'flex';
        } else {
            livePreviewContainer.style.display = 'none';
        }
    });

    inputTitle.addEventListener('input', () => {
        if (livePreviewContainer.style.display !== 'none') {
            previewTitleText.textContent = inputTitle.value.trim() || getDomain(inputUrl.value);
        }
    });

    // --- Render Grid ---
    function renderGrid() {
        // Compute Counts
        const totalCount = items.length;
        const useCount = items.filter((i) => i.status === 'use').length;
        const notUseCount = items.filter((i) => i.status === 'not_use').length;

        countAll.textContent = totalCount;
        countUse.textContent = useCount;
        countNotUse.textContent = notUseCount;

        // Filter & Search
        let filtered = items.filter((item) => {
            if (currentFilter === 'use') return item.status === 'use';
            if (currentFilter === 'not_use') return item.status === 'not_use';
            return true;
        });

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (i) =>
                    i.title.toLowerCase().includes(query) ||
                    (i.description && i.description.toLowerCase().includes(query)) ||
                    i.url.toLowerCase().includes(query) ||
                    (i.category && i.category.toLowerCase().includes(query))
            );
        }

        if (filtered.length === 0) {
            gridContainer.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                    </svg>
                    <h3>ไม่พบข้อมูลใน Library</h3>
                    <p>ยังไม่มีรายการที่ตรงกับการค้นหา หรือยังไม่มีการเพิ่มงานในหมวดนี้</p>
                    <button class="btn-primary" onclick="document.getElementById('openAddModalBtn').click()">
                        + เพิ่มงานชิ้นแรก
                    </button>
                </div>
            `;
            return;
        }

        gridContainer.innerHTML = filtered
            .map((item) => {
                const domain = getDomain(item.url);
                const favicon = getFaviconUrl(item.url);
                const isUse = item.status === 'use';

                return `
                <div class="card-item status-${item.status}" id="card-${item.id}">
                    <!-- Card Thumbnail / Preview Banner -->
                    <div class="card-preview-thumb" onclick="openPreviewModal('${escapeHtml(item.url)}', '${escapeHtml(item.title)}')">
                        <div class="card-preview-placeholder">
                            <img src="${favicon}" alt="Favicon" style="width: 48px; height: 48px; border-radius: 12px; margin-bottom: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);" onerror="this.src='https://via.placeholder.com/48?text=Web'">
                            <span style="font-size: 0.82rem; color: #94a3b8; font-weight: 500;">${escapeHtml(domain)}</span>
                        </div>
                        <div class="card-preview-overlay">
                            <span class="preview-badge-btn">
                                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                ดูหน้า Preview
                            </span>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="card-body">
                        <div class="card-header-row">
                            <span class="card-category">${escapeHtml(item.category || 'General')}</span>
                            <span class="status-pill ${item.status}">
                                <span class="status-dot ${isUse ? 'online' : 'demo'}" style="width: 6px; height: 6px;"></span>
                                ${isUse ? 'ใช้' : 'ไม่ใช้'}
                            </span>
                        </div>

                        <h3 class="card-title">${escapeHtml(item.title)}</h3>
                        <p class="card-description">${escapeHtml(item.description || 'ไม่มีคำอธิบายเพิ่มเติม')}</p>
                        
                        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="card-url-link">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                            ${escapeHtml(item.url)}
                        </a>

                        <!-- Card Action Bar -->
                        <div class="card-actions">
                            <button class="status-toggle-btn ${isUse ? 'mark-notuse' : 'mark-use'}" onclick="toggleItemStatus('${item.id}')">
                                ${
                                    isUse
                                        ? `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg> เปลี่ยนเป็น "ไม่ใช้"`
                                        : `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> เปลี่ยนเป็น "ใช้"`
                                }
                            </button>

                            <button class="btn-icon-action" title="เปิดดู Preview" onclick="openPreviewModal('${escapeHtml(item.url)}', '${escapeHtml(item.title)}')">
                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            </button>

                            <button class="btn-icon-action delete" title="ลบรายการ" onclick="deleteItem('${item.id}')">
                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            })
            .join('');
    }

    // --- Helpers: Escape HTML ---
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- Filter Handlers ---
    filterButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            filterButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderGrid();
        });
    });

    // --- Search Handler ---
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderGrid();
    });

    // --- Modal Controls ---
    function openModal(modal) {
        modal.style.display = 'flex';
    }

    function closeModal(modal) {
        modal.style.display = 'none';
        if (modal === previewModal) {
            previewIframe.src = '';
        }
    }

    openAddModalBtn.addEventListener('click', () => openModal(addModal));
    closeAddModalBtn.addEventListener('click', () => closeModal(addModal));
    cancelAddBtn.addEventListener('click', () => closeModal(addModal));
    closePreviewModalBtn.addEventListener('click', () => closeModal(previewModal));

    // Close on outside backdrop click
    window.addEventListener('click', (e) => {
        if (e.target === addModal) closeModal(addModal);
        if (e.target === previewModal) closeModal(previewModal);
    });

    // --- Initialize ---
    initSupabase();
})();
