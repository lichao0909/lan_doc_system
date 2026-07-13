/**
 * 浼佷笟鏂囨。绠＄悊绯荤粺 - 鍓嶇閫昏緫
 */

// ==================== 鍏ㄥ眬鐘舵€?====================
const state = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    currentView: 'all',
    currentFolderId: null, // 褰撳墠鏂囦欢澶笽D
    folderStack: [], // 鏂囦欢澶瑰鑸爤
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

// ==================== API 灏佽 ====================
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
            // Token 杩囨湡锛屾竻闄ょ櫥褰曠姸鎬?            logout();
            return null;
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '璇锋眰澶辫触');
        }
        
        return await response.json();
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// ==================== 璁よ瘉鐩稿叧 ====================
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

// ==================== 鐢ㄦ埛绠＄悊 ====================
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

// ==================== 鏂囦欢澶圭鐞?====================
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
        throw new Error('璁よ瘉宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?);
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '涓婁紶澶辫触');
    }

    return await response.json();
}

async function loadFolderOptions() {
    try {
        // 鑾峰彇鎵€鏈夋枃浠跺す
        const documents = await getDocuments({});
        const folders = documents.filter(doc => doc.is_folder);

        const select = document.getElementById('folder-parent');
        // 娓呯┖鐜版湁閫夐」锛堜繚鐣欑涓€涓€夐」锛?        select.innerHTML = '<option value="">鏍圭洰褰?/option>';

        // 娣诲姞鏂囦欢澶归€夐」
        folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.title;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('鍔犺浇鏂囦欢澶瑰垪琛ㄥけ璐?', error);
    }
}

async function enterFolder(folderId, folderName) {
    // 灏嗗綋鍓嶆枃浠跺す娣诲姞鍒板鑸爤
    if (state.currentFolderId !== null) {
        const currentFolder = state.documents.find(d => d.id === state.currentFolderId);
        if (currentFolder) {
            state.folderStack.push({
                id: state.currentFolderId,
                name: currentFolder.title
            });
        }
    }

    // 璁剧疆褰撳墠鏂囦欢澶?    state.currentFolderId = folderId;

    // 鏇存柊椤甸潰鏍囬鍜屽鑸?    updateFolderNavigation(folderName);

    // 鍔犺浇鏂囦欢澶瑰唴瀹?    await loadDocuments();
}

