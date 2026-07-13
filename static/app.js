/**
 * 企业文档管理系统 - 前端逻辑
 */

// ==================== 全局状态 ====================
const state = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    currentView: 'all',
    currentFolderId: null, // 当前文件夹ID
    folderStack: [], // 文件夹导航栈
    viewMode: 'grid', // grid or list
    documents: [],
    users: [],
    categories: [],
    departments: [],
    userLevels: {},
    selectedDocument: null,
    comments: [],
    stats: null
};

// ==================== API 封装 ====================
const API_BASE = '';

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    if (state.token) {
        config.headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }
    
    try {
        const response = await fetch(url, config);
        
        if (response.status === 401) {
            // Token 过期，清除登录状态
            logout();
            return null;
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '请求失败');
        }
        
        return await response.json();
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// ==================== 认证相关 ====================
async function login(username, password) {
    const data = await apiRequest('/api/login', {
        method: 'POST',
        body: { username, password }
    });
    
    if (data) {
        state.token = data.access_token;
        state.user = data.user;
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return true;
    }
    return false;
}

function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showLoginPage();
}

async function changePassword(oldPassword, newPassword) {
    return await apiRequest(`/api/users/${state.user.id}/change-password`, {
        method: 'POST',
        body: { old_password: oldPassword, new_password: newPassword }
    });
}

// ==================== 用户管理 ====================
async function getUsers(filters = {}) {
    const params = new URLSearchParams();
    if (filters.department) params.append('department', filters.department);
    if (filters.level !== undefined) params.append('level', filters.level);
    
    const data = await apiRequest(`/api/users?${params}`);
    return data?.users || [];
}

async function createUser(userData) {
    return await apiRequest('/api/register', {
        method: 'POST',
        body: userData
    });
}

async function updateUser(userId, updates) {
    return await apiRequest(`/api/users/${userId}`, {
        method: 'PUT',
        body: updates
    });
}

async function getUserSubordinates(userId, recursive = false) {
    return await apiRequest(`/api/users/${userId}/subordinates?recursive=${recursive}`);
}

async function getUserSupervisors(userId) {
    return await apiRequest(`/api/users/${userId}/supervisors`);
}

// ==================== 文件夹管理 ====================
async function createFolder(folderData) {
    return await apiRequest('/api/folders', {
        method: 'POST',
        body: folderData
    });
}

async function getFolderContents(folderId) {
    const data = await apiRequest(`/api/folders/${folderId}/contents`);
    return data || { contents: [] };
}

async function uploadFolder(formData) {
    const url = `${API_BASE}/api/documents/upload-folder`;
    const config = {
        method: 'POST',
        headers: {}
    };

    if (state.token) {
        config.headers['Authorization'] = `Bearer ${state.token}`;
    }

    config.body = formData;

    const response = await fetch(url, config);

    if (response.status === 401) {
        logout();
        throw new Error('认证已过期，请重新登录');
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '上传失败');
    }

    return await response.json();
}

async function loadFolderOptions() {
    try {
        // 获取所有文件夹
        const documents = await getDocuments({});
        const folders = documents.filter(doc => doc.is_folder);

        const select = document.getElementById('folder-parent');
        // 清空现有选项（保留第一个选项）
        select.innerHTML = '<option value="">根目录</option>';

        // 添加文件夹选项
        folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.title;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('加载文件夹列表失败:', error);
    }
}

async function enterFolder(folderId, folderName) {
    // 将当前文件夹添加到导航栈
    if (state.currentFolderId !== null) {
        const currentFolder = state.documents.find(d => d.id === state.currentFolderId);
        if (currentFolder) {
            state.folderStack.push({
                id: state.currentFolderId,
                name: currentFolder.title
            });
        }
    }

    // 设置当前文件夹
    state.currentFolderId = folderId;

    // 更新页面标题和导航
    updateFolderNavigation(folderName);

    // 加载文件夹内容
    await loadDocuments();
}

function exitFolder(goToRoot = false) {
    if (goToRoot) {
        // 直接回到根目录
        state.currentFolderId = null;
        state.folderStack = [];
        updateFolderNavigation('根目录');
    } else if (state.folderStack.length > 0) {
        // 从导航栈弹出上一个文件夹
        const prevFolder = state.folderStack.pop();
        state.currentFolderId = prevFolder.id;
        updateFolderNavigation(prevFolder.name);
    } else {
        // 回到根目录
        state.currentFolderId = null;
        updateFolderNavigation('根目录');
    }

    // 重新加载文档
    loadDocuments();
}

