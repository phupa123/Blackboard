// BlackBoard - กระดานดำสัมพันธ์ ครั้งที่ 21 Library Logic
// Supports Realtime Supabase + Full CRUD (Add, Edit, Delete, Toggle Status, Preview)

(function () {
    // State
    let items = [];
    let currentFilter = 'all'; // 'all' | 'use' | 'not_use'
    let searchQuery = '';
    let supabase = null;

    // DOM Elements
    const gridContainer = document.getElementById('libraryGrid');
    const filterButtons = document.querySelectorAll('.filter-pill');
    const searchInput = document.getElementById('searchInput');
    const countAll = document.getElementById('countAll');
    const countUse = document.getElementById('countUse');
    const countNotUse = document.getElementById('countNotUse');
    const connectionStatus = document.getElementById('connectionStatus');
    const connectionText = document.getElementById('connectionText');

    // Add / Edit Modal
    const itemModal = document.getElementById('itemModal');
    const modalTitle = document.getElementById('modalTitle');
    const openAddModalBtn = document.getElementById('openAddModalBtn');
    const heroAddBtn = document.getElementById('heroAddBtn');
    const closeItemModalBtn = document.getElementById('closeItemModalBtn');
    const cancelItemBtn = document.getElementById('cancelItemBtn');
    const itemForm = document.getElementById('itemForm');
    const itemIdInput = document.getElementById('itemIdInput');

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

    // --- Helpers: Domain & Favicon ---
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

    // --- Supabase Init ---
    function initSupabase() {
        const config = window.SUPABASE_CONFIG || {};

        if (config.url && config.anonKey && window.supabase) {
            try {
                supabase = window.supabase.createClient(config.url, config.anonKey);
                setConnectionBadge('Supabase Live (เชื่อมต่อแล้ว)', true);
                fetchSupabaseData();
                subscribeToRealtime();
                return;
            } catch (err) {
                console.error('Supabase init error:', err);
                setConnectionBadge('เชื่อมต่อผิดพลาด', false);
                showErrorState('ไม่สามารถเชื่อมต่อ Supabase ได้: ' + err.message);
            }
        } else {
            setConnectionBadge('ยังไม่ได้ระบุ Config', false);
            showErrorState('กรุณาตรวจสอบการตั้งค่าใน js/config.js');
        }
    }

    function setConnectionBadge(text, isOnline) {
        if (connectionText) connectionText.textContent = text;
        if (connectionStatus) {
            const dot = connectionStatus.querySelector('.status-dot');
            if (dot) {
                dot.className = isOnline ? 'status-dot online' : 'status-dot demo';
            }
        }
    }

    function showErrorState(msg) {
        gridContainer.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; background: #ffffff; border: 1px dashed rgba(2, 132, 199, 0.4); border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); grid-column: 1 / -1;">
                <svg width="56" height="56" fill="none" stroke="#0284c7" viewBox="0 0 24 24" style="margin-bottom: 16px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <h3 style="font-size: 1.3rem; margin-bottom: 8px; color: #0f172a; font-weight: 800;">ไม่สามารถดึงข้อมูลจากตารางได้</h3>
                <p style="color: #475569; max-width: 500px; margin: 0 auto 16px;">${escapeHtml(msg)}</p>
                <p style="font-size: 0.88rem; color: #0284c7; font-weight: 600;">
                    💡 รันคำสั่งใน <code>database/schema.sql</code> ที่ Supabase SQL Editor เพื่อสร้างตาราง
                </p>
            </div>
        `;
    }

    // --- Realtime Sync ---
    function subscribeToRealtime() {
        if (!supabase) return;
        supabase
            .channel('public:items')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
                fetchSupabaseData();
            })
            .subscribe();
    }

    // --- Fetch Items ---
    async function fetchSupabaseData() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('items')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Fetch error:', error);
                showErrorState(error.message);
                return;
            }

            items = data || [];
            renderGrid();
        } catch (err) {
            console.error('Error fetching items:', err);
            showErrorState(err.message);
        }
    }

    // --- Status Toggle ---
    window.toggleItemStatus = async function (id) {
        const item = items.find((i) => i.id === id);
        if (!item || !supabase) return;

        const newStatus = item.status === 'use' ? 'not_use' : 'use';
        item.status = newStatus;
        renderGrid();

        const { error } = await supabase
            .from('items')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            alert('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message);
            fetchSupabaseData();
        }
    };

    // --- Edit Item Modal Open ---
    window.openEditModal = function (id) {
        const item = items.find((i) => i.id === id);
        if (!item) return;

        itemIdInput.value = item.id;
        inputTitle.value = item.title;
        inputUrl.value = item.url;
        inputCategory.value = item.category || 'AI & Tech';
        inputDesc.value = item.description || '';

        modalTitle.textContent = 'แก้ไขข้อมูลใน Library';
        updateModalPreview();

        openModal(itemModal);
    };

    // --- Delete Item ---
    window.deleteItem = async function (id) {
        if (!confirm('ยืนยันการลบรายการนี้ออกจาก Library?')) return;
        if (!supabase) return;

        items = items.filter((i) => i.id !== id);
        renderGrid();

        const { error } = await supabase
            .from('items')
            .delete()
            .eq('id', id);

        if (error) {
            alert('ลบรายการไม่สำเร็จ: ' + error.message);
            fetchSupabaseData();
        }
    };

    // --- Open Full Preview ---
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

        openModal(previewModal);
    };

    // --- Add or Update Item Form Submit ---
    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!supabase) {
            alert('ยังไม่ได้เชื่อมต่อฐานข้อมูล Supabase');
            return;
        }

        let rawUrl = inputUrl.value.trim();
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            rawUrl = 'https://' + rawUrl;
        }

        const editId = itemIdInput.value;
        const title = inputTitle.value.trim();
        const description = inputDesc.value.trim();
        const category = inputCategory.value || 'AI & Tech';

        const submitBtn = itemForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังบันทึก...';

        if (editId) {
            // Update Existing Item
            const { error } = await supabase
                .from('items')
                .update({
                    title: title,
                    url: rawUrl,
                    description: description,
                    category: category
                })
                .eq('id', editId);

            submitBtn.disabled = false;
            submitBtn.textContent = 'บันทึกการเปลี่ยนแปลง';

            if (error) {
                alert('เกิดข้อผิดพลาดในการแก้ไข: ' + error.message);
                return;
            }
        } else {
            // Insert New Item
            const { error } = await supabase
                .from('items')
                .insert([{
                    title: title,
                    url: rawUrl,
                    description: description,
                    category: category,
                    status: 'use'
                }]);

            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                บันทึกเข้า Library
            `;

            if (error) {
                alert('เกิดข้อผิดพลาดในการเพิ่มงาน: ' + error.message);
                return;
            }
        }

        closeModal(itemModal);
        itemForm.reset();
        itemIdInput.value = '';
        livePreviewContainer.style.display = 'none';
        await fetchSupabaseData();
    });

    // --- Live input preview ---
    function updateModalPreview() {
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
    }

    inputUrl.addEventListener('input', updateModalPreview);
    inputTitle.addEventListener('input', updateModalPreview);

    // --- Render Grid ---
    function renderGrid() {
        // Counts
        const totalCount = items.length;
        const useCount = items.filter((i) => i.status === 'use').length;
        const notUseCount = items.filter((i) => i.status === 'not_use').length;

        if (countAll) countAll.textContent = totalCount;
        if (countUse) countUse.textContent = useCount;
        if (countNotUse) countNotUse.textContent = notUseCount;

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
                <div style="text-align: center; padding: 70px 20px; background: #ffffff; border: 1px dashed rgba(2, 132, 199, 0.35); border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); grid-column: 1 / -1;">
                    <svg width="60" height="60" fill="none" stroke="#0284c7" viewBox="0 0 24 24" style="margin-bottom: 16px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                    <h3 style="font-size: 1.4rem; color: #0f172a; font-weight: 800; margin-bottom: 8px;">ยังไม่พบรายการในหมวดนี้</h3>
                    <p style="color: #475569; margin-bottom: 24px; max-width: 440px; margin-left: auto; margin-right: auto;">
                        เริ่มต้นเพิ่มงานและทรัพยากรชิ้นแรกของคุณ เพื่อให้ทีมสามารถเข้ามาคัดเลือกและใช้งานร่วมกันได้ทันที
                    </p>
                    <button class="btn-jump-primary" onclick="document.getElementById('openAddModalBtn').click()">
                        + เพิ่มงานชิ้นแรกเลย!
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
                <div class="jump-card status-${item.status}" id="card-${item.id}">
                    <!-- Card Banner Preview -->
                    <div class="jump-card-banner" onclick="openPreviewModal('${escapeHtml(item.url)}', '${escapeHtml(item.title)}')">
                        <div class="banner-center-info">
                            <img src="${favicon}" alt="Favicon" style="width: 46px; height: 46px; border-radius: 12px; margin-bottom: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.5);" onerror="this.src='https://via.placeholder.com/46?text=Web'">
                            <span class="banner-domain">${escapeHtml(domain)}</span>
                        </div>
                        <div class="jump-card-overlay">
                            <span class="jump-preview-btn">
                                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                ดูหน้า Preview
                            </span>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="jump-card-body">
                        <div class="jump-card-meta">
                            <span class="jump-tag-cat">${escapeHtml(item.category || 'AI & Tech')}</span>
                            <span class="jump-status-badge ${item.status}">
                                <span class="status-dot ${isUse ? 'online' : 'demo'}" style="width: 7px; height: 7px;"></span>
                                ${isUse ? 'ใช้ (Active)' : 'ไม่ใช้ (Archived)'}
                            </span>
                        </div>

                        <h3 class="jump-card-title">${escapeHtml(item.title)}</h3>
                        <p class="jump-card-desc">${escapeHtml(item.description || 'ไม่มีคำอธิบายเพิ่มเติม')}</p>

                        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="jump-card-link">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                            ${escapeHtml(item.url)}
                        </a>

                        <!-- Card Actions: Toggle, Edit, Delete, Preview -->
                        <div class="jump-card-actions">
                            <button class="btn-toggle-status ${isUse ? 'mark-notuse' : 'mark-use'}" onclick="toggleItemStatus('${item.id}')">
                                ${
                                    isUse
                                        ? `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg> เปลี่ยนเป็น "ไม่ใช้"`
                                        : `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> เปลี่ยนเป็น "ใช้"`
                                }
                            </button>

                            <!-- Edit Button -->
                            <button class="btn-action-icon edit" title="แก้ไขข้อมูล" onclick="openEditModal('${item.id}')">
                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>

                            <!-- Delete Button -->
                            <button class="btn-action-icon delete" title="ลบรายการ" onclick="deleteItem('${item.id}')">
                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            })
            .join('');

        // Trigger GSAP Card Entrance Animation
        animateCards();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- Filter Buttons ---
    filterButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            filterButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderGrid();
        });
    });

    // --- Search ---
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderGrid();
        });
    }

    // Modal Helpers with GSAP Animations
    function openModal(modal) {
        modal.style.display = 'flex';
        if (window.gsap) {
            const modalContent = modal.querySelector('.jump-modal');
            gsap.fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' });
            if (modalContent) {
                gsap.fromTo(
                    modalContent,
                    { scale: 0.92, y: 20, opacity: 0 },
                    { scale: 1, y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.4)' }
                );
            }
        }
    }

    function closeModal(modal) {
        if (window.gsap) {
            const modalContent = modal.querySelector('.jump-modal');
            gsap.to(modalContent || modal, {
                scale: 0.95,
                y: 10,
                opacity: 0,
                duration: 0.2,
                ease: 'power2.in',
                onComplete: () => {
                    modal.style.display = 'none';
                    if (modal === previewModal) {
                        previewIframe.src = '';
                    }
                }
            });
            gsap.to(modal, { opacity: 0, duration: 0.2 });
        } else {
            modal.style.display = 'none';
            if (modal === previewModal) {
                previewIframe.src = '';
            }
        }
    }

    // GSAP Page Intro & Artisanal Exhibition Grade Sequence
    function initAnimations() {
        if (!window.gsap) return;

        const curtain = document.getElementById('bb-intro-curtain');
        const counterEl = document.getElementById('bb-intro-counter');
        const statusText = document.getElementById('bb-intro-status-text');

        if (curtain && counterEl) {
            const tl = gsap.timeline();

            // Progress object for counter interpolation
            const progressTracker = { value: 0 };

            // Status message updates at key percentages
            const statusMessages = [
                { threshold: 15, text: 'AUTHENTICATING NETWORK ARCHIVE' },
                { threshold: 50, text: 'SYNCHRONIZING REPOSITORY DATABASE' },
                { threshold: 85, text: 'PREPARING EXHIBITION STAGE' },
                { threshold: 99, text: 'READY • WELCOME TO EDITION XXI' }
            ];

            // 1. Initial State
            gsap.set(['.bb-curtain-left', '.bb-curtain-right'], { xPercent: 0 });

            // 2. Entrance choreography
            tl.from('.bb-intro-core > *', {
                opacity: 0,
                y: 20,
                duration: 0.8,
                stagger: 0.15,
                ease: 'power3.out'
            })
            .from('.bb-emblem-img', {
                scale: 0.85,
                opacity: 0,
                duration: 1.2,
                ease: 'power2.out'
            }, '-=0.6')
            // Realistic Soft Light Sweep (Fade แสงนุ่มนวลจากซ้ายไปขวาบนผิวภาพตราสัญลักษณ์)
            .fromTo('.bb-light-sweep', 
                { xPercent: -100, opacity: 0 }, 
                { xPercent: 120, opacity: 0.85, duration: 1.4, ease: 'power2.inOut' }, 
                '-=0.7'
            )
            // Counter numbers running 00 -> 100%
            .to(progressTracker, {
                value: 100,
                duration: 1.8,
                ease: 'power2.inOut',
                onUpdate: () => {
                    const currentVal = Math.floor(progressTracker.value);
                    counterEl.textContent = currentVal < 10 ? `0${currentVal}` : `${currentVal}`;
                    
                    for (const s of statusMessages) {
                        if (currentVal >= s.threshold && statusText) {
                            statusText.textContent = s.text;
                        }
                    }
                }
            }, '-=0.8')
            // Breathing pause at 100%
            .to('.bb-intro-core', {
                opacity: 0,
                scale: 0.96,
                duration: 0.5,
                ease: 'power2.in',
                delay: 0.2
            })
            // 3. Cinematic Theater Dual Curtain Reveal (Split Left & Right)
            .to('.bb-curtain-left', {
                xPercent: -100,
                duration: 1.1,
                ease: 'power4.inOut'
            })
            .to('.bb-curtain-right', {
                xPercent: 100,
                duration: 1.1,
                ease: 'power4.inOut',
                onComplete: () => {
                    curtain.remove();
                }
            }, '<')
            // 4. Main Site Emerges
            .from('.jump-header', {
                y: -40,
                opacity: 0,
                duration: 0.7,
                ease: 'power3.out'
            }, '-=0.6')
            .from('.jump-hero', {
                scale: 0.94,
                y: 35,
                opacity: 0,
                duration: 0.9,
                ease: 'power3.out'
            }, '-=0.5')
            .from('.jump-hero-content > *', {
                y: 25,
                opacity: 0,
                duration: 0.6,
                stagger: 0.08,
                ease: 'power2.out'
            }, '-=0.4');
        } else {
            gsap.from('.jump-header', { y: -50, opacity: 0, duration: 0.8, ease: 'power3.out' });
            gsap.from('.jump-hero-content > *', { y: 30, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out', delay: 0.2 });
        }

        // Ambient Bubbles subtle GSAP float
        gsap.to('.cloud-bubble-1', {
            x: 60,
            y: 40,
            scale: 1.1,
            duration: 9,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut'
        });

        gsap.to('.cloud-bubble-2', {
            x: -50,
            y: -35,
            scale: 1.15,
            duration: 11,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut'
        });
    }

    // Animate Cards when rendered
    function animateCards() {
        if (!window.gsap) return;
        const cards = document.querySelectorAll('.jump-card');
        if (cards.length > 0) {
            gsap.fromTo(
                cards,
                { y: 25, opacity: 0, scale: 0.97 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 0.45,
                    stagger: 0.06,
                    ease: 'power2.out'
                }
            );
        }
    }

    // Modal Trigger Listeners
    function openAddModalHandler() {
        modalTitle.textContent = 'เพิ่มงาน / ทรัพยากรใหม่';
        itemForm.reset();
        itemIdInput.value = '';
        livePreviewContainer.style.display = 'none';
        openModal(itemModal);
    }

    const mobileHeaderAddBtn = document.getElementById('mobileHeaderAddBtn');
    const mobileFabBtn = document.getElementById('mobileFabBtn');

    if (openAddModalBtn) openAddModalBtn.addEventListener('click', openAddModalHandler);
    if (heroAddBtn) heroAddBtn.addEventListener('click', openAddModalHandler);
    if (mobileHeaderAddBtn) mobileHeaderAddBtn.addEventListener('click', openAddModalHandler);
    if (mobileFabBtn) mobileFabBtn.addEventListener('click', openAddModalHandler);
    if (closeItemModalBtn) closeItemModalBtn.addEventListener('click', () => closeModal(itemModal));
    if (cancelItemBtn) cancelItemBtn.addEventListener('click', () => closeModal(itemModal));
    if (closePreviewModalBtn) closePreviewModalBtn.addEventListener('click', () => closeModal(previewModal));

    window.addEventListener('click', (e) => {
        if (e.target === itemModal) closeModal(itemModal);
        if (e.target === previewModal) closeModal(previewModal);
    });

    // Init
    initSupabase();
    initAnimations();
})();