function exitFolder(goToRoot = false) {
    if (goToRoot) {
        // 鐩存帴鍥炲埌鏍圭洰褰?        state.currentFolderId = null;
        state.folderStack = [];
        updateFolderNavigation('鏍圭洰褰?);
    } else if (state.folderStack.length > 0) {
        // 浠庡鑸爤寮瑰嚭涓婁竴涓枃浠跺す
        const prevFolder = state.folderStack.pop();
        state.currentFolderId = prevFolder.id;
        updateFolderNavigation(prevFolder.name);
    } else {
        // 鍥炲埌鏍圭洰褰?        state.currentFolderId = null;
        updateFolderNavigation('鏍圭洰褰?);
    }

    // 閲嶆柊鍔犺浇鏂囨。
    loadDocuments();
}

function updateFolderNavigation(folderName) {
    // 鏇存柊椤甸潰鏍囬
    let title = '鍏ㄩ儴鏂囨。';
    if (state.currentFolderId !== null) {
        title = `鏂囦欢澶? ${folderName}`;
    }

    document.getElementById('page-title').textContent = title;

    // 鏇存柊闈㈠寘灞戝鑸?    const breadcrumbEl = document.getElementById('breadcrumb');
    if (state.currentFolderId === null) {
        // 鏍圭洰褰曪紝闅愯棌闈㈠寘灞?        breadcrumbEl.classList.add('hidden');
    } else {
        breadcrumbEl.classList.remove('hidden');

        // 鏋勫缓闈㈠寘灞慔TML
        let breadcrumbHtml = '';

        // 鏍圭洰褰曢摼鎺?        breadcrumbHtml += `
            <button class="flex items-center text-blue-600 hover:text-blue-800 breadcrumb-item" data-folder-id="">
                <i class="fas fa-home mr-1"></i>鏍圭洰褰?            </button>
        `;

        // 鏂囦欢澶规爤涓殑姣忎釜鏂囦欢澶?        for (const folder of state.folderStack) {
            breadcrumbHtml += `
                <span class="mx-2 text-slate-400">/</span>
                <button class="flex items-center text-blue-600 hover:text-blue-800 breadcrumb-item" data-folder-id="${folder.id}">
                    <i class="fas fa-folder mr-1"></i>${folder.name}
                </button>
            `;
        }

        // 褰撳墠鏂囦欢澶癸紙涓嶅湪鏍堜腑锛?        if (folderName) {
            breadcrumbHtml += `
                <span class="mx-2 text-slate-400">/</span>
                <span class="flex items-center text-slate-700">
                    <i class="fas fa-folder-open mr-1"></i>${folderName}
                </span>
            `;
        }

        breadcrumbEl.innerHTML = breadcrumbHtml;

        // 涓洪潰鍖呭睉椤规坊鍔犵偣鍑讳簨浠?        breadcrumbEl.querySelectorAll('.breadcrumb-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const folderId = btn.getAttribute('data-folder-id');
                if (folderId === '') {
                    // 鏍圭洰褰?                    exitFolder(true); // 閫€鍑哄埌鏍圭洰褰?                } else {
                    // 瀵艰埅鍒版寚瀹氭枃浠跺す
                    // 闇€瑕佹壘鍒版枃浠跺す鍦ㄦ爤涓殑浣嶇疆
                    const index = state.folderStack.findIndex(f => f.id === folderId);
                    if (index !== -1) {
                        // 寮瑰嚭鍒拌浣嶇疆
                        const targetFolder = state.folderStack[index];
                        // 寮瑰嚭鏍堢洿鍒拌浣嶇疆
                        while (state.folderStack.length > index + 1) {
                            state.folderStack.pop();
                        }
                        // 璁剧疆褰撳墠鏂囦欢澶?                        state.currentFolderId = targetFolder.id;
                        loadDocuments();
                        updateFolderNavigation(targetFolder.name);
                    }
                }
            });
        });
    }
}

// ==================== 鏂囨。绠＄悊 ====================
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

// ==================== 改进的文档上传 ====================
// 带进度条的上传函数
async function uploadDocumentWithProgress(formData, onProgress, onComplete, onError, abortController) {
    const url = `${API_BASE}/api/documents/upload`;
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const uploadId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // 添加到上传管理器
        uploadManager.addUpload(uploadId, xhr, abortController);
        
        // 进度事件
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const speed = e.loaded / ((Date.now() - uploadManager.uploads.get(uploadId)?.startTime || Date.now()) / 1000);
                if (onProgress) {
                    onProgress({
                        loaded: e.loaded,
                        total: e.total,
                        percent: percent,
                        speed: speed,
                        uploadId: uploadId
                    });
                }
            }
        });
        
        // 完成事件
        xhr.addEventListener('load', () => {
            uploadManager.removeUpload(uploadId);
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (onComplete) onComplete(response);
                    resolve(response);
                } catch (e) {
                    reject(new Error('解析响应失败'));
                }
            } else if (xhr.status === 401) {
                logout();
                reject(new Error('认证已过期，请重新登录'));
            } else {
                let errorMsg = '上传失败';
                try {
                    const error = JSON.parse(xhr.responseText);
                    errorMsg = error.detail || errorMsg;
                } catch (e) {}
                reject(new Error(errorMsg));
            }
        });
        
        // 错误事件
        xhr.addEventListener('error', () => {
            uploadManager.removeUpload(uploadId);
            if (onError) onError(new Error('网络错误'));
            reject(new Error('网络错误'));
        });
        
        // 取消事件
        xhr.addEventListener('abort', () => {
            uploadManager.removeUpload(uploadId);
            reject(new Error('上传已取消'));
        });
        
        xhr.open('POST', url, true);
        if (state.token) {
            xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
        }
        xhr.send(formData);
    });
}

// 批量上传多个文件
async function uploadMultipleFiles(files, commonData, onProgress) {
    const results = [];
    const errors = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 验证文件
        const validation = uploadManager.validateFile(file);
        if (!validation.valid) {
            errors.push({ file: file.name, error: validation.error });
            continue;
        }
        
        const formData = new FormData();
        formData.append('title', commonData.title || file.name);
        formData.append('description', commonData.description || '');
        formData.append('category', commonData.category || '其他');
        formData.append('visibility', commonData.visibility || 'private');
        
        // 自动设置当前文件夹
        if (state.currentFolderId) {
            formData.append('parent_id', state.currentFolderId);
        }
        
        formData.append('file', file);
        
        try {
            const result = await uploadDocumentWithProgress(
                formData,
                (progress) => {
                    if (onProgress) {
                        onProgress({
                            ...progress,
                            fileIndex: i,
                            totalFiles: files.length,
                            fileName: file.name
                        });
                    }
                },
                null,
                null
            );
            results.push(result);
        } catch (error) {
            errors.push({ file: file.name, error: error.message });
        }
    }
    
    return { results, errors };
}

// 旧的 uploadDocument 函数，保持向后兼容
async function uploadDocument(formData) {
    return uploadDocumentWithProgress(formData);
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
        throw new Error('璁よ瘉宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?);
    }
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '涓婁紶澶辫触');
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
            throw new Error('璁よ瘉宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?);
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '涓嬭浇澶辫触');
        }
        
        // 鑾峰彇鏂囦欢鍚?- 鏀寔 filename* 鏍煎紡
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'download';
        if (contentDisposition) {
            // 鍏堝皾璇?filename*=UTF-8'' 鏍煎紡
            const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
            if (filenameStarMatch) {
                filename = decodeURIComponent(filenameStarMatch[1]);
            } else {
                // 鍐嶅皾璇?filename="..." 鏍煎紡
                const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
        }
        
        // 涓嬭浇鏂囦欢
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        showToast('涓嬭浇鎴愬姛', 'success');
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
            throw new Error('璁よ瘉宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?);
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '棰勮澶辫触');
        }
        
        const blob = await response.blob();
        const previewUrl = window.URL.createObjectURL(blob);
        window.open(previewUrl, '_blank');
        
        // 寤惰繜閲婃斁URL瀵硅薄
        setTimeout(() => {
            window.URL.revokeObjectURL(previewUrl);
        }, 60000);
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// ==================== 鎵瑰绯荤粺 ====================
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
        throw new Error('璁よ瘉宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?);
    }
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '鏇存柊澶辫触');
    }
    
    return await response.json();
}

// ==================== 绯荤粺淇℃伅 ====================
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

// ==================== UI 宸ュ叿鍑芥暟 ====================
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
    // 鏀寔鏂囨。瀵硅薄鎴栨枃浠跺悕瀛楃涓?    const isFolder = typeof docOrFilename === 'object' && docOrFilename.is_folder;
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
    // 鏀寔鏂囨。瀵硅薄鎴栨枃浠跺悕瀛楃涓?    const isFolder = typeof docOrFilename === 'object' && docOrFilename.is_folder;
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
        public: { class: 'badge-public', text: '鍏紑', icon: 'fa-globe' },
        department: { class: 'badge-department', text: '閮ㄩ棬', icon: 'fa-building' },
        private: { class: 'badge-private', text: '绉佹湁', icon: 'fa-lock' }
    };
    const badge = badges[visibility] || badges.private;
    return `<span class="badge ${badge.class}"><i class="fas ${badge.icon} mr-1"></i>${badge.text}</span>`;
}

function getLevelBadge(level) {
    const levelNames = {
        0: '绯荤粺绠＄悊鍛?,
        1: '閮ㄩ棬涓荤',
        2: '鏅€氬憳宸?,
        3: '璁垮'
    };
    return `<span class="level-badge level-${level}">${levelNames[level] || '鏈煡'}</span>`;
}

// ==================== 椤甸潰鍒囨崲 ====================
function showLoginPage() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    // 鏇存柊鐢ㄦ埛淇℃伅
    updateUserInfo();
    
    // 鍔犺浇鍒濆鏁版嵁
    loadInitialData();
}

function updateUserInfo() {
    if (!state.user) return;
    
    const levelNames = {
        0: '绯荤粺绠＄悊鍛?,
        1: '閮ㄩ棬涓荤',
        2: '鏅€氬憳宸?,
        3: '璁垮'
    };
    
    document.getElementById('user-info-display').textContent = 
        `${state.user.name} 路 ${state.user.department} 路 ${levelNames[state.user.level]}`;
    document.getElementById('user-name-display').textContent = state.user.name;
    document.getElementById('user-avatar-initial').textContent = state.user.name.charAt(0).toUpperCase();
    document.getElementById('dropdown-user-name').textContent = state.user.name;
    document.getElementById('dropdown-user-role').textContent = levelNames[state.user.level];
    
    // 鏍规嵁鏉冮檺鏄剧ず/闅愯棌鍔熻兘
    if (state.user.level <= 1) {
        document.getElementById('nav-users').classList.remove('hidden');
    }
}

// ==================== 鏁版嵁鍔犺浇 ====================
async function loadInitialData() {
    try {
        // 骞惰鍔犺浇鍩虹鏁版嵁
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
        
        // 鏇存柊鍒嗙被鍒楄〃
        updateCategoryList();
        
        // 鏇存柊绛涢€夊櫒
        updateFilters();
        
        // 鏇存柊缁熻
        updateStats();
        
        // 鍔犺浇鏂囨。
        await loadDocuments();
        
        // 鍔犺浇鐢ㄦ埛鍒楄〃锛堝鏋滄湁鏉冮檺锛?        if (state.user.level <= 1) {
            await loadUsers();
        }
        
    } catch (error) {
        console.error('鍔犺浇鍒濆鏁版嵁澶辫触:', error);
    }
}

async function loadDocuments() {
    const filters = {};
    
    // 鏍规嵁褰撳墠瑙嗗浘娣诲姞绛涢€?    if (state.currentView === 'my') {
        filters.owner_id = state.user.id;
    } else if (state.currentView === 'department') {
        filters.visibility = 'department';
    } else if (state.currentView === 'public') {
        filters.visibility = 'public';
    } else if (state.categories.includes(state.currentView)) {
        filters.category = state.currentView;
    }

    // 娣诲姞鏂囦欢澶硅繃婊?    if (state.currentFolderId !== null) {
        filters.parent_id = state.currentFolderId;
    } else {
        // 鏍圭洰褰曪細parent_id涓虹┖
        filters.parent_id = '';
    }

    // 娣诲姞绛涢€夊櫒鏉′欢
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
    
    // 閲嶆柊缁戝畾浜嬩欢
    bindNavEvents();
}

function updateFilters() {
    // 鏇存柊鍒嗙被绛涢€?    const categorySelect = document.getElementById('filter-category');
    categorySelect.innerHTML = '<option value="">鎵€鏈夊垎绫?/option>' + 
        state.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    // 鏇存柊涓婁紶琛ㄥ崟涓殑鍒嗙被
    const uploadCategory = document.querySelector('select[name="category"]');
    if (uploadCategory) {
        uploadCategory.innerHTML = state.categories.map(cat => 
            `<option value="${cat}">${cat}</option>`
        ).join('');
    }
    
    // 鏇存柊閮ㄩ棬閫夋嫨
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
    
    // 鍒嗙被缁熻
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
    
    // 鍙鎬х粺璁?    const visibilityStats = document.getElementById('visibility-stats');
    const visData = state.stats.documents_by_visibility || {};
    const visColors = { public: 'bg-green-500', department: 'bg-blue-500', private: 'bg-red-500' };
    const visNames = { public: '鍏紑', department: '閮ㄩ棬', private: '绉佹湁' };
    
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

// ==================== 娓叉煋鍑芥暟 ====================
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
    
    // 娓叉煋缃戞牸瑙嗗浘
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
                <p class="text-sm text-slate-500 mb-3 line-clamp-2">${doc.description || '鏃犳弿杩?}</p>
                
                <div class="flex items-center justify-between text-xs text-slate-400">
                    <span>${doc.owner_name}</span>
                    <span>${formatDate(doc.updated_at)}</span>
                </div>
                
                <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <span class="text-xs text-slate-500">${doc.is_folder ? '鏂囦欢澶? : formatFileSize(doc.file_size)}</span>
                    <div class="flex space-x-2">
                        <button class="btn-preview text-blue-600 hover:text-blue-800 p-1" title="棰勮">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-download text-green-600 hover:text-green-800 p-1" title="涓嬭浇">
                            <i class="fas fa-download"></i>
                        </button>
                        ${canEditDocument(doc) ? `
                        <button class="btn-edit text-amber-600 hover:text-amber-800 p-1" title="缂栬緫">
                            <i class="fas fa-edit"></i>
                        </button>
                        ` : ''}
                        ${canDeleteDocument(doc) ? `
                        <button class="btn-delete text-red-600 hover:text-red-800 p-1" title="鍒犻櫎">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    // 娓叉煋鍒楄〃瑙嗗浘
    listContainer.innerHTML = state.documents.map(doc => `
        <tr class="border-b border-slate-100 hover:bg-slate-50" data-id="${doc.id}">
            <td class="px-4 py-3">
                <div class="flex items-center space-x-3">
                    <div class="file-icon ${getFileIconClass(doc)}" style="width: 36px; height: 36px; font-size: 14px;">
                        ${getFileIconHtml(doc)}
                    </div>
                    <div>
                        <p class="font-medium text-slate-800">${doc.title}</p>
                        <p class="text-xs text-slate-500">${doc.is_folder ? '鏂囦欢澶? : doc.original_filename}</p>
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
                    <button class="btn-preview text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50" title="棰勮">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-download text-green-600 hover:text-green-800 p-1.5 rounded hover:bg-green-50" title="涓嬭浇">
                        <i class="fas fa-download"></i>
                    </button>
                    ${canEditDocument(doc) ? `
                    <button class="btn-edit text-amber-600 hover:text-amber-800 p-1.5 rounded hover:bg-amber-50" title="缂栬緫">
                        <i class="fas fa-edit"></i>
                    </button>
                    ` : ''}
                    ${canDeleteDocument(doc) ? `
                    <button class="btn-delete text-red-600 hover:text-red-800 p-1.5 rounded hover:bg-red-50" title="鍒犻櫎">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
    
    // 缁戝畾浜嬩欢
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
                        <p class="text-xs text-slate-500">${user.username} 路 ${user.employee_id}</p>
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
                <span class="text-sm text-slate-600 ml-1">${user.is_active ? '姝ｅ父' : '绂佺敤'}</span>
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
                <p>璇烽€夋嫨鏂囨。鏌ョ湅鎵瑰</p>
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
                <p>鏆傛棤鎵瑰</p>
                <p class="text-sm mt-1">娣诲姞绗竴鏉℃壒澶?/p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.comments.map(comment => {
        const isOwn = comment.user_id === state.user.id;
        const mentionsHtml = comment.mentions?.length > 0 
            ? `<p class="text-xs text-slate-400 mt-1">鎻愬強: ${comment.mentions.map(id => {
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
                        ${comment.status === 'resolved' ? '宸茶В鍐? : '寰呭鐞?}
                    </span>
                    ${canManageComment(comment) ? `
                    <button class="btn-toggle-status text-xs text-blue-600 hover:text-blue-800" data-id="${comment.id}" data-status="${comment.status === 'resolved' ? 'pending' : 'resolved'}">
                        ${comment.status === 'resolved' ? '鏍囪寰呭鐞? : '鏍囪宸茶В鍐?}
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // 缁戝畾鎵瑰浜嬩欢
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

// ==================== 鏉冮檺妫€鏌?====================
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

// ==================== 浜嬩欢缁戝畾 ====================
function bindNavEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            // 绉婚櫎鎵€鏈夋縺娲荤姸鎬?            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const view = item.dataset.view;
            state.currentView = view;
            
            // 闅愯棌鎵€鏈夎鍥?            document.getElementById('documents-grid').classList.add('hidden');
            document.getElementById('documents-list').classList.add('hidden');
            document.getElementById('users-view').classList.add('hidden');
            document.getElementById('stats-view').classList.add('hidden');
            document.getElementById('empty-state').classList.add('hidden');
            
            // 鏇存柊鏍囬
            const titles = {
                'all': '鍏ㄩ儴鏂囨。',
                'my': '鎴戠殑鏂囨。',
                'department': '閮ㄩ棬鏂囨。',
                'public': '鍏紑鏂囨。',
                'users': '鐢ㄦ埛绠＄悊',
                'stats': '缁熻鎶ヨ〃'
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
                // 鏄剧ず鏂囨。瑙嗗浘
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
    // 鏂囨。鍗＄墖鐐瑰嚮
    document.querySelectorAll('.document-card, #documents-list-body tr').forEach(el => {
        el.addEventListener('click', async (e) => {
            // 濡傛灉鐐瑰嚮鐨勬槸鎸夐挳锛屼笉瑙﹀彂閫夋嫨
            if (e.target.closest('button')) return;

            const docId = el.dataset.id;
            const doc = state.documents.find(d => d.id === docId);

            // 濡傛灉鏄枃浠跺す锛岃繘鍏ユ枃浠跺す
            if (doc && doc.is_folder) {
                await enterFolder(docId, doc.title);
            } else {
                // 鍚﹀垯閫夋嫨鏂囨。
                state.selectedDocument = doc;

                // 鏇存柊閫変腑鐘舵€?                document.querySelectorAll('.document-card').forEach(c => c.classList.remove('selected'));
                document.querySelector(`.document-card[data-id="${docId}"]`)?.classList.add('selected');

                // 鍔犺浇鎵瑰
                await refreshComments();
            }
        });
    });
    
    // 棰勮鎸夐挳
    document.querySelectorAll('.btn-preview').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            previewDocument(docId);
        });
    });
    
    // 涓嬭浇鎸夐挳
    document.querySelectorAll('.btn-download').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            downloadDocument(docId);
        });
    });
    
    // 缂栬緫鎸夐挳
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            showEditDocumentModal(docId);
        });
    });
    
    // 鍒犻櫎鎸夐挳
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const docId = e.target.closest('[data-id]').dataset.id;
            const doc = state.documents.find(d => d.id === docId);
            
            if (confirm(`纭畾瑕佸垹闄ゆ枃妗?"${doc.title}" 鍚楋紵姝ゆ搷浣滀笉鍙仮澶嶃€俙)) {
                await deleteDocument(docId);
                showToast('鏂囨。宸插垹闄?, 'success');
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

// ==================== 妯℃€佹 ====================
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
    
    // 鍙互鎵╁睍涓虹紪杈戞ā鎬佹
    showToast('缂栬緫鍔熻兘寮€鍙戜腑...', 'info');
}

// ==================== 鍒濆鍖?====================
function init() {
    // 妫€鏌ョ櫥褰曠姸鎬?    if (state.token && state.user) {
        showMainApp();
    } else {
        showLoginPage();
    }
    
    // 鐧诲綍琛ㄥ崟
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        try {
            const success = await login(username, password);
            if (success) {
                showToast('鐧诲綍鎴愬姛', 'success');
                showMainApp();
            }
        } catch (error) {
            // 閿欒宸插湪 apiRequest 涓鐞?        }
    });
    
    // 鐢ㄦ埛鑿滃崟
    document.getElementById('user-menu-btn').addEventListener('click', () => {
        document.getElementById('user-dropdown').classList.toggle('hidden');
    });
    
    // 鐐瑰嚮澶栭儴鍏抽棴涓嬫媺鑿滃崟
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#user-menu-container')) {
            document.getElementById('user-dropdown').classList.add('hidden');
        }
    });
    
    // 閫€鍑虹櫥褰?    document.getElementById('menu-logout').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
        showToast('宸查€€鍑虹櫥褰?, 'info');
    });
    
    // 淇敼瀵嗙爜
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
            showToast('涓ゆ杈撳叆鐨勬柊瀵嗙爜涓嶄竴鑷?, 'error');
            return;
        }
        
        try {
            await changePassword(oldPassword, newPassword);
            showToast('瀵嗙爜淇敼鎴愬姛', 'success');
            hideModal('change-password-modal');
            e.target.reset();
        } catch (error) {
            // 閿欒宸插鐞?        }
    });
    
    // 鍏抽棴妯℃€佹
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.fixed').classList.add('hidden');
            btn.closest('.fixed').classList.remove('flex');
        });
    });
    
    // 瑙嗗浘鍒囨崲
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
    
    // 涓婁紶鎸夐挳
    document.getElementById('btn-upload').addEventListener('click', () => {
        showModal('upload-modal');
    });

    // 鏂板缓鏂囦欢澶规寜閽?    document.getElementById('btn-new-folder').addEventListener('click', () => {
        // 鍔犺浇鏂囦欢澶瑰垪琛ㄥ埌鐖舵枃浠跺す閫夋嫨鍣?        loadFolderOptions();
        showModal('new-folder-modal');
    });

    // 涓婁紶鏂囦欢澶规寜閽?    document.getElementById('btn-upload-folder').addEventListener('click', () => {
        // 鍔犺浇鏂囦欢澶瑰垪琛ㄥ埌鐖舵枃浠跺す閫夋嫨鍣?        loadFolderOptions();
        showModal('upload-folder-modal');
    });

    // 鎷栨嫿涓婁紶
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
        el.textContent = `宸查€夋嫨: ${name}`;
        el.classList.remove('hidden');
    }

    // 涓婁紶鏂囦欢澶圭殑鎷栨嫿鍜屾枃浠堕€夋嫨
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
                        // 澶勭悊鐩綍
                        showToast('璇蜂娇鐢ㄦ枃浠堕€夋嫨鎸夐挳閫夋嫨鏂囦欢澶?, 'warning');
                        return;
                    }
                }
            }
        }

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) {
            // 璁剧疆鏂囦欢杈撳叆鐨勬枃浠?            const dataTransfer = new DataTransfer();
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

        // 鏄剧ず鏂囦欢澶逛俊鎭?        if (files.length > 0) {
            // 灏濊瘯浠庢枃浠惰矾寰勪腑鑾峰彇鏂囦欢澶瑰悕
            let folderName = '閫夋嫨鐨勬枃浠?;
            if (files[0].webkitRelativePath) {
                const pathParts = files[0].webkitRelativePath.split('/');
                if (pathParts.length > 1) {
                    folderName = pathParts[0];
                }
            }

            folderNameEl.textContent = `鏂囦欢澶? ${folderName}`;
            filesCountEl.textContent = `鏂囦欢鏁伴噺: ${files.length} 涓猔;

            // 鏄剧ず鍓?0涓枃浠?            filesListEl.innerHTML = '';
            const maxFilesToShow = 10;
            for (let i = 0; i < Math.min(files.length, maxFilesToShow); i++) {
                const li = document.createElement('li');
                li.textContent = files[i].name;
                filesListEl.appendChild(li);
            }
            if (files.length > maxFilesToShow) {
                const li = document.createElement('li');
                li.textContent = `... 杩樻湁 ${files.length - maxFilesToShow} 涓枃浠禶;
                filesListEl.appendChild(li);
            }

            infoDiv.classList.remove('hidden');
        } else {
            infoDiv.classList.add('hidden');
        }
    }/*


    // 涓婁紶琛ㄥ崟
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 鑾峰彇琛ㄥ崟鏁版嵁
        const title = document.getElementById('upload-title').value.trim();
        const description = document.getElementById('upload-description').value.trim();
        const category = document.getElementById('upload-category').value;
        const visibility = document.getElementById('upload-visibility').value;
        
        // 妫€鏌ユ爣棰?        if (!title) {
            showToast('璇疯緭鍏ユ枃妗ｆ爣棰?, 'error');
            return;
        }
        
        // 妫€鏌ユ槸鍚︽湁鏂囦欢
        const file = selectedFile;
        if (!file) {
            showToast('璇烽€夋嫨瑕佷笂浼犵殑鏂囦欢', 'error');
            return;
        }
        
        console.log('Uploading file:', file.name, file.type, file.size);
        
        // 鍒涘缓 FormData - 娉ㄦ剰椤哄簭锛宖ile 蹇呴』鏄渶鍚庝竴涓瓧娈?        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('category', category);
        formData.append('visibility', visibility);
        formData.append('file', file, file.name);
        
        try {
            showToast('姝ｅ湪涓婁紶...', 'info');
            await uploadDocument(formData);
            showToast('鏂囨。涓婁紶鎴愬姛', 'success');
            hideModal('upload-modal');
            
            // 閲嶇疆琛ㄥ崟
            document.getElementById('upload-form').reset();
            selectedFile = null;
            document.getElementById('selected-file-name').classList.add('hidden');
            
            await loadDocuments();
        } catch (error) {
            console.error('涓婁紶澶辫触:', error);
        }
    })
*/;
    
    // 娣诲姞鐢ㄦ埛
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
            showToast('鐢ㄦ埛鍒涘缓鎴愬姛', 'success');
            hideModal('add-user-modal');
            e.target.reset();
            await loadUsers();
        } catch (error) {
            // 閿欒宸插鐞?        }
    });

    // 鏂板缓鏂囦欢澶硅〃鍗?    document.getElementById('new-folder-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('folder-name').value.trim();
        const description = document.getElementById('folder-description').value.trim();
        const category = document.getElementById('folder-category').value;
        const visibility = document.getElementById('folder-visibility').value;
        const parentId = document.getElementById('folder-parent').value || null;

        if (!title) {
            showToast('璇疯緭鍏ユ枃浠跺す鍚嶇О', 'error');
            return;
        }

        try {
            showToast('姝ｅ湪鍒涘缓鏂囦欢澶?..', 'info');
            await createFolder({
                title,
                description,
                category,
                visibility,
                is_folder: true,
                parent_id: parentId,
                folder_path: ''
            });

            showToast('鏂囦欢澶瑰垱寤烘垚鍔?, 'success');
            hideModal('new-folder-modal');
            e.target.reset();
            await loadDocuments();
        } catch (error) {
            // 閿欒宸插湪 apiRequest 涓鐞?        }
    });

    // 涓婁紶鏂囦欢澶硅〃鍗?    document.getElementById('upload-folder-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const folderName = document.getElementById('upload-folder-name').value.trim();
        const description = document.getElementById('upload-folder-description').value.trim();
        const category = document.getElementById('upload-folder-category').value;
        const visibility = document.getElementById('upload-folder-visibility').value;
        const parentId = document.getElementById('upload-folder-parent').value || null;

        if (!folderName) {
            showToast('璇疯緭鍏ユ枃浠跺す鍚嶇О', 'error');
            return;
        }

        // 妫€鏌ユ槸鍚︽湁鏂囦欢琚€夋嫨
        const fileInput = document.getElementById('upload-folder-input');
        if (!fileInput.files || fileInput.files.length === 0) {
            showToast('璇烽€夋嫨瑕佷笂浼犵殑鏂囦欢澶?, 'error');
            return;
        }

        try {
            showToast('姝ｅ湪涓婁紶鏂囦欢澶?..', 'info');

            const formData = new FormData();
            formData.append('folder_name', folderName);
            formData.append('description', description);
            formData.append('category', category);
            formData.append('visibility', visibility);
            if (parentId) {
                formData.append('parent_id', parentId);
            }

            // 娣诲姞鎵€鏈夋枃浠跺埌FormData
            const files = fileInput.files;
            for (let i = 0; i < files.length; i++) {
                formData.append('files', files[i]);
                // 娣诲姞鐩稿璺緞锛堝鏋滃彲鐢級
                if (files[i].webkitRelativePath) {
                    formData.append('file_paths', files[i].webkitRelativePath);
                } else {
                    formData.append('file_paths', files[i].name);
                }
            }

            const result = await uploadFolder(formData);
            showToast(`鏂囦欢澶逛笂浼犳垚鍔燂紝鍏?{result.file_count}涓枃浠禶, 'success');
            hideModal('upload-folder-modal');
            e.target.reset();
            // 閲嶇疆鏂囦欢杈撳叆
            fileInput.value = '';
            document.getElementById('selected-folder-info').classList.add('hidden');
            await loadDocuments();
        } catch (error) {
            // 閿欒宸插湪 apiRequest 涓鐞?        }
    });

    // 绛涢€夊櫒
    document.getElementById('filter-visibility').addEventListener('change', loadDocuments);
    document.getElementById('filter-category').addEventListener('change', loadDocuments);
    
    // 鎼滅储
    let searchTimeout;
    document.getElementById('global-search').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadDocuments, 300);
    });
    
    // 鎻愪氦鎵瑰
    document.getElementById('btn-submit-comment').addEventListener('click', async () => {
        const input = document.getElementById('comment-input');
        const content = input.value.trim();
        
        if (!content) {
            showToast('璇疯緭鍏ユ壒澶嶅唴瀹?, 'warning');
            return;
        }
        
        if (!state.selectedDocument) {
            showToast('璇峰厛閫夋嫨鏂囨。', 'warning');
            return;
        }
        
        // 鎻愬彇@鎻愬強
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
            showToast('鎵瑰宸叉坊鍔?, 'success');
            input.value = '';
            await refreshComments();
        } catch (error) {
            // 閿欒宸插鐞?        }
    });
    
    // 鍒濆缁戝畾瀵艰埅浜嬩欢
    bindNavEvents();
}

// 椤甸潰鍔犺浇瀹屾垚鍚庡垵濮嬪寲
document.addEventListener('DOMContentLoaded', init);





// ========== 额外的上传功能代码（覆盖旧逻辑） ==========

// 等待 DOM 加载完成后覆盖上传相关的事件处理
document.addEventListener('DOMContentLoaded', function() {
    // 延迟执行，确保在 init() 之后
    setTimeout(() => {
        overrideUploadHandlers();
    }, 100);
});

function overrideUploadHandlers() {
    // 覆盖上传按钮点击事件
    const btnUpload = document.getElementById('btn-upload');
    if (btnUpload) {
        btnUpload.onclick = () => {
            selectedFiles = [];
            updateSelectedFilesUI();
            
            // 显示当前文件夹位置
            const locationHint = document.getElementById('upload-location-hint');
            const locationName = document.getElementById('upload-location-name');
            if (locationHint && locationName) {
                if (state.currentFolderId) {
                    const currentFolder = state.documents.find(d => d.id === state.currentFolderId);
                    locationHint.classList.remove('hidden');
                    locationName.textContent = currentFolder ? currentFolder.title : '当前文件夹';
                } else {
                    locationHint.classList.add('hidden');
                }
            }
            
            showModal('upload-modal');
        };
    }
    
    // 覆盖拖拽区域事件
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('upload-file-input');
    
    if (dropZone) {
        dropZone.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (fileInput) fileInput.click();
        };
        
        dropZone.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('border-blue-400', 'bg-blue-50');
        };
        
        dropZone.ondragleave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-blue-400', 'bg-blue-50');
        };
        
        dropZone.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-blue-400', 'bg-blue-50');
            
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                addFilesToSelection(files);
            }
        };
    }
    
    if (fileInput) {
        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                addFilesToSelection(files);
            }
            fileInput.value = '';
        };
    }
    
    // 清空文件列表按钮
    const btnClear = document.getElementById('btn-clear-files');
    if (btnClear) {
        btnClear.onclick = () => {
            selectedFiles = [];
            updateSelectedFilesUI();
        };
    }
    
    // 取消所有上传按钮
    const btnCancelAll = document.getElementById('btn-cancel-all-uploads');
    if (btnCancelAll) {
        btnCancelAll.onclick = () => {
            uploadManager.cancelAll();
        };
    }
    
    // 覆盖上传表单提交
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.onsubmit = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (selectedFiles.length === 0) {
                showToast('请选择要上传的文件', 'error');
                return;
            }
            
            const category = document.getElementById('upload-category').value;
            const visibility = document.getElementById('upload-visibility').value;
            
            // 创建上传进度项
            const progressList = document.getElementById('upload-progress-list');
            if (!progressList) {
                showToast('上传面板未找到', 'error');
                return;
            }
            
            const uploadId = 'batch_' + Date.now();
            
            selectedFiles.forEach((file, index) => {
                const item = document.createElement('div');
                item.id = `upload-item-${uploadId}-${index}`;
                item.className = 'bg-slate-50 rounded-lg p-3 mb-2';
                item.innerHTML = `
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-slate-700 truncate flex-1 mr-2" title="${file.name}">${file.name}</span>
                        <span class="text-xs text-slate-400 status-text">等待中...</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-2 mb-1">
                        <div class="progress-bar bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                    </div>
                    <div class="flex justify-between text-xs text-slate-400">
                        <span class="progress-text">0%</span>
                        <span class="speed-text"></span>
                    </div>
                `;
                progressList.appendChild(item);
            });
            
            const progressPanel = document.getElementById('upload-progress-panel');
            if (progressPanel) progressPanel.classList.remove('hidden');
            
            const uploadBtn = document.getElementById('btn-start-upload');
            if (uploadBtn) {
                uploadBtn.disabled = true;
                uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>上传中...';
            }
            
            let completed = 0;
            let failed = 0;
            
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const itemId = `upload-item-${uploadId}-${i}`;
                const itemEl = document.getElementById(itemId);
                if (!itemEl) continue;
                
                const statusText = itemEl.querySelector('.status-text');
                const progressBar = itemEl.querySelector('.progress-bar');
                const progressText = itemEl.querySelector('.progress-text');
                const speedText = itemEl.querySelector('.speed-text');
                
                if (statusText) statusText.textContent = '上传中...';
                
                const formData = new FormData();
                formData.append('title', file.name);
                formData.append('description', '');
                formData.append('category', category);
                formData.append('visibility', visibility);
                
                if (state.currentFolderId) {
                    formData.append('parent_id', state.currentFolderId);
                }
                
                formData.append('file', file);
                
                try {
                    await uploadDocumentWithProgress(
                        formData,
                        (progress) => {
                            if (progressBar) progressBar.style.width = progress.percent + '%';
                            if (progressText) progressText.textContent = progress.percent + '%';
                            if (speedText && progress.speed > 0) {
                                speedText.textContent = formatFileSize(progress.speed) + '/s';
                            }
                        }
                    );
                    
                    if (statusText) {
                        statusText.textContent = '完成';
                        statusText.classList.remove('text-slate-400');
                        statusText.classList.add('text-green-500');
                    }
                    if (progressBar) {
                        progressBar.classList.remove('bg-blue-500');
                        progressBar.classList.add('bg-green-500');
                    }
                    completed++;
                    
                } catch (error) {
                    if (statusText) {
                        statusText.textContent = '失败';
                        statusText.classList.remove('text-slate-400');
                        statusText.classList.add('text-red-500');
                    }
                    if (progressBar) {
                        progressBar.classList.remove('bg-blue-500');
                        progressBar.classList.add('bg-red-500');
                    }
                    failed++;
                }
            }
            
            if (failed === 0) {
                showToast(`成功上传 ${completed} 个文件`, 'success');
            } else {
                showToast(`上传完成: ${completed} 成功, ${failed} 失败`, 'warning');
            }
            
            hideModal('upload-modal');
            
            uploadForm.reset();
            selectedFiles = [];
            updateSelectedFilesUI();
            
            await loadDocuments();
            
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = '<i class="fas fa-upload mr-2"></i>开始上传';
            }
        };
    }
}