function updateFolderNavigation(folderName) {
    // 更新页面标题
    let title = '全部文档';
    if (state.currentFolderId !== null) {
        title = `文件夹: ${folderName}`;
    }

    document.getElementById('page-title').textContent = title;

    // 更新面包屑导航
    const breadcrumbEl = document.getElementById('breadcrumb');
    if (state.currentFolderId === null) {
        // 根目录，隐藏面包屑
        breadcrumbEl.classList.add('hidden');
    } else {
        breadcrumbEl.classList.remove('hidden');

        // 构建面包屑HTML
        let breadcrumbHtml = '';

        // 根目录链接
        breadcrumbHtml += `
            <button class="flex items-center text-blue-600 hover:text-blue-800 breadcrumb-item" data-folder-id="">
                <i class="fas fa-home mr-1"></i>根目录
            </button>
        `;

        // 文件夹栈中的每个文件夹
        for (const folder of state.folderStack) {
            breadcrumbHtml += `
                <span class="mx-2 text-slate-400">/</span>
                <button class="flex items-center text-blue-600 hover:text-blue-800 breadcrumb-item" data-folder-id="${folder.id}">
                    <i class="fas fa-folder mr-1"></i>${folder.name}
                </button>
            `;
        }

        // 当前文件夹（不在栈中）
        if (folderName) {
            breadcrumbHtml += `
                <span class="mx-2 text-slate-400">/</span>
                <span class="flex items-center text-slate-700">
                    <i class="fas fa-folder-open mr-1"></i>${folderName}
                </span>
            `;
        }

        breadcrumbEl.innerHTML = breadcrumbHtml;

        // 为面包屑项添加点击事件
        breadcrumbEl.querySelectorAll('.breadcrumb-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const folderId = btn.getAttribute('data-folder-id');
                if (folderId === '') {
                    // 根目录
                    exitFolder(true); // 退出到根目录
                } else {
                    // 导航到指定文件夹
                    // 需要找到文件夹在栈中的位置
                    const index = state.folderStack.findIndex(f => f.id === folderId);
                    if (index !== -1) {
                        // 弹出到该位置
                        const targetFolder = state.folderStack[index];
                        // 弹出栈直到该位置
                        while (state.folderStack.length > index + 1) {
                            state.folderStack.pop();
                        }
                        // 设置当前文件夹
                        state.currentFolderId = targetFolder.id;
                        loadDocuments();
                        updateFolderNavigation(targetFolder.name);
                    }
                }
            });
        });
    }
}

// ==================== 文档管理 ====================
async function getDocuments(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.append('category', filters.category);
    if (filters.visibility) params.append('visibility', filters.visibility);
    if (filters.owner_id) params.append('owner_id', filters.owner_id);
    if (filters.parent_id !== undefined) params.append('parent_id', filters.parent_id);
    if (filters.search) params.append('search', filters.search);

    const data = await apiRequest(`/api/documents?${params}`);
    return data?.documents || [];
}

async function uploadDocument(formData) {
    const url = `${API_BASE}/api/documents/upload`;
    const config = {
        method: 'POST',
        headers: {}
    };
    
    if (state.token) {
        config.headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    config.body = formData;
    
    const response = await fetch(url, config);
    
    if (response.status === 401) {
        logout();
        throw new Error('认证已过期，请重新登录');
    }
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '上传失败');
    }
    
    return await response.json();
}

async function updateDocument(docId, updates) {
    return await apiRequest(`/api/documents/${docId}`, {
        method: 'PUT',
        body: updates
    });
}

async function deleteDocument(docId) {
    return await apiRequest(`/api/documents/${docId}`, {
        method: 'DELETE'
    });
}

async function downloadDocument(docId) {
    const url = `${API_BASE}/api/documents/${docId}/download`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });
        
        if (response.status === 401) {
            logout();
            throw new Error('认证已过期，请重新登录');
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '下载失败');
        }
        
        // 获取文件名 - 支持 filename* 格式
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'download';
        if (contentDisposition) {
            // 先尝试 filename*=UTF-8'' 格式
            const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
            if (filenameStarMatch) {
                filename = decodeURIComponent(filenameStarMatch[1]);
            } else {
                // 再尝试 filename="..." 格式
                const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
        }
        
        // 下载文件
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        showToast('下载成功', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

async function previewDocument(docId) {
    const url = `${API_BASE}/api/documents/${docId}/preview`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });
        
        if (response.status === 401) {
            logout();
            throw new Error('认证已过期，请重新登录');
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '预览失败');
        }
        
        const blob = await response.blob();
        const previewUrl = window.URL.createObjectURL(blob);
        window.open(previewUrl, '_blank');
        
        // 延迟释放URL对象
        setTimeout(() => {
            window.URL.revokeObjectURL(previewUrl);
        }, 60000);
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// ==================== 批复系统 ====================
async function getComments(documentId) {
    const data = await apiRequest(`/api/comments/document/${documentId}`);
    return data?.comments || [];
}

async function createComment(documentId, content, mentions = []) {
    return await apiRequest('/api/comments', {
        method: 'POST',
        body: { document_id: documentId, content, mentions }
    });
}

async function updateCommentStatus(commentId, status) {
    const url = `${API_BASE}/api/comments/${commentId}`;
    const formData = new FormData();
    formData.append('status', status);
    
    const config = {
        method: 'PUT',
        headers: {}
    };
    
    if (state.token) {
        config.headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    config.body = formData;
    
    const response = await fetch(url, config);
    
    if (response.status === 401) {
        logout();
        throw new Error('认证已过期，请重新登录');
    }
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '更新失败');
    }
    
    return await response.json();
}

// ==================== 系统信息 ====================
async function getCategories() {
    const data = await apiRequest('/api/categories');
    return data?.categories || [];
}

async function getUserLevels() {
    const data = await apiRequest('/api/user/levels');
    return data?.levels || {};
}

async function getDepartments() {
    const data = await apiRequest('/api/user/departments');
    return data?.departments || [];
}

async function getStats() {
    return await apiRequest('/api/stats');
}

async function getCurrentUser() {
    return await apiRequest('/api/me');
}

