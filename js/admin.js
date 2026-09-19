// BlackBoard Admin Portal Logic
// Handles Google OAuth Login, Admin Whitelist Verification, Item CRUD, and Admin Team Management

(function () {
    let supabase = null;
    let currentUser = null;
    let currentAdminRecord = null;
    let allItems = [];
    let allAdmins = [];
    let searchQuery = '';
    let isRealtimeSubscribed = false;

    // DOM Elements
    const authHeaderArea = document.getElementById('authHeaderArea');
    const loginSection = document.getElementById('loginSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const accessDeniedBox = document.getElementById('accessDeniedBox');
    const deniedEmailText = document.getElementById('deniedEmailText');
    const logoutDeniedBtn = document.getElementById('logoutDeniedBtn');

    // Dashboard Elements
    const adminGreetingEmail = document.getElementById('adminGreetingEmail');
    const adminCountBadge = document.getElementById('adminCountBadge');
    const statTotalItems = document.getElementById('statTotalItems');
    const statUseItems = document.getElementById('statUseItems');
    const statNotUseItems = document.getElementById('statNotUseItems');
    const adminSearchInput = document.getElementById('adminSearchInput');
    const adminItemsTableBody = document.getElementById('adminItemsTableBody');
    const adminAddNewBtn = document.getElementById('adminAddNewBtn');

    // Item Modal Elements
    const itemModalOverlay = document.getElementById('itemModalOverlay');
    const itemModalTitle = document.getElementById('itemModalTitle');
    const closeItemModalBtn = document.getElementById('closeItemModalBtn');
    const cancelItemModalBtn = document.getElementById('cancelItemModalBtn');
    const adminItemForm = document.getElementById('adminItemForm');
    const adminItemId = document.getElementById('adminItemId');
    const adminItemTitle = document.getElementById('adminItemTitle');
    const adminItemUrl = document.getElementById('adminItemUrl');
    const adminItemCategory = document.getElementById('adminItemCategory');
    const adminItemStatus = document.getElementById('adminItemStatus');
    const adminItemDesc = document.getElementById('adminItemDesc');

    // Admins Modal Elements
    const openAdminModalBtn = document.getElementById('openAdminModalBtn');
    const adminsModalOverlay = document.getElementById('adminsModalOverlay');
    const closeAdminsModalBtn = document.getElementById('closeAdminsModalBtn');
    const addAdminForm = document.getElementById('addAdminForm');
    const newAdminEmail = document.getElementById('newAdminEmail');
    const adminsListTableBody = document.getElementById('adminsListTableBody');

    // --- 1. Supabase Init ---
    function initSupabase() {
        const config = window.SUPABASE_CONFIG || {};
        if (config.url && config.anonKey && window.supabase) {
            supabase = window.supabase.createClient(config.url, config.anonKey);
            checkAuthState();
        } else {
            alert('ไม่พบการตั้งค่า Supabase ใน js/config.js');
        }
    }

    // --- 2. Auth State Handling ---
    async function checkAuthState() {
        const { data: { session } } = await supabase.auth.getSession();
        handleSession(session);

        // Listen for auth state changes
        supabase.auth.onAuthStateChange((_event, session) => {
            handleSession(session);
        });
    }

    async function handleSession(session) {
        if (!session || !session.user) {
            currentUser = null;
            currentAdminRecord = null;
            showLoginView();
            return;
        }

        currentUser = session.user;
        const userEmail = (currentUser.email || '').toLowerCase();

        // Verify if user is in 'admins' table
        const { data: adminData, error } = await supabase
            .from('admins')
            .select('*')
            .eq('email', userEmail)
            .maybeSingle();

        if (error) {
            console.error('Check admin error:', error);
        }

        // Auto-seed: If admins table is completely empty, allow the first logged in user to be Super Admin
        const { count } = await supabase
            .from('admins')
            .select('*', { count: 'exact', head: true });

        if (count === 0) {
            // First ever admin seed
            const { data: newSeed, error: seedErr } = await supabase
                .from('admins')
                .insert([{ email: userEmail, role: 'super_admin', added_by: 'System Seed' }])
                .select()
                .single();

            if (!seedErr) {
                currentAdminRecord = newSeed;
                showDashboardView();
                return;
            }
        }

        if (!adminData) {
            // User is authenticated via Google, but not in whitelist
            showAccessDenied(userEmail);
        } else {
            // Verified Admin
            currentAdminRecord = adminData;
            showDashboardView();
        }
    }

    function showLoginView() {
        loginSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
        accessDeniedBox.classList.add('hidden');
        authHeaderArea.innerHTML = `
            <button onclick="document.getElementById('googleLoginBtn').click()" class="text-xs px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold transition-all">
                เข้าสู่ระบบ (Gmail)
            </button>
        `;
    }

    function showAccessDenied(email) {
        loginSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
        accessDeniedBox.classList.remove('hidden');
        deniedEmailText.textContent = `อีเมลที่เข้าสู่ระบบ: ${email}`;
        authHeaderArea.innerHTML = `
            <button onclick="window.adminLogout()" class="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all">
                ออกจากระบบ
            </button>
        `;
    }

    function showDashboardView() {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        accessDeniedBox.classList.add('hidden');

        adminGreetingEmail.textContent = currentUser.email;

        // Render header user avatar & logout
        const userPhoto = currentUser.user_metadata?.avatar_url || '';
        authHeaderArea.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                    ${userPhoto ? `<img src="${userPhoto}" class="w-8 h-8 rounded-full border border-sky-400">` : ''}
                    <span class="text-xs text-slate-300 hidden md:inline font-mono">${escapeHtml(currentUser.email)}</span>
                </div>
                <button onclick="window.adminLogout()" class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700 transition-all">
                    ออกจากระบบ
                </button>
            </div>
        `;

        fetchDashboardData();
        fetchAdminsList();
        subscribeRealtime();
    }

    // --- 3. Google OAuth Login & Logout ---
    googleLoginBtn.addEventListener('click', async () => {
        try {
            // Determine exact current URL (e.g. https://blackboard.edspace.workers.dev/admin.html)
            const currentUrl = window.location.href.split('#')[0].split('?')[0];
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: currentUrl
                }
            });
            if (error) throw error;
        } catch (err) {
            alert('เกิดข้อผิดพลาดในการเข้าสู่ระบบ Google: ' + err.message);
        }
    });

    window.adminLogout = async function () {
        await supabase.auth.signOut();
        window.location.reload();
    };

    if (logoutDeniedBtn) {
        logoutDeniedBtn.addEventListener('click', window.adminLogout);
    }

    // --- 4. Fetch Items & Stats ---
    async function fetchDashboardData() {
        const { data, error } = await supabase
            .from('items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching items:', error);
            return;
        }

        allItems = data || [];
        renderStats();
        renderTable();
    }

    function renderStats() {
        const total = allItems.length;
        const use = allItems.filter(i => i.status === 'use').length;
        const notUse = allItems.filter(i => i.status === 'not_use').length;

        statTotalItems.textContent = total;
        statUseItems.textContent = use;
        statNotUseItems.textContent = notUse;
    }

    function renderTable() {
        let filtered = allItems;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(i => 
                i.title.toLowerCase().includes(q) ||
                (i.url && i.url.toLowerCase().includes(q)) ||
                (i.category && i.category.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            adminItemsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-12 text-center text-slate-400">
                        ไม่พบรายการงานในระบบ
                    </td>
                </tr>
            `;
            return;
        }

        adminItemsTableBody.innerHTML = filtered.map(item => {
            const isUse = item.status === 'use';
            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('th-TH') : '-';
            
            return `
                <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="py-4 px-6">
                        <div class="font-bold text-white mb-0.5">${escapeHtml(item.title)}</div>
                        <a href="${escapeHtml(item.url)}" target="_blank" class="text-xs text-sky-400 hover:underline flex items-center gap-1">
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                            ${escapeHtml(item.url)}
                        </a>
                    </td>
                    <td class="py-4 px-4">
                        <span class="px-2.5 py-1 rounded-full text-xs bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                            ${escapeHtml(item.category || 'AI & Tech')}
                        </span>
                    </td>
                    <td class="py-4 px-4">
                        <button onclick="window.adminToggleStatus('${item.id}', '${item.status}')" class="px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-all ${isUse ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'}">
                            <span class="w-1.5 h-1.5 rounded-full ${isUse ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}"></span>
                            ${isUse ? 'ใช้ (Active)' : 'ไม่ใช้ (Archived)'}
                        </button>
                    </td>
                    <td class="py-4 px-4 text-xs text-slate-400 font-mono">
                        ${dateStr}
                    </td>
                    <td class="py-4 px-6 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="window.adminEditItem('${item.id}')" title="แก้ไข" class="p-2 rounded-lg bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-400 transition-colors">
                                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onclick="window.adminDeleteItem('${item.id}', '${escapeHtml(item.title)}')" title="ลบ" class="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors">
                                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Toggle Status
    window.adminToggleStatus = async function (id, currentStatus) {
        const newStatus = currentStatus === 'use' ? 'not_use' : 'use';
        const { error } = await supabase
            .from('items')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            alert('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message);
        } else {
            fetchDashboardData();
        }
    };

    // Delete Item
    window.adminDeleteItem = async function (id, title) {
        if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการ: "${title}"?`)) return;

        const { error } = await supabase
            .from('items')
            .delete()
            .eq('id', id);

        if (error) {
            alert('ลบไม่สำเร็จ: ' + error.message);
        } else {
            fetchDashboardData();
        }
    };

    // Edit Item
    window.adminEditItem = function (id) {
        const item = allItems.find(i => i.id === id);
        if (!item) return;

        itemModalTitle.textContent = 'แก้ไขข้อมูลงาน / ทรัพยากร';
        adminItemId.value = item.id;
        adminItemTitle.value = item.title || '';
        adminItemUrl.value = item.url || '';
        adminItemCategory.value = item.category || 'AI & Tech';
        adminItemStatus.value = item.status || 'use';
        adminItemDesc.value = item.description || '';

        itemModalOverlay.classList.remove('hidden');
        itemModalOverlay.classList.add('flex');
    };

    // Add New Item Button
    adminAddNewBtn.addEventListener('click', () => {
        itemModalTitle.textContent = 'เพิ่มงาน / ทรัพยากรใหม่';
        adminItemForm.reset();
        adminItemId.value = '';
        itemModalOverlay.classList.remove('hidden');
        itemModalOverlay.classList.add('flex');
    });

    closeItemModalBtn.addEventListener('click', () => {
        itemModalOverlay.classList.add('hidden');
        itemModalOverlay.classList.remove('flex');
    });

    cancelItemModalBtn.addEventListener('click', () => {
        itemModalOverlay.classList.add('hidden');
        itemModalOverlay.classList.remove('flex');
    });

    // Save Item (Add or Update)
    adminItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = adminItemId.value;
        const title = adminItemTitle.value.trim();
        let url = adminItemUrl.value.trim();
        const category = adminItemCategory.value;
        const status = adminItemStatus.value;
        const description = adminItemDesc.value.trim();

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const submitBtn = document.getElementById('saveItemBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังบันทึก...';

        try {
            if (id) {
                // Update
                const { error } = await supabase
                    .from('items')
                    .update({ title, url, category, status, description })
                    .eq('id', id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase
                    .from('items')
                    .insert([{
                        title,
                        url,
                        category,
                        status,
                        description,
                        created_by: currentUser.email
                    }]);
                if (error) throw error;
            }

            itemModalOverlay.classList.add('hidden');
            itemModalOverlay.classList.remove('flex');
            fetchDashboardData();
        } catch (err) {
            alert('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'บันทึกข้อมูล';
        }
    });

    // --- 5. Manage Admins Team ---
    async function fetchAdminsList() {
        const { data, error } = await supabase
            .from('admins')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Fetch admins error:', error);
            return;
        }

        allAdmins = data || [];
        adminCountBadge.textContent = allAdmins.length;
        renderAdminsList();
    }

    function renderAdminsList() {
        if (allAdmins.length === 0) {
            adminsListTableBody.innerHTML = `
                <tr><td colspan="3" class="py-6 text-center text-slate-400">ยังไม่มีรายชื่อผู้ดูแล</td></tr>
            `;
            return;
        }

        adminsListTableBody.innerHTML = allAdmins.map(adm => {
            const isCurrentUser = currentUser && currentUser.email.toLowerCase() === adm.email.toLowerCase();
            return `
                <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="py-3 px-4">
                        <div class="font-bold text-white flex items-center gap-2">
                            ${escapeHtml(adm.email)}
                            ${isCurrentUser ? '<span class="text-[10px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full border border-sky-500/30">คุณ</span>' : ''}
                        </div>
                        <div class="text-[11px] text-slate-400">เพิ่มโดย: ${escapeHtml(adm.added_by || '-')}</div>
                    </td>
                    <td class="py-3 px-4">
                        <span class="text-xs uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            ${escapeHtml(adm.role || 'admin')}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-right">
                        ${isCurrentUser ? '<span class="text-xs text-slate-500">บัญชีปัจจุบัน</span>' : `
                            <button onclick="window.adminDeleteAdmin('${adm.id}', '${escapeHtml(adm.email)}')" class="text-xs text-rose-400 hover:text-rose-300 p-1.5 rounded hover:bg-rose-500/10">
                                ลบสิทธิ์
                            </button>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Add New Admin
    addAdminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = newAdminEmail.value.trim().toLowerCase();
        if (!email) return;

        const submitBtn = document.getElementById('submitNewAdminBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังเพิ่ม...';

        try {
            const { error } = await supabase
                .from('admins')
                .insert([{
                    email: email,
                    role: 'admin',
                    added_by: currentUser.email
                }]);

            if (error) throw error;

            newAdminEmail.value = '';
            alert(`เพิ่มอีเมล "${email}" เป็นผู้ดูแลเรียบร้อยแล้ว!`);
            fetchAdminsList();
        } catch (err) {
            alert('เพิ่มผู้ดูแลไม่สำเร็จ: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '+ เพิ่มผู้ดูแล';
        }
    });

    // Delete Admin
    window.adminDeleteAdmin = async function (id, email) {
        if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการถอดสิทธิ์ผู้ดูแลของ "${email}"?`)) return;

        const { error } = await supabase
            .from('admins')
            .delete()
            .eq('id', id);

        if (error) {
            alert('ถอดสิทธิ์ไม่สำเร็จ: ' + error.message);
        } else {
            fetchAdminsList();
        }
    };

    openAdminModalBtn.addEventListener('click', () => {
        adminsModalOverlay.classList.remove('hidden');
        adminsModalOverlay.classList.add('flex');
        fetchAdminsList();
    });

    closeAdminsModalBtn.addEventListener('click', () => {
        adminsModalOverlay.classList.add('hidden');
        adminsModalOverlay.classList.remove('flex');
    });

    // Realtime listener
    function subscribeRealtime() {
        if (isRealtimeSubscribed) return;
        isRealtimeSubscribed = true;

        supabase
            .channel('admin-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
                fetchDashboardData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admins' }, () => {
                fetchAdminsList();
            })
            .subscribe();
    }

    // Search filter
    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderTable();
        });
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

    // Init
    initSupabase();
})();