// 添加文件到选择列表
function addFilesToSelection(files) {
    let added = 0;
    let errors = [];
    
    files.forEach(file => {
        if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
            return;
        }
        
        const validation = uploadManager.validateFile(file);
        if (!validation.valid) {
            errors.push(validation.error);
            return;
        }
        
        selectedFiles.push(file);
        added++;
    });
    
    if (errors.length > 0) {
        showToast(errors[0], 'warning');
    }
    
    if (added > 0) {
        updateSelectedFilesUI();
        showToast(`已添加 ${added} 个文件`, 'success');
    }
}

// 更新已选择文件列表UI
function updateSelectedFilesUI() {
    const container = document.getElementById('selected-files-container');
    const list = document.getElementById('selected-files-list');
    const countEl = document.getElementById('selected-files-count');
    const sizeEl = document.getElementById('selected-files-size');
    const uploadBtn = document.getElementById('btn-start-upload');
    
    if (!container || !list) return;
    
    if (selectedFiles.length === 0) {
        container.classList.add('hidden');
        if (uploadBtn) uploadBtn.disabled = true;
        return;
    }
    
    container.classList.remove('hidden');
    if (uploadBtn) uploadBtn.disabled = false;
    
    if (countEl) countEl.textContent = selectedFiles.length;
    const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    if (sizeEl) sizeEl.textContent = formatFileSize(totalSize);
    
    list.innerHTML = selectedFiles.map((file, index) => `
        <div class="flex items-center justify-between p-3 hover:bg-slate-50">
            <div class="flex items-center flex-1 min-w-0">
                <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
                    ${getFileIconHtml(file.name)}
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-medium text-slate-700 truncate" title="${file.name}">${file.name}</p>
                    <p class="text-xs text-slate-400">${formatFileSize(file.size)}</p>
                </div>
            </div>
            <button type="button" class="remove-file-btn ml-2 text-slate-400 hover:text-red-500 transition-colors" data-index="${index}">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    
    list.querySelectorAll('.remove-file-btn').forEach(btn => {
        btn.onclick = () => {
            const index = parseInt(btn.dataset.index);
            selectedFiles.splice(index, 1);
            updateSelectedFilesUI();
        };
    });
}