// ==================== UI 工具函数 ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const colors = {
        info: 'bg-blue-500',
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500'
    };
    
    const icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle'
    };
    
    toast.className = `toast ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 min-w-[250px]`;
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span class="flex-1">${message}</span>
        <button class="text-white/80 hover:text-white"><i class="fas fa-times"></i></button>
    `;
    
    toast.querySelector('button').addEventListener('click', () => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    });
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getFileIconClass(docOrFilename) {
    // 支持文档对象或文件名字符串
    const isFolder = typeof docOrFilename === 'object' && docOrFilename.is_folder;
    const filename = typeof docOrFilename === 'object' ? docOrFilename.original_filename || '' : docOrFilename;

    if (isFolder) {
        return 'folder';
    }

    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        pdf: 'pdf',
        doc: 'doc', docx: 'doc',
        xls: 'xls', xlsx: 'xls',
        ppt: 'ppt', pptx: 'ppt',
        jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', webp: 'image',
        zip: 'zip', rar: 'zip', '7z': 'zip',
        txt: 'default',
        mp4: 'default', avi: 'default', mov: 'default',
        mp3: 'default', wav: 'default'
    };
    return iconMap[ext] || 'default';
}

function getFileIconHtml(docOrFilename) {
    // 支持文档对象或文件名字符串
    const isFolder = typeof docOrFilename === 'object' && docOrFilename.is_folder;
    const filename = typeof docOrFilename === 'object' ? docOrFilename.original_filename || '' : docOrFilename;

    if (isFolder) {
        return `<i class="fas fa-folder text-amber-500"></i>`;
    }

    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        pdf: 'fa-file-pdf',
        doc: 'fa-file-word', docx: 'fa-file-word',
        xls: 'fa-file-excel', xlsx: 'fa-file-excel',
        ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
        jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image', gif: 'fa-file-image',
        zip: 'fa-file-archive', rar: 'fa-file-archive', '7z': 'fa-file-archive',
        txt: 'fa-file-alt',
        mp4: 'fa-file-video', avi: 'fa-file-video', mov: 'fa-file-video',
        mp3: 'fa-file-audio', wav: 'fa-file-audio'
    };
    const iconClass = iconMap[ext] || 'fa-file';
    return `<i class="fas ${iconClass}"></i>`;
}

function getVisibilityBadge(visibility) {
    const badges = {
        public: { class: 'badge-public', text: '公开', icon: 'fa-globe' },
        department: { class: 'badge-department', text: '部门', icon: 'fa-building' },
        private: { class: 'badge-private', text: '私有', icon: 'fa-lock' }
    };
    const badge = badges[visibility] || badges.private;
    return `<span class="badge ${badge.class}"><i class="fas ${badge.icon} mr-1"></i>${badge.text}</span>`;
}

function getLevelBadge(level) {
    const levelNames = {
        0: '系统管理员',
        1: '部门主管',
        2: '普通员工',
        3: '访客'
    };
    return `<span class="level-badge level-${level}">${levelNames[level] || '未知'}</span>`;
}

// ==================== 页面切换 ====================
function showLoginPage() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    // 更新用户信息
    updateUserInfo();
    
    // 加载初始数据
    loadInitialData();
}

function updateUserInfo() {
    if (!state.user) return;
    
    const levelNames = {
        0: '系统管理员',
        1: '部门主管',
        2: '普通员工',
        3: '访客'
    };
    
    document.getElementById('user-info-display').textContent = 
        `${state.user.name} · ${state.user.department} · ${levelNames[state.user.level]}`;
    document.getElementById('user-name-display').textContent = state.user.name;
    document.getElementById('user-avatar-initial').textContent = state.user.name.charAt(0).toUpperCase();
    document.getElementById('dropdown-user-name').textContent = state.user.name;
    document.getElementById('dropdown-user-role').textContent = levelNames[state.user.level];
    
    // 根据权限显示/隐藏功能
    if (state.user.level <= 1) {
        document.getElementById('nav-users').classList.remove('hidden');
    }
}

// ==================== 数据加载 ====================
async function loadInitialData() {
    try {
        // 并行加载基础数据
        const [categories, levels, departments, stats] = await Promise.all([
            getCategories(),
            getUserLevels(),
            getDepartments(),
            getStats()
        ]);
        
        state.categories = categories;
        state.userLevels = levels;
        state.departments = departments;
        state.stats = stats;
        
        // 更新分类列表
        updateCategoryList();
        
        // 更新筛选器
        updateFilters();
        
        // 更新统计
        updateStats();
        
        // 加载文档
        await loadDocuments();
        
        // 加载用户列表（如果有权限）
        if (state.user.level <= 1) {
            await loadUsers();
        }
        
    } catch (error) {
        console.error('加载初始数据失败:', error);
    }
}

async function loadDocuments() {
    const filters = {};
    
    // 根据当前视图添加筛选
    if (state.currentView === 'my') {
        filters.owner_id = state.user.id;
    } else if (state.currentView === 'department') {
        filters.visibility = 'department';
    } else if (state.currentView === 'public') {
        filters.visibility = 'public';
    } else if (state.categories.includes(state.currentView)) {
        filters.category = state.currentView;
    }

    // 添加文件夹过滤
    if (state.currentFolderId !== null) {
        filters.parent_id = state.currentFolderId;
    } else {
        // 根目录：parent_id为空
        filters.parent_id = '';
    }

    // 添加筛选器条件
    const visibilityFilter = document.getElementById('filter-visibility');
    if (visibilityFilter.value) {
        filters.visibility = visibilityFilter.value;
    }
    
    const categoryFilter = document.getElementById('filter-category');
    if (categoryFilter.value) {
        filters.category = categoryFilter.value;
    }
    
    const searchFilter = document.getElementById('global-search');
    if (searchFilter.value) {
        filters.search = searchFilter.value;
    }
    
    state.documents = await getDocuments(filters);
    renderDocuments();
}

async function loadUsers() {
    state.users = await getUsers();
    renderUsers();
}

function updateCategoryList() {
    const container = document.getElementById('category-list');
    container.innerHTML = state.categories.map(cat => `
        <button class="nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-sm" data-view="${cat}">
            <i class="fas fa-tag w-5 text-center text-slate-400"></i>
            <span>${cat}</span>
        </button>
    `).join('');
    
    // 重新绑定事件
    bindNavEvents();
}

function updateFilters() {
    // 更新分类筛选
    const categorySelect = document.getElementById('filter-category');
    categorySelect.innerHTML = '<option value="">所有分类</option>' + 
        state.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    // 更新上传表单中的分类
    const uploadCategory = document.querySelector('select[name="category"]');
    if (uploadCategory) {
        uploadCategory.innerHTML = state.categories.map(cat => 
            `<option value="${cat}">${cat}</option>`
        ).join('');
    }
    
    // 更新部门选择
    const deptSelect = document.querySelector('select[name="department"]');
    if (deptSelect) {
        deptSelect.innerHTML = state.departments.map(dept => 
            `<option value="${dept}">${dept}</option>`
        ).join('');
    }
}

function updateStats() {
    if (!state.stats) return;
    
    document.getElementById('stat-documents').textContent = state.stats.total_documents;
    document.getElementById('stat-users').textContent = state.stats.total_users;
    
    document.getElementById('stat-total-docs').textContent = state.stats.total_documents;
    document.getElementById('stat-total-users').textContent = state.stats.total_users;
    document.getElementById('stat-total-comments').textContent = state.stats.total_comments;
    document.getElementById('stat-storage').textContent = formatFileSize(state.stats.storage_used);
    
    // 分类统计
    const categoryStats = document.getElementById('category-stats');
    const catData = state.stats.documents_by_category || {};
    const total = state.stats.total_documents || 1;
    
    categoryStats.innerHTML = Object.entries(catData).map(([cat, count]) => {
        const percent = (count / total * 100).toFixed(1);
        return `
            <div>
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-slate-600">${cat}</span>
                    <span class="font-medium">${count}</span>
                </div>
                <div class="stat-bar">
                    <div class="stat-bar-fill bg-blue-500" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // 可见性统计
    const visibilityStats = document.getElementById('visibility-stats');
    const visData = state.stats.documents_by_visibility || {};
    const visColors = { public: 'bg-green-500', department: 'bg-blue-500', private: 'bg-red-500' };
    const visNames = { public: '公开', department: '部门', private: '私有' };
    
    visibilityStats.innerHTML = Object.entries(visData).map(([vis, count]) => {
        const percent = (count / total * 100).toFixed(1);
        return `
            <div>
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-slate-600">${visNames[vis] || vis}</span>
                    <span class="font-medium">${count}</span>
                </div>
                <div class="stat-bar">
                    <div class="stat-bar-fill ${visColors[vis] || 'bg-slate-500'}" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== 渲染函数 ====================
function renderDocuments() {
    const gridContainer = document.getElementById('documents-grid');
    const listContainer = document.getElementById('documents-list-body');
    const emptyState = document.getElementById('empty-state');
    
    if (state.documents.length === 0) {
        gridContainer.innerHTML = '';
        listContainer.innerHTML = '';
        emptyState.classList.remove('hidden');
        document.getElementById('documents-list').classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // 渲染网格视图
    gridContainer.innerHTML = state.documents.map(doc => `
        <div class="document-card bg-white rounded-xl shadow-card border border-slate-200 overflow-hidden cursor-pointer ${state.selectedDocument?.id === doc.id ? 'selected' : ''}" 
             data-id="${doc.id}">
            <div class="p-4">
                <div class="flex items-start justify-between mb-3">
                    <div class="file-icon ${getFileIconClass(doc)}">
                        ${getFileIconHtml(doc)}
                    </div>
                    ${getVisibilityBadge(doc.visibility)}
                </div>
                
                <h4 class="font-semibold text-slate-800 mb-1 truncate" title="${doc.title}">${doc.title}</h4>
                <p class="text-sm text-slate-500 mb-3 line-clamp-2">${doc.description || '无描述'}</p>
                
                <div class="flex items-center justify-between text-xs text-slate-400">
                    <span>${doc.owner_name}</span>
                    <span>${formatDate(doc.updated_at)}</span>
                </div>
                
                <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <span class="text-xs text-slate-500">${doc.is_folder ? '文件夹' : formatFileSize(doc.file_size)}</span>
                    <div class="flex space-x-2">
                        <button class="btn-preview text-blue-600 hover:text-blue-800 p-1" title="预览">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-download text-green-600 hover:text-green-800 p-1" title="下载">
                            <i class="fas fa-download"></i>
                        </button>
                        ${canEditDocument(doc) ? `
                        <button class="btn-edit text-amber-600 hover:text-amber-800 p-1" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        ` : ''}
                        ${canDeleteDocument(doc) ? `
                        <button class="btn-delete text-red-600 hover:text-red-800 p-1" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    // 渲染列表视图
    listContainer.innerHTML = state.documents.map(doc => `
        <tr class="border-b border-slate-100 hover:bg-slate-50" data-id="${doc.id}">
            <td class="px-4 py-3">
                <div class="flex items-center space-x-3">
                    <div class="file-icon ${getFileIconClass(doc)}" style="width: 36px; height: 36px; font-size: 14px;">
                        ${getFileIconHtml(doc)}
                    </div>
                    <div>
                        <p class="font-medium text-slate-800">${doc.title}</p>
                        <p class="text-xs text-slate-500">${doc.is_folder ? '文件夹' : doc.original_filename}</p>
                    </div>
                </div>
            </td>
            <td class="px-4 py-3">
                <span class="text-sm text-slate-600">${doc.category}</span>
            </td>
            <td class="px-4 py-3">
                ${getVisibilityBadge(doc.visibility)}
            </td>
            <td class="px-4 py-3">
                <div class="flex items-center space-x-2">
                    <span class="text-sm text-slate-600">${doc.owner_name}</span>
                </div>
            </td>
            <td class="px-4 py-3">
                <span class="text-sm text-slate-500">${formatDate(doc.updated_at)}</span>
            </td>
            <td class="px-4 py-3 text-right">
                <div class="flex justify-end space-x-1">
                    <button class="btn-preview text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50" title="预览">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-download text-green-600 hover:text-green-800 p-1.5 rounded hover:bg-green-50" title="下载">
                        <i class="fas fa-download"></i>
                    </button>
                    ${canEditDocument(doc) ? `
                    <button class="btn-edit text-amber-600 hover:text-amber-800 p-1.5 rounded hover:bg-amber-50" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    ` : ''}
                    ${canDeleteDocument(doc) ? `
                    <button class="btn-delete text-red-600 hover:text-red-800 p-1.5 rounded hover:bg-red-50" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
    
    // 绑定事件
    bindDocumentEvents();
}

function renderUsers() {
    const tbody = document.getElementById('users-list-body');
    
    tbody.innerHTML = state.users.map(user => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center">
                        <span class="text-white font-bold">${user.name.charAt(0)}</span>
                    </div>
                    <div>
                        <p class="font-medium text-slate-800">${user.name}</p>
                        <p class="text-xs text-slate-500">${user.username} · ${user.employee_id}</p>
                    </div>
                </div>
            </td>
            <td class="px-4 py-3">
                <span class="text-sm text-slate-600">${user.department}</span>
            </td>
            <td class="px-4 py-3">
                ${getLevelBadge(user.level)}
            </td>
            <td class="px-4 py-3">
                <span class="status-indicator ${user.is_active ? 'status-active' : 'status-inactive'}"></span>
                <span class="text-sm text-slate-600 ml-1">${user.is_active ? '正常' : '禁用'}</span>
            </td>
            <td class="px-4 py-3 text-right">
                <button class="btn-edit-user text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50" data-id="${user.id}">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderComments() {
    const container = document.getElementById('comments-list');
    const inputArea = document.getElementById('comment-input-area');
    
    if (!state.selectedDocument) {
        container.innerHTML = `
            <div class="text-center text-slate-400 py-10">
                <i class="fas fa-comments text-4xl mb-3"></i>
                <p>请选择文档查看批复</p>
            </div>
        `;
        inputArea.classList.add('hidden');
        return;
    }
    
    inputArea.classList.remove('hidden');
    
    if (state.comments.length === 0) {
        container.innerHTML = `
            <div class="text-center text-slate-400 py-10">
                <i class="fas fa-comment-slash text-4xl mb-3"></i>
                <p>暂无批复</p>
                <p class="text-sm mt-1">添加第一条批复</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.comments.map(comment => {
        const isOwn = comment.user_id === state.user.id;
        const mentionsHtml = comment.mentions?.length > 0 
            ? `<p class="text-xs text-slate-400 mt-1">提及: ${comment.mentions.map(id => {
                const user = state.users.find(u => u.id === id);
                return user ? `@${user.name}` : '';
            }).filter(Boolean).join(', ')}</p>` 
            : '';
        
        return `
            <div class="comment-bubble ${isOwn ? 'own' : ''}">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <span class="font-medium text-sm ${isOwn ? 'text-blue-700' : 'text-slate-700'}">${comment.user_name}</span>
                        ${getLevelBadge(comment.user_level)}
                    </div>
                    <span class="text-xs text-slate-400">${formatDate(comment.created_at)}</span>
                </div>
                <p class="text-sm text-slate-700">${highlightMentions(comment.content)}</p>
                ${mentionsHtml}
                <div class="mt-2 flex items-center space-x-2">
                    <span class="text-xs px-2 py-0.5 rounded ${comment.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
                        ${comment.status === 'resolved' ? '已解决' : '待处理'}
                    </span>
                    ${canManageComment(comment) ? `
                    <button class="btn-toggle-status text-xs text-blue-600 hover:text-blue-800" data-id="${comment.id}" data-status="${comment.status === 'resolved' ? 'pending' : 'resolved'}">
                        ${comment.status === 'resolved' ? '标记待处理' : '标记已解决'}
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // 绑定批复事件
    container.querySelectorAll('.btn-toggle-status').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const commentId = e.target.dataset.id;
            const newStatus = e.target.dataset.status;
            await updateCommentStatus(commentId, newStatus);
            await refreshComments();
        });
    });
}

function highlightMentions(content) {
    return content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

// ==================== 权限检查 ====================
function canEditDocument(doc) {
    if (state.user.level === 0) return true;
    if (doc.owner_id === state.user.id) return true;
    if (state.user.level === 1 && doc.owner_department === state.user.department) return true;
    return false;
}

function canDeleteDocument(doc) {
    if (state.user.level === 0) return true;
    if (doc.owner_id === state.user.id) return true;
    if (state.user.level === 1 && doc.owner_department === state.user.department) return true;
    return false;
}

function canManageComment(comment) {
    if (state.user.level === 0) return true;
    if (comment.user_id === state.user.id) return true;
    if (state.selectedDocument && state.selectedDocument.owner_id === state.user.id) return true;
    return false;
}

// ==================== 事件绑定 ====================
function bindNavEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            // 移除所有激活状态
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const view = item.dataset.view;
            state.currentView = view;
            
            // 隐藏所有视图
            document.getElementById('documents-grid').classList.add('hidden');
            document.getElementById('documents-list').classList.add('hidden');
            document.getElementById('users-view').classList.add('hidden');
            document.getElementById('stats-view').classList.add('hidden');
            document.getElementById('empty-state').classList.add('hidden');
            
            // 更新标题
            const titles = {
                'all': '全部文档',
                'my': '我的文档',
                'department': '部门文档',
                'public': '公开文档',
                'users': '用户管理',
                'stats': '统计报表'
            };
            document.getElementById('page-title').textContent = titles[view] || view;
            
            if (view === 'users') {
                document.getElementById('users-view').classList.remove('hidden');
                await loadUsers();
            } else if (view === 'stats') {
                document.getElementById('stats-view').classList.remove('hidden');
                state.stats = await getStats();
                updateStats();
            } else {
                // 显示文档视图
                if (state.viewMode === 'grid') {
                    document.getElementById('documents-grid').classList.remove('hidden');
                } else {
                    document.getElementById('documents-list').classList.remove('hidden');
                }
                await loadDocuments();
            }
        });
    });
}

function bindDocumentEvents() {
    // 文档卡片点击
    document.querySelectorAll('.document-card, #documents-list-body tr').forEach(el => {
        el.addEventListener('click', async (e) => {
            // 如果点击的是按钮，不触发选择
            if (e.target.closest('button')) return;

            const docId = el.dataset.id;
            const doc = state.documents.find(d => d.id === docId);

            // 如果是文件夹，进入文件夹
            if (doc && doc.is_folder) {
                await enterFolder(docId, doc.title);
            } else {
                // 否则选择文档
                state.selectedDocument = doc;

                // 更新选中状态
                document.querySelectorAll('.document-card').forEach(c => c.classList.remove('selected'));
                document.querySelector(`.document-card[data-id="${docId}"]`)?.classList.add('selected');

                // 加载批复
                await refreshComments();
            }
        });
    });
    
    // 预览按钮
    document.querySelectorAll('.btn-preview').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            previewDocument(docId);
        });
    });
    
    // 下载按钮
    document.querySelectorAll('.btn-download').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            downloadDocument(docId);
        });
    });
    
    // 编辑按钮
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            showEditDocumentModal(docId);
        });
    });
    
    // 删除按钮
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            const doc = state.documents.find(d => d.id === docId);
            
            if (confirm(`确定要删除文档 "${doc.title}" 吗？此操作不可恢复。`)) {
                await deleteDocument(docId);
                showToast('文档已删除', 'success');
                await loadDocuments();
            }
        });
    });
}

async function refreshComments() {
    if (state.selectedDocument) {
        const data = await getComments(state.selectedDocument.id);
        state.comments = data;
        renderComments();
    }
}

// ==================== 模态框 ====================
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function showEditDocumentModal(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;
    
    // 可以扩展为编辑模态框
    showToast('编辑功能开发中...', 'info');
}

// ==================== 初始化 ====================
function init() {
    // 检查登录状态
    if (state.token && state.user) {
        showMainApp();
    } else {
        showLoginPage();
    }
    
    // 登录表单
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        try {
            const success = await login(username, password);
            if (success) {
                showToast('登录成功', 'success');
                showMainApp();
            }
        } catch (error) {
            // 错误已在 apiRequest 中处理
        }
    });
    
    // 用户菜单
    document.getElementById('user-menu-btn').addEventListener('click', () => {
        document.getElementById('user-dropdown').classList.toggle('hidden');
    });
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#user-menu-container')) {
            document.getElementById('user-dropdown').classList.add('hidden');
        }
    });
    
    // 退出登录
    document.getElementById('menu-logout').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
        showToast('已退出登录', 'info');
    });
    
    // 修改密码
    document.getElementById('menu-change-password').addEventListener('click', (e) => {
        e.preventDefault();
        showModal('change-password-modal');
    });
    
    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const oldPassword = formData.get('old_password');
        const newPassword = formData.get('new_password');
        const confirmPassword = formData.get('confirm_password');
        
        if (newPassword !== confirmPassword) {
            showToast('两次输入的新密码不一致', 'error');
            return;
        }
        
        try {
            await changePassword(oldPassword, newPassword);
            showToast('密码修改成功', 'success');
            hideModal('change-password-modal');
            e.target.reset();
        } catch (error) {
            // 错误已处理
        }
    });
    
    // 关闭模态框
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.fixed').classList.add('hidden');
            btn.closest('.fixed').classList.remove('flex');
        });
    });
    
    // 视图切换
    document.getElementById('view-grid').addEventListener('click', () => {
        state.viewMode = 'grid';
        document.getElementById('view-grid').classList.add('bg-white', 'shadow-sm', 'text-slate-700');
        document.getElementById('view-grid').classList.remove('text-slate-500');
        document.getElementById('view-list').classList.remove('bg-white', 'shadow-sm', 'text-slate-700');
        document.getElementById('view-list').classList.add('text-slate-500');
        document.getElementById('documents-grid').classList.remove('hidden');
        document.getElementById('documents-list').classList.add('hidden');
    });
    
    document.getElementById('view-list').addEventListener('click', () => {
        state.viewMode = 'list';
        document.getElementById('view-list').classList.add('bg-white', 'shadow-sm', 'text-slate-700');
        document.getElementById('view-list').classList.remove('text-slate-500');
        document.getElementById('view-grid').classList.remove('bg-white', 'shadow-sm', 'text-slate-700');
        document.getElementById('view-grid').classList.add('text-slate-500');
        document.getElementById('documents-list').classList.remove('hidden');
        document.getElementById('documents-grid').classList.add('hidden');
    });
    
    // 上传按钮
    document.getElementById('btn-upload').addEventListener('click', () => {
        showModal('upload-modal');
    });

    // 新建文件夹按钮
    document.getElementById('btn-new-folder').addEventListener('click', () => {
        // 加载文件夹列表到父文件夹选择器
        loadFolderOptions();
        showModal('new-folder-modal');
    });

    // 上传文件夹按钮
    document.getElementById('btn-upload-folder').addEventListener('click', () => {
        // 加载文件夹列表到父文件夹选择器
        loadFolderOptions();
        showModal('upload-folder-modal');
    });

    // 拖拽上传
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('upload-file-input');
    let selectedFile = null;
    
    dropZone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            selectedFile = files[0];
            console.log('Dropped file:', selectedFile.name, selectedFile.type, selectedFile.size);
            updateSelectedFileName(selectedFile.name);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            selectedFile = files[0];
            console.log('Selected file:', selectedFile.name, selectedFile.type, selectedFile.size);
            updateSelectedFileName(selectedFile.name);
        }
    });
    
    function updateSelectedFileName(name) {
        const el = document.getElementById('selected-file-name');
        el.textContent = `已选择: ${name}`;
        el.classList.remove('hidden');
    }

    // 上传文件夹的拖拽和文件选择
    const folderDropZone = document.getElementById('folder-drop-zone');
    const folderFileInput = document.getElementById('upload-folder-input');

    folderDropZone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        folderFileInput.click();
    });

    folderDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        folderDropZone.classList.add('drag-over');
    });

    folderDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        folderDropZone.classList.remove('drag-over');
    });

    folderDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        folderDropZone.classList.remove('drag-over');

        const items = e.dataTransfer.items;
        const files = [];

        if (items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry();
                    if (entry && entry.isDirectory) {
                        // 处理目录
                        showToast('请使用文件选择按钮选择文件夹', 'warning');
                        return;
                    }
                }
            }
        }

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) {
            // 设置文件输入的文件
            const dataTransfer = new DataTransfer();
            for (let i = 0; i < droppedFiles.length; i++) {
                dataTransfer.items.add(droppedFiles[i]);
            }
            folderFileInput.files = dataTransfer.files;
            updateSelectedFolderInfo(droppedFiles);
        }
    });

    folderFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            updateSelectedFolderInfo(files);
        }
    });

    function updateSelectedFolderInfo(files) {
        const infoDiv = document.getElementById('selected-folder-info');
        const folderNameEl = document.getElementById('selected-folder-name');
        const filesCountEl = document.getElementById('selected-files-count');
        const filesListEl = document.getElementById('selected-files-list');

        // 显示文件夹信息
        if (files.length > 0) {
            // 尝试从文件路径中获取文件夹名
            let folderName = '选择的文件';
            if (files[0].webkitRelativePath) {
                const pathParts = files[0].webkitRelativePath.split('/');
                if (pathParts.length > 1) {
                    folderName = pathParts[0];
                }
            }

            folderNameEl.textContent = `文件夹: ${folderName}`;
            filesCountEl.textContent = `文件数量: ${files.length} 个`;

            // 显示前10个文件
            filesListEl.innerHTML = '';
            const maxFilesToShow = 10;
            for (let i = 0; i < Math.min(files.length, maxFilesToShow); i++) {
                const li = document.createElement('li');
                li.textContent = files[i].name;
                filesListEl.appendChild(li);
            }
            if (files.length > maxFilesToShow) {
                const li = document.createElement('li');
                li.textContent = `... 还有 ${files.length - maxFilesToShow} 个文件`;
                filesListEl.appendChild(li);
            }

            infoDiv.classList.remove('hidden');
        } else {
            infoDiv.classList.add('hidden');
        }
    }

    // 上传表单
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 获取表单数据
        const title = document.getElementById('upload-title').value.trim();
        const description = document.getElementById('upload-description').value.trim();
        const category = document.getElementById('upload-category').value;
        const visibility = document.getElementById('upload-visibility').value;
        
        // 检查标题
        if (!title) {
            showToast('请输入文档标题', 'error');
            return;
        }
        
        // 检查是否有文件
        const file = selectedFile;
        if (!file) {
            showToast('请选择要上传的文件', 'error');
            return;
        }
        
        console.log('Uploading file:', file.name, file.type, file.size);
        
        // 创建 FormData - 注意顺序，file 必须是最后一个字段
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('category', category);
        formData.append('visibility', visibility);
        formData.append('file', file, file.name);
        
        try {
            showToast('正在上传...', 'info');
            await uploadDocument(formData);
            showToast('文档上传成功', 'success');
            hideModal('upload-modal');
            
            // 重置表单
            document.getElementById('upload-form').reset();
            selectedFile = null;
            document.getElementById('selected-file-name').classList.add('hidden');
            
            await loadDocuments();
        } catch (error) {
            console.error('上传失败:', error);
        }
    });
    
    // 添加用户
    document.getElementById('btn-add-user').addEventListener('click', () => {
        showModal('add-user-modal');
    });
    
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const userData = {
            username: formData.get('username'),
            password: formData.get('password'),
            employee_id: formData.get('employee_id'),
            name: formData.get('name'),
            email: formData.get('email'),
            department: formData.get('department'),
            level: parseInt(formData.get('level')),
            role: formData.get('role')
        };
        
        try {
            await createUser(userData);
            showToast('用户创建成功', 'success');
            hideModal('add-user-modal');
            e.target.reset();
            await loadUsers();
        } catch (error) {
            // 错误已处理
        }
    });

    // 新建文件夹表单
    document.getElementById('new-folder-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('folder-name').value.trim();
        const description = document.getElementById('folder-description').value.trim();
        const category = document.getElementById('folder-category').value;
        const visibility = document.getElementById('folder-visibility').value;
        const parentId = document.getElementById('folder-parent').value || null;

        if (!title) {
            showToast('请输入文件夹名称', 'error');
            return;
        }

        try {
            showToast('正在创建文件夹...', 'info');
            await createFolder({
                title,
                description,
                category,
                visibility,
                is_folder: true,
                parent_id: parentId,
                folder_path: ''
            });

            showToast('文件夹创建成功', 'success');
            hideModal('new-folder-modal');
            e.target.reset();
            await loadDocuments();
        } catch (error) {
            // 错误已在 apiRequest 中处理
        }
    });

    // 上传文件夹表单
    document.getElementById('upload-folder-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const folderName = document.getElementById('upload-folder-name').value.trim();
        const description = document.getElementById('upload-folder-description').value.trim();
        const category = document.getElementById('upload-folder-category').value;
        const visibility = document.getElementById('upload-folder-visibility').value;
        const parentId = document.getElementById('upload-folder-parent').value || null;

        if (!folderName) {
            showToast('请输入文件夹名称', 'error');
            return;
        }

        // 检查是否有文件被选择
        const fileInput = document.getElementById('upload-folder-input');
        if (!fileInput.files || fileInput.files.length === 0) {
            showToast('请选择要上传的文件夹', 'error');
            return;
        }

        try {
            showToast('正在上传文件夹...', 'info');

            const formData = new FormData();
            formData.append('folder_name', folderName);
            formData.append('description', description);
            formData.append('category', category);
            formData.append('visibility', visibility);
            if (parentId) {
                formData.append('parent_id', parentId);
            }

            // 添加所有文件到FormData
            const files = fileInput.files;
            for (let i = 0; i < files.length; i++) {
                formData.append('files', files[i]);
                // 添加相对路径（如果可用）
                if (files[i].webkitRelativePath) {
                    formData.append('file_paths', files[i].webkitRelativePath);
                } else {
                    formData.append('file_paths', files[i].name);
                }
            }

            const result = await uploadFolder(formData);
            showToast(`文件夹上传成功，共${result.file_count}个文件`, 'success');
            hideModal('upload-folder-modal');
            e.target.reset();
            // 重置文件输入
            fileInput.value = '';
            document.getElementById('selected-folder-info').classList.add('hidden');
            await loadDocuments();
        } catch (error) {
            // 错误已在 apiRequest 中处理
        }
    });

    // 筛选器
    document.getElementById('filter-visibility').addEventListener('change', loadDocuments);
    document.getElementById('filter-category').addEventListener('change', loadDocuments);
    
    // 搜索
    let searchTimeout;
    document.getElementById('global-search').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadDocuments, 300);
    });
    
    // 提交批复
    document.getElementById('btn-submit-comment').addEventListener('click', async () => {
        const input = document.getElementById('comment-input');
        const content = input.value.trim();
        
        if (!content) {
            showToast('请输入批复内容', 'warning');
            return;
        }
        
        if (!state.selectedDocument) {
            showToast('请先选择文档', 'warning');
            return;
        }
        
        // 提取@提及
        const mentions = [];
        const mentionMatches = content.match(/@(\w+)/g);
        if (mentionMatches) {
            mentionMatches.forEach(match => {
                const username = match.substring(1);
                const user = state.users.find(u => u.username === username);
                if (user && !mentions.includes(user.id)) {
                    mentions.push(user.id);
                }
            });
        }
        
        try {
            await createComment(state.selectedDocument.id, content, mentions);
            showToast('批复已添加', 'success');
            input.value = '';
            await refreshComments();
        } catch (error) {
            // 错误已处理
        }
    });
    
    // 初始绑定导航事件
    bindNavEvents();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
