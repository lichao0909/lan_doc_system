"""
企业级局域网文档管理系统
基于FastAPI + 文件存储 + JWT认证
"""

import os
import json
import csv
import hashlib
import uuid
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path
from dataclasses import dataclass, asdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pydantic import BaseModel, Field
import aiofiles

# ==================== 配置 ====================
SECRET_KEY = "lan-doc-system-secret-key-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"
CACHE_DIR = BASE_DIR / "cache"

# 确保目录存在
DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

# 用户等级定义
USER_LEVELS = {
    0: {"name": "系统管理员", "permissions": ["all"]},
    1: {"name": "部门主管", "permissions": ["dept_manage", "view_subordinate"]},
    2: {"name": "普通员工", "permissions": ["self_manage"]},
    3: {"name": "访客", "permissions": ["read_only"]}
}

# 部门列表
DEPARTMENTS = ["技术部", "市场部", "人事部", "财务部", "行政部"]

# 文档分类
CATEGORIES = ["工作报告", "会议纪要", "规章制度", "项目文档", "培训资料", "其他"]

# ==================== 工具函数 ====================
import mimetypes

def get_file_type(filename: str, content_type: Optional[str] = None) -> str:
    """根据文件名和内容类型获取文件类型"""
    # 初始化MIME类型数据库
    mimetypes.init()

    # 如果有内容类型，使用它
    if content_type and content_type != "application/octet-stream":
        return content_type

    # 根据文件扩展名推断
    ext = Path(filename).suffix.lower()
    mime_type, _ = mimetypes.guess_type(filename)

    if mime_type:
        return mime_type

    # 常见扩展名映射
    ext_mapping = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".json": "application/json",
        ".xml": "application/xml",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".zip": "application/zip",
        ".rar": "application/x-rar-compressed",
        ".7z": "application/x-7z-compressed",
        ".tar": "application/x-tar",
        ".gz": "application/gzip",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".wmv": "video/x-ms-wmv",
    }

    return ext_mapping.get(ext, "application/octet-stream")

# ==================== 数据模型 ====================
class User(BaseModel):
    id: str
    username: str
    password: str  # SHA256哈希
    employee_id: str
    name: str
    email: str
    department: str
    level: int  # 0-3
    supervisor_id: Optional[str] = None
    role: str
    is_active: bool = True
    created_at: str = ""

class Document(BaseModel):
    id: str
    title: str
    description: str
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    category: str
    visibility: str  # private, department, public
    owner_id: str
    owner_name: str
    owner_department: str
    created_at: str
    updated_at: str
    download_count: int = 0
    view_count: int = 0
    # 文件夹相关字段
    is_folder: bool = False
    folder_path: str = ""  # 文件夹路径，如 "/folder1/folder2"
    parent_id: Optional[str] = None  # 父文件夹ID

class Comment(BaseModel):
    id: str
    document_id: str
    user_id: str
    user_name: str
    user_level: int
    content: str
    mentions: List[str] = []  # 被@的用户ID列表
    status: str = "pending"  # pending, resolved
    created_at: str
    updated_at: str

class TokenData(BaseModel):
    user_id: str
    username: str
    level: int
    department: str

# 请求模型
class LoginRequest(BaseModel):
    username: str
    password: str

class CreateUserRequest(BaseModel):
    username: str
    password: str
    employee_id: str
    name: str
    email: str
    department: str
    level: int
    supervisor_id: Optional[str] = None
    role: str

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    level: Optional[int] = None
    supervisor_id: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class CreateDocumentRequest(BaseModel):
    title: str
    description: str
    category: str
    visibility: str
    # 文件夹相关
    is_folder: bool = False
    folder_path: str = ""
    parent_id: Optional[str] = None

class CreateCommentRequest(BaseModel):
    document_id: str
    content: str
    mentions: List[str] = []

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

# ==================== 生命周期管理 ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据
    init_default_data()
    yield
    # 关闭时清理资源
    # 可以在这里添加清理代码

# ==================== FastAPI应用 ====================
app = FastAPI(
    title="企业文档管理系统",
    description="基于FastAPI的局域网文档管理系统",
    version="1.0.0",
    lifespan=lifespan
)

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

security = HTTPBearer()

# ==================== 工具函数 ====================
def hash_password(password: str) -> str:
    """SHA256密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """创建JWT令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    """验证JWT令牌并返回用户信息"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        username = payload.get("username")
        level = payload.get("level")
        department = payload.get("department")
        if user_id is None or username is None:
            raise HTTPException(status_code=401, detail="无效的认证令牌")
        return TokenData(user_id=user_id, username=username, level=level, department=department)
    except JWTError:
        raise HTTPException(status_code=401, detail="无效的认证令牌")

def get_users_file():
    """获取用户数据文件路径"""
    return DATA_DIR / "users.json"

def get_documents_file():
    """获取文档数据文件路径"""
    return DATA_DIR / "documents.csv"

def get_comments_file():
    """获取批复数据文件路径"""
    return DATA_DIR / "comments.jsonl"

def load_users() -> Dict[str, dict]:
    """加载所有用户"""
    file_path = get_users_file()
    if not file_path.exists():
        return {}
    with open(file_path, "r", encoding="utf-8") as f:
        users = json.load(f)
        return {u["id"]: u for u in users}

def save_users(users: Dict[str, dict]):
    """保存所有用户"""
    file_path = get_users_file()
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(list(users.values()), f, ensure_ascii=False, indent=2)

def load_documents() -> List[dict]:
    """加载所有文档"""
    file_path = get_documents_file()
    if not file_path.exists():
        return []
    documents = []
    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # 确保所有字段都存在，为缺失字段提供默认值
            defaults = {
                "is_folder": False,
                "folder_path": "",
                "parent_id": None
            }
            for key, default in defaults.items():
                if key not in row:
                    row[key] = default

            # 转换数据类型
            try:
                row["file_size"] = int(row.get("file_size", 0))
            except (ValueError, TypeError):
                row["file_size"] = 0
            try:
                row["download_count"] = int(row.get("download_count", 0))
            except (ValueError, TypeError):
                row["download_count"] = 0
            try:
                row["view_count"] = int(row.get("view_count", 0))
            except (ValueError, TypeError):
                row["view_count"] = 0

            # 转换 is_folder 为布尔值
            if "is_folder" in row:
                is_folder_val = row["is_folder"]
                if isinstance(is_folder_val, str):
                    row["is_folder"] = is_folder_val.lower() == "true"
                elif isinstance(is_folder_val, bool):
                    row["is_folder"] = is_folder_val
                else:
                    row["is_folder"] = False

            # 转换 parent_id：空字符串转为 None
            if "parent_id" in row and row["parent_id"] == "":
                row["parent_id"] = None

            documents.append(row)
    return documents

def save_documents(documents: List[dict]):
    """保存所有文档"""
    file_path = get_documents_file()

    # 定义所有可能的字段
    fieldnames = [
        "id", "title", "description", "filename", "original_filename",
        "file_size", "file_type", "category", "visibility", "owner_id",
        "owner_name", "owner_department", "created_at", "updated_at",
        "download_count", "view_count", "is_folder", "folder_path", "parent_id"
    ]

    with open(file_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        if documents:
            writer.writerows(documents)

def load_comments() -> List[dict]:
    """加载所有批复"""
    file_path = get_comments_file()
    if not file_path.exists():
        return []
    comments = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                comments.append(json.loads(line))
    return comments

def save_comment(comment: dict):
    """追加保存单个批复"""
    file_path = get_comments_file()
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(comment, ensure_ascii=False) + "\n")

def update_comment_in_file(comment_id: str, updates: dict):
    """更新批复文件中的指定批复"""
    comments = load_comments()
    updated = False
    for c in comments:
        if c["id"] == comment_id:
            c.update(updates)
            c["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            updated = True
            break
    
    if updated:
        file_path = get_comments_file()
        with open(file_path, "w", encoding="utf-8") as f:
            for c in comments:
                f.write(json.dumps(c, ensure_ascii=False) + "\n")
    return updated

# ==================== 文件夹工具函数 ====================
def get_folder_contents(folder_id: str, all_documents: List[dict], include_subfolders: bool = True) -> List[dict]:
    """获取文件夹内容"""
    contents = []
    for doc in all_documents:
        if doc.get("parent_id") == folder_id:
            contents.append(doc)
            # 递归获取子文件夹内容
            if include_subfolders and doc.get("is_folder"):
                contents.extend(get_folder_contents(doc["id"], all_documents))
    return contents

def delete_folder_recursive(folder_id: str, all_documents: List[dict], uploads_dir: Path) -> List[dict]:
    """递归删除文件夹及其所有内容"""
    # 收集所有要删除的文档ID（包括嵌套的）
    def collect_ids_to_delete(start_id: str, docs: List[dict]) -> List[str]:
        ids = [start_id]
        for doc in docs:
            if doc.get("parent_id") == start_id:
                if doc.get("is_folder"):
                    # 递归收集子文件夹的内容（包括子文件夹自身）
                    ids.extend(collect_ids_to_delete(doc["id"], docs))
                else:
                    # 添加文件ID
                    ids.append(doc["id"])
        return ids

    # 获取所有要删除的ID
    ids_to_delete = collect_ids_to_delete(folder_id, all_documents)
    ids_set = set(ids_to_delete)

    # 删除实际文件
    for doc in all_documents:
        if doc["id"] in ids_set and not doc.get("is_folder"):
            file_path = uploads_dir / doc["filename"]
            if file_path.exists():
                file_path.unlink()

    # 返回过滤后的文档列表（保留不在删除集合中的文档）
    return [doc for doc in all_documents if doc["id"] not in ids_set]

# ==================== 权限控制函数 ====================
def can_view_document(user: TokenData, document: dict, all_users: Dict[str, dict]) -> bool:
    """检查用户是否有权查看文档"""
    # 系统管理员可以查看所有
    if user.level == 0:
        return True

    # 文档所有者可以查看
    if document["owner_id"] == user.user_id:
        return True

    visibility = document["visibility"]

    # 公开文档
    if visibility == "public":
        return True

    # 部门文档
    if visibility == "department":
        # 同部门可见
        if document["owner_department"] == user.department:
            return True
        # 上级可以查看下属文档
        owner = all_users.get(document["owner_id"])
        if owner:
            return is_supervisor_of(user.user_id, owner["id"], all_users)

    # 私有文档 - 只有所有者和上级可见
    if visibility == "private":
        owner = all_users.get(document["owner_id"])
        if owner:
            return is_supervisor_of(user.user_id, owner["id"], all_users)

    return False

def can_edit_document(user: TokenData, document: dict, all_users: Dict[str, dict]) -> bool:
    """检查用户是否有权编辑文档"""
    # 系统管理员可以编辑所有
    if user.level == 0:
        return True
    
    # 文档所有者可以编辑
    if document["owner_id"] == user.user_id:
        return True
    
    # 部门主管可以编辑本部门文档
    if user.level == 1 and document["owner_department"] == user.department:
        return True
    
    # 上级可以编辑下属文档
    owner = all_users.get(document["owner_id"])
    if owner and is_supervisor_of(user.user_id, owner["id"], all_users):
        return True
    
    return False

def can_delete_document(user: TokenData, document: dict, all_users: Dict[str, dict]) -> bool:
    """检查用户是否有权删除文档"""
    # 系统管理员可以删除所有
    if user.level == 0:
        return True
    
    # 文档所有者可以删除自己的文档
    if document["owner_id"] == user.user_id:
        return True
    
    # 部门主管可以删除本部门文档
    if user.level == 1 and document["owner_department"] == user.department:
        return True
    
    return False

def can_manage_user(manager: TokenData, target_user: dict, all_users: Dict[str, dict]) -> bool:
    """检查管理者是否有权管理目标用户"""
    # 系统管理员可以管理所有
    if manager.level == 0:
        return True
    
    # 部门主管可以管理本部门员工
    if manager.level == 1 and target_user["department"] == manager.department:
        return True
    
    # 上级可以管理下属
    if is_supervisor_of(manager.user_id, target_user["id"], all_users):
        return True
    
    return False

def is_supervisor_of(supervisor_id: str, subordinate_id: str, all_users: Dict[str, dict]) -> bool:
    """检查supervisor_id是否是subordinate_id的上级（递归）"""
    if supervisor_id == subordinate_id:
        return False
    
    current_id = subordinate_id
    visited = set()
    
    while current_id:
        if current_id in visited:
            break  # 防止循环
        visited.add(current_id)
        
        user = all_users.get(current_id)
        if not user:
            break
        
        if user.get("supervisor_id") == supervisor_id:
            return True
        
        current_id = user.get("supervisor_id")
    
    return False

def get_subordinates(user_id: str, all_users: Dict[str, dict]) -> List[dict]:
    """获取用户的所有直接下属"""
    return [u for u in all_users.values() if u.get("supervisor_id") == user_id]

def get_all_subordinates_recursive(user_id: str, all_users: Dict[str, dict]) -> List[dict]:
    """递归获取用户的所有下属（包括间接下属）"""
    result = []
    direct = get_subordinates(user_id, all_users)
    result.extend(direct)
    
    for sub in direct:
        result.extend(get_all_subordinates_recursive(sub["id"], all_users))
    
    return result

def get_supervisor_chain(user_id: str, all_users: Dict[str, dict]) -> List[dict]:
    """获取用户的上级链"""
    chain = []
    current_id = user_id
    visited = set()
    
    while current_id:
        if current_id in visited:
            break
        visited.add(current_id)
        
        user = all_users.get(current_id)
        if not user:
            break
        
        supervisor_id = user.get("supervisor_id")
        if supervisor_id:
            supervisor = all_users.get(supervisor_id)
            if supervisor:
                chain.append(supervisor)
                current_id = supervisor_id
            else:
                break
        else:
            break
    
    return chain

def extract_mentions(content: str) -> List[str]:
    """从内容中提取@提及的用户名"""
    pattern = r'@(\w+)'
    return re.findall(pattern, content)

# ==================== 初始化数据 ====================
def init_default_data():
    """初始化默认数据"""
    users_file = get_users_file()
    if not users_file.exists():
        # 创建默认用户
        default_users = [
            {
                "id": str(uuid.uuid4()),
                "username": "admin",
                "password": hash_password("admin123"),
                "employee_id": "EMP001",
                "name": "系统管理员",
                "email": "admin@company.com",
                "department": "行政部",
                "level": 0,
                "supervisor_id": None,
                "role": "系统管理员",
                "is_active": True,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            {
                "id": str(uuid.uuid4()),
                "username": "manager1",
                "password": hash_password("manager123"),
                "employee_id": "EMP002",
                "name": "技术部经理",
                "email": "tech.manager@company.com",
                "department": "技术部",
                "level": 1,
                "supervisor_id": None,
                "role": "部门主管",
                "is_active": True,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            {
                "id": str(uuid.uuid4()),
                "username": "staff1",
                "password": hash_password("staff123"),
                "employee_id": "EMP003",
                "name": "张三",
                "email": "zhangsan@company.com",
                "department": "技术部",
                "level": 2,
                "supervisor_id": None,  # 将在后面设置
                "role": "软件工程师",
                "is_active": True,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            {
                "id": str(uuid.uuid4()),
                "username": "guest1",
                "password": hash_password("guest123"),
                "employee_id": "EMP004",
                "name": "访客用户",
                "email": "guest@company.com",
                "department": "行政部",
                "level": 3,
                "supervisor_id": None,
                "role": "访客",
                "is_active": True,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        ]
        
        # 设置上下级关系
        manager_id = default_users[1]["id"]
        default_users[2]["supervisor_id"] = manager_id
        
        save_users({u["id"]: u for u in default_users})
        print("已创建默认用户数据")

# ==================== API路由 ====================


# 首页
@app.get("/")
async def root():
    """返回前端页面"""
    return FileResponse(BASE_DIR / "static" / "index.html")

# ==================== 认证相关 ====================

@app.post("/api/login")
async def login(request: LoginRequest):
    """用户登录"""
    users = load_users()
    
    # 查找用户
    user = None
    for u in users.values():
        if u["username"] == request.username:
            user = u
            break
    
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="账户已被禁用")
    
    # 验证密码
    hashed_password = hash_password(request.password)
    if user["password"] != hashed_password:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    # 创建令牌
    token_data = {
        "user_id": user["id"],
        "username": user["username"],
        "level": user["level"],
        "department": user["department"],
        "name": user["name"]
    }
    access_token = create_access_token(token_data)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name": user["name"],
            "email": user["email"],
            "department": user["department"],
            "level": user["level"],
            "role": user["role"],
            "supervisor_id": user.get("supervisor_id")
        }
    }

@app.post("/api/register")
async def register(
    request: CreateUserRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """注册新用户（需要管理员或部门主管权限）"""
    # 检查权限
    if current_user.level > 1:
        raise HTTPException(status_code=403, detail="权限不足")
    
    users = load_users()
    
    # 检查用户名是否已存在
    for u in users.values():
        if u["username"] == request.username:
            raise HTTPException(status_code=400, detail="用户名已存在")
        if u["employee_id"] == request.employee_id:
            raise HTTPException(status_code=400, detail="员工编号已存在")
    
    # 部门主管只能创建本部门用户
    if current_user.level == 1 and request.department != current_user.department:
        raise HTTPException(status_code=403, detail="只能创建本部门用户")
    
    # 部门主管不能创建比自己等级高的用户
    if current_user.level == 1 and request.level < current_user.level:
        raise HTTPException(status_code=403, detail="不能创建比自己等级高的用户")
    
    # 创建新用户
    new_user = {
        "id": str(uuid.uuid4()),
        "username": request.username,
        "password": hash_password(request.password),
        "employee_id": request.employee_id,
        "name": request.name,
        "email": request.email,
        "department": request.department,
        "level": request.level,
        "supervisor_id": request.supervisor_id or current_user.user_id,
        "role": request.role,
        "is_active": True,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    users[new_user["id"]] = new_user
    save_users(users)
    
    return {"message": "用户创建成功", "user_id": new_user["id"]}

@app.post("/api/users/{user_id}/change-password")
async def change_password(
    user_id: str,
    request: ChangePasswordRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """修改密码"""
    users = load_users()
    
    user = users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 只能修改自己的密码，或者管理员可以修改任何人的密码
    if current_user.user_id != user_id and current_user.level != 0:
        raise HTTPException(status_code=403, detail="权限不足")
    
    # 验证旧密码（非管理员修改他人密码时需要）
    if current_user.user_id == user_id:
        if user["password"] != hash_password(request.old_password):
            raise HTTPException(status_code=400, detail="旧密码错误")
    
    # 更新密码
    user["password"] = hash_password(request.new_password)
    save_users(users)
    
    return {"message": "密码修改成功"}

# ==================== 用户管理 ====================

@app.get("/api/users")
async def get_users(
    department: Optional[str] = Query(None),
    level: Optional[int] = Query(None),
    current_user: TokenData = Depends(get_current_user)
):
    """获取用户列表"""
    users = load_users()
    all_users = list(users.values())
    
    # 根据权限过滤
    if current_user.level == 0:
        # 管理员可以看到所有用户
        pass
    elif current_user.level == 1:
        # 部门主管只能看到本部门用户和下属
        all_users = [u for u in all_users if u["department"] == current_user.department]
    else:
        # 普通员工只能看到自己
        all_users = [u for u in all_users if u["id"] == current_user.user_id]
    
    # 应用查询过滤
    if department:
        all_users = [u for u in all_users if u["department"] == department]
    if level is not None:
        all_users = [u for u in all_users if u["level"] == level]
    
    # 移除密码字段
    for u in all_users:
        u.pop("password", None)
    
    return {"users": all_users, "total": len(all_users)}

@app.get("/api/users/{user_id}")
async def get_user(
    user_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """获取单个用户信息"""
    users = load_users()
    user = users.get(user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查权限
    if not can_manage_user(current_user, user, users):
        raise HTTPException(status_code=403, detail="权限不足")
    
    # 移除密码字段
    user_copy = user.copy()
    user_copy.pop("password", None)
    
    return user_copy

@app.get("/api/users/{user_id}/subordinates")
async def get_user_subordinates(
    user_id: str,
    recursive: bool = Query(False),
    current_user: TokenData = Depends(get_current_user)
):
    """获取用户的下属"""
    users = load_users()
    
    # 只能查看自己或下属的下属
    if current_user.user_id != user_id and not is_supervisor_of(current_user.user_id, user_id, users):
        if current_user.level != 0:
            raise HTTPException(status_code=403, detail="权限不足")
    
    if recursive:
        subordinates = get_all_subordinates_recursive(user_id, users)
    else:
        subordinates = get_subordinates(user_id, users)
    
    # 移除密码字段
    for s in subordinates:
        s.pop("password", None)
    
    return {"subordinates": subordinates, "total": len(subordinates)}

@app.get("/api/users/{user_id}/supervisors")
async def get_user_supervisors(
    user_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """获取用户的上级链"""
    users = load_users()
    
    # 只能查看自己或下属的上级链
    if current_user.user_id != user_id and not is_supervisor_of(current_user.user_id, user_id, users):
        if current_user.level != 0:
            raise HTTPException(status_code=403, detail="权限不足")
    
    supervisors = get_supervisor_chain(user_id, users)
    
    # 移除密码字段
    for s in supervisors:
        s.pop("password", None)
    
    return {"supervisors": supervisors, "total": len(supervisors)}

@app.put("/api/users/{user_id}")
async def update_user(
    user_id: str,
    request: UpdateUserRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """更新用户信息"""
    users = load_users()
    user = users.get(user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查权限
    if not can_manage_user(current_user, user, users):
        raise HTTPException(status_code=403, detail="权限不足")
    
    # 部门主管不能修改用户的等级为比自己高
    if current_user.level == 1 and request.level is not None:
        if request.level < current_user.level:
            raise HTTPException(status_code=403, detail="不能将用户等级设置为比自己高")
    
    # 更新字段
    if request.name:
        user["name"] = request.name
    if request.email:
        user["email"] = request.email
    if request.department and current_user.level == 0:
        user["department"] = request.department
    if request.level is not None:
        user["level"] = request.level
    if request.supervisor_id is not None and current_user.level <= 1:
        user["supervisor_id"] = request.supervisor_id
    if request.role:
        user["role"] = request.role
    if request.is_active is not None and current_user.level <= 1:
        user["is_active"] = request.is_active
    
    save_users(users)
    
    return {"message": "用户信息更新成功"}

# ==================== 文档管理 ====================

@app.get("/api/documents")
async def get_documents(
    category: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None),
    owner_id: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: TokenData = Depends(get_current_user)
):
    """获取文档列表"""
    users = load_users()
    documents = load_documents()
    
    # 根据权限过滤
    visible_docs = []
    for doc in documents:
        if can_view_document(current_user, doc, users):
            visible_docs.append(doc)
    
    # 应用查询过滤
    if category:
        visible_docs = [d for d in visible_docs if d["category"] == category]
    if visibility:
        visible_docs = [d for d in visible_docs if d["visibility"] == visibility]
    if owner_id:
        visible_docs = [d for d in visible_docs if d["owner_id"] == owner_id]
    if parent_id:
        # 如果parent_id为空字符串，显示根目录（parent_id为null或空）
        if parent_id == "":
            visible_docs = [d for d in visible_docs if not d.get("parent_id")]
        else:
            visible_docs = [d for d in visible_docs if d.get("parent_id") == parent_id]
    if search:
        search_lower = search.lower()
        visible_docs = [
            d for d in visible_docs 
            if search_lower in d["title"].lower() or 
               search_lower in d.get("description", "").lower() or
               search_lower in d.get("original_filename", "").lower()
        ]
    
    # 按更新时间排序
    visible_docs.sort(key=lambda x: x.get("updated_at", ""), reverse=True)

    return {"documents": visible_docs, "total": len(visible_docs)}

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("其他"),
    visibility: str = Form("private"),
    folder_path: str = Form(""),
    parent_id: Optional[str] = Form(None),
    current_user: TokenData = Depends(get_current_user)
):
    """上传文档"""
    # 验证可见性
    if visibility not in ["private", "department", "public"]:
        raise HTTPException(status_code=400, detail="无效的可见性设置")

    # 生成唯一文件名
    file_ext = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = UPLOADS_DIR / unique_filename

    # 保存文件
    content = await file.read()
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # 获取用户信息
    users = load_users()
    user = users.get(current_user.user_id)

    # 创建文档记录
    document = {
        "id": str(uuid.uuid4()),
        "title": title,
        "description": description,
        "filename": unique_filename,
        "original_filename": file.filename,
        "file_size": len(content),
        "file_type": get_file_type(file.filename, file.content_type),
        "category": category,
        "visibility": visibility,
        "owner_id": current_user.user_id,
        "owner_name": user["name"] if user else current_user.username,
        "owner_department": user["department"] if user else "",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "download_count": 0,
        "view_count": 0,
        "is_folder": False,
        "folder_path": folder_path,
        "parent_id": parent_id
    }

    documents = load_documents()
    documents.append(document)
    save_documents(documents)

    return {"message": "文档上传成功", "document": document}

@app.get("/api/documents/{document_id}")
async def get_document(
    document_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """获取文档详情"""
    users = load_users()
    documents = load_documents()
    
    document = None
    for d in documents:
        if d["id"] == document_id:
            document = d
            break
    
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 检查权限
    if not can_view_document(current_user, document, users):
        raise HTTPException(status_code=403, detail="权限不足")
    
    # 增加查看次数
    document["view_count"] = document.get("view_count", 0) + 1
    save_documents(documents)
    
    return document

@app.put("/api/documents/{document_id}")
async def update_document(
    document_id: str,
    request: CreateDocumentRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """更新文档信息"""
    users = load_users()
    documents = load_documents()
    
    document = None
    for d in documents:
        if d["id"] == document_id:
            document = d
            break
    
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 检查权限
    if not can_edit_document(current_user, document, users):
        raise HTTPException(status_code=403, detail="权限不足")
    
    # 更新字段
    document["title"] = request.title
    document["description"] = request.description
    document["category"] = request.category
    document["visibility"] = request.visibility
    document["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    save_documents(documents)

    return {"message": "文档更新成功", "document": document}

@app.post("/api/folders")
async def create_folder(
    request: CreateDocumentRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """创建文件夹"""
    # 验证可见性
    if request.visibility not in ["private", "department", "public"]:
        raise HTTPException(status_code=400, detail="无效的可见性设置")

    # 获取用户信息
    users = load_users()
    user = users.get(current_user.user_id)

    # 创建文件夹记录
    folder = {
        "id": str(uuid.uuid4()),
        "title": request.title,
        "description": request.description,
        "filename": "",
        "original_filename": "",
        "file_size": 0,
        "file_type": "folder",
        "category": request.category,
        "visibility": request.visibility,
        "owner_id": current_user.user_id,
        "owner_name": user["name"] if user else current_user.username,
        "owner_department": user["department"] if user else "",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "download_count": 0,
        "view_count": 0,
        "is_folder": True,
        "folder_path": request.folder_path,
        "parent_id": request.parent_id
    }

    documents = load_documents()
    documents.append(folder)
    save_documents(documents)

    return {"message": "文件夹创建成功", "folder": folder}

@app.get("/api/folders/{folder_id}/contents")
async def get_folder_contents_api(
    folder_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """获取文件夹内容"""
    users = load_users()
    documents = load_documents()

    # 验证文件夹存在
    folder = None
    for d in documents:
        if d["id"] == folder_id and d.get("is_folder"):
            folder = d
            break

    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")

    # 检查权限
    if not can_view_document(current_user, folder, users):
        raise HTTPException(status_code=403, detail="权限不足")

    # 获取文件夹内容
    folder_contents = get_folder_contents(folder_id, documents, include_subfolders=False)

    return {"folder": folder, "contents": folder_contents, "total": len(folder_contents)}

@app.post("/api/documents/upload-folder")
async def upload_folder(
    files: List[UploadFile] = File(...),
    folder_name: str = Form(...),
    description: str = Form(""),
    category: str = Form("其他"),
    visibility: str = Form("private"),
    parent_id: Optional[str] = Form(None),
    file_paths: Optional[List[str]] = Form(None),
    current_user: TokenData = Depends(get_current_user)
):
    """上传文件夹（包含子目录）"""
    # 验证可见性
    if visibility not in ["private", "department", "public"]:
        raise HTTPException(status_code=400, detail="无效的可见性设置")

    # 获取用户信息
    users = load_users()
    user = users.get(current_user.user_id)

    documents = load_documents()

    # 创建文件夹记录
    folder = {
        "id": str(uuid.uuid4()),
        "title": folder_name,
        "description": description,
        "filename": "",
        "original_filename": "",
        "file_size": 0,
        "file_type": "folder",
        "category": category,
        "visibility": visibility,
        "owner_id": current_user.user_id,
        "owner_name": user["name"] if user else current_user.username,
        "owner_department": user["department"] if user else "",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "download_count": 0,
        "view_count": 0,
        "is_folder": True,
        "folder_path": "",
        "parent_id": parent_id
    }

    documents.append(folder)

    # 处理所有文件
    for i, file in enumerate(files):
        # 获取相对路径（如果提供了file_paths）
        relative_path = ""
        if file_paths and i < len(file_paths):
            relative_path = file_paths[i]

        # 生成唯一文件名
        file_ext = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOADS_DIR / unique_filename

        # 保存文件
        content = await file.read()
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        # 确定文件夹路径和父ID
        folder_path = ""
        file_parent_id = folder["id"]

        if relative_path:
            # 提取目录部分（去掉文件名）
            dir_part = "/".join(relative_path.split("/")[:-1])
            if dir_part:
                folder_path = dir_part
                # 这里可以创建嵌套文件夹，但为了简化，将所有文件放在主文件夹下
                # 未来可以改进为创建完整的目录结构
                file_parent_id = folder["id"]

        # 创建文档记录
        document = {
            "id": str(uuid.uuid4()),
            "title": Path(file.filename).stem,
            "description": f"文件夹 {folder_name} 中的文件",
            "filename": unique_filename,
            "original_filename": file.filename,
            "file_size": len(content),
            "file_type": get_file_type(file.filename, file.content_type),
            "category": category,
            "visibility": visibility,
            "owner_id": current_user.user_id,
            "owner_name": user["name"] if user else current_user.username,
            "owner_department": user["department"] if user else "",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "download_count": 0,
            "view_count": 0,
            "is_folder": False,
            "folder_path": folder_path,
            "parent_id": file_parent_id
        }

        documents.append(document)

    save_documents(documents)

    return {"message": "文件夹上传成功", "folder": folder, "file_count": len(files)}

@app.delete("/api/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """删除文档或文件夹"""
    users = load_users()
    documents = load_documents()

    document = None
    for d in documents:
        if d["id"] == document_id:
            document = d
            break

    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 检查权限
    if not can_delete_document(current_user, document, users):
        raise HTTPException(status_code=403, detail="权限不足")

    # 如果是文件夹，递归删除所有内容
    if document.get("is_folder"):
        documents = delete_folder_recursive(document_id, documents, UPLOADS_DIR)
    else:
        # 删除文件
        file_path = UPLOADS_DIR / document["filename"]
        if file_path.exists():
            file_path.unlink()

        # 删除文档记录
        documents = [d for d in documents if d["id"] != document_id]

    save_documents(documents)

    return {"message": "文档删除成功"}

@app.get("/api/documents/{document_id}/preview")
async def preview_document(
    document_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """预览文档"""
    users = load_users()
    documents = load_documents()
    
    document = None
    for d in documents:
        if d["id"] == document_id:
            document = d
            break
    
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 检查权限
    if not can_view_document(current_user, document, users):
        raise HTTPException(status_code=403, detail="权限不足")
    
    file_path = UPLOADS_DIR / document["filename"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 增加查看次数
    document["view_count"] = document.get("view_count", 0) + 1
    save_documents(documents)
    
    # 对文件名进行URL编码
    from urllib.parse import quote
    original_filename = document["original_filename"]
    encoded_filename = quote(original_filename, safe='')
    
    return FileResponse(
        str(file_path),
        filename=original_filename,
        media_type=document.get("file_type", "application/octet-stream"),
        content_disposition_type="inline"
    )

@app.get("/api/documents/{document_id}/download")
async def download_document(
    document_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """下载文档"""
    import zipfile
    from io import BytesIO
    from urllib.parse import quote

    users = load_users()
    documents = load_documents()

    document = None
    for d in documents:
        if d["id"] == document_id:
            document = d
            break

    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 检查权限
    if not can_view_document(current_user, document, users):
        raise HTTPException(status_code=403, detail="权限不足")

    # 如果是文件夹，打包成zip下载
    if document.get("is_folder"):
        folder_contents = get_folder_contents(document_id, documents)

        # 创建内存中的zip文件
        zip_buffer = BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for doc in folder_contents:
                if not doc.get("is_folder"):  # 只添加实际文件
                    file_path = UPLOADS_DIR / doc["filename"]
                    if file_path.exists():
                        # 构建zip中的路径（保持目录结构）
                        folder_name = document["title"]
                        relative_path = doc.get("folder_path", "")
                        if relative_path:
                            zip_path = f"{folder_name}/{relative_path}/{doc['original_filename']}"
                        else:
                            zip_path = f"{folder_name}/{doc['original_filename']}"
                        # 清理路径
                        zip_path = zip_path.replace("//", "/")
                        zip_file.write(str(file_path), zip_path)

        # 准备zip文件响应
        zip_buffer.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"{document['title']}_{timestamp}.zip"

        # 增加文件夹下载次数
        for doc in documents:
            if doc["id"] == document_id:
                doc["download_count"] = doc.get("download_count", 0) + 1
                break
        save_documents(documents)

        encoded_filename = quote(zip_filename, safe='')

        return FileResponse(
            path=zip_buffer,
            filename=zip_filename,
            media_type="application/zip"
        )
    else:
        # 单个文件下载
        file_path = UPLOADS_DIR / document["filename"]
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="文件不存在")

        # 增加下载次数
        document["download_count"] = document.get("download_count", 0) + 1
        save_documents(documents)

        # 对文件名进行URL编码
        original_filename = document["original_filename"]
        encoded_filename = quote(original_filename, safe='')

        return FileResponse(
            str(file_path),
            filename=original_filename,
            media_type="application/octet-stream"
        )

# ==================== 批复系统 ====================

@app.post("/api/comments")
async def create_comment(
    request: CreateCommentRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """添加批复"""
    users = load_users()
    documents = load_documents()
    
    # 验证文档存在
    document = None
    for d in documents:
        if d["id"] == request.document_id:
            document = d
            break
    
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 检查权限
    if not can_view_document(current_user, document, users):
        raise HTTPException(status_code=403, detail="权限不足")
    
    # 提取@提及
    mentions = extract_mentions(request.content)
    mentioned_user_ids = []
    for username in mentions:
        for u in users.values():
            if u["username"] == username:
                mentioned_user_ids.append(u["id"])
                break
    
    # 创建批复
    user = users.get(current_user.user_id)
    comment = {
        "id": str(uuid.uuid4()),
        "document_id": request.document_id,
        "user_id": current_user.user_id,
        "user_name": user["name"] if user else current_user.username,
        "user_level": current_user.level,
        "content": request.content,
        "mentions": mentioned_user_ids,
        "status": "pending",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    save_comment(comment)
    
    return {"message": "批复添加成功", "comment": comment}

@app.get("/api/comments/document/{document_id}")
async def get_document_comments(
    document_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """获取文档的批复"""
    users = load_users()
    documents = load_documents()
    
    # 验证文档存在
    document = None
    for d in documents:
        if d["id"] == document_id:
            document = d
            break
    
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 检查权限
    if not can_view_document(current_user, document, users):
        raise HTTPException(status_code=403, detail="权限不足")
    
    # 获取批复
    all_comments = load_comments()
    document_comments = [c for c in all_comments if c["document_id"] == document_id]
    
    # 按时间排序
    document_comments.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {"comments": document_comments, "total": len(document_comments)}

@app.put("/api/comments/{comment_id}")
async def update_comment_status(
    comment_id: str,
    status: str = Form(...),
    current_user: TokenData = Depends(get_current_user)
):
    """更新批复状态"""
    if status not in ["pending", "resolved"]:
        raise HTTPException(status_code=400, detail="无效的状态")
    
    comments = load_comments()
    comment = None
    for c in comments:
        if c["id"] == comment_id:
            comment = c
            break
    
    if not comment:
        raise HTTPException(status_code=404, detail="批复不存在")
    
    # 检查权限（只有批复作者、文档所有者或管理员可以更新）
    users = load_users()
    documents = load_documents()
    
    document = None
    for d in documents:
        if d["id"] == comment["document_id"]:
            document = d
            break
    
    if comment["user_id"] != current_user.user_id:
        if document and document["owner_id"] != current_user.user_id:
            if current_user.level != 0:
                raise HTTPException(status_code=403, detail="权限不足")
    
    update_comment_in_file(comment_id, {"status": status})
    
    return {"message": "批复状态更新成功"}

# ==================== 系统信息 ====================

@app.get("/api/categories")
async def get_categories():
    """获取文档分类"""
    return {"categories": CATEGORIES}

@app.get("/api/user/levels")
async def get_user_levels():
    """获取用户等级定义"""
    return {"levels": USER_LEVELS}

@app.get("/api/user/departments")
async def get_departments():
    """获取部门列表"""
    return {"departments": DEPARTMENTS}

@app.get("/api/stats")
async def get_stats(current_user: TokenData = Depends(get_current_user)):
    """获取统计信息"""
    users = load_users()
    documents = load_documents()
    comments = load_comments()
    
    # 根据权限统计
    if current_user.level == 0:
        visible_docs = documents
    elif current_user.level == 1:
        visible_docs = [d for d in documents if d["owner_department"] == current_user.department]
    else:
        visible_docs = [d for d in documents if can_view_document(current_user, d, users)]
    
    # 文档统计
    doc_by_category = {}
    for d in visible_docs:
        cat = d["category"]
        doc_by_category[cat] = doc_by_category.get(cat, 0) + 1
    
    doc_by_visibility = {}
    for d in visible_docs:
        vis = d["visibility"]
        doc_by_visibility[vis] = doc_by_visibility.get(vis, 0) + 1
    
    # 用户统计
    if current_user.level == 0:
        user_count = len(users)
    elif current_user.level == 1:
        user_count = len([u for u in users.values() if u["department"] == current_user.department])
    else:
        user_count = 1
    
    return {
        "total_documents": len(visible_docs),
        "total_users": user_count,
        "total_comments": len(comments),
        "documents_by_category": doc_by_category,
        "documents_by_visibility": doc_by_visibility,
        "storage_used": sum(d["file_size"] for d in visible_docs)
    }

@app.get("/api/me")
async def get_current_user_info(current_user: TokenData = Depends(get_current_user)):
    """获取当前用户信息"""
    users = load_users()
    user = users.get(current_user.user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "email": user["email"],
        "department": user["department"],
        "level": user["level"],
        "role": user["role"],
        "supervisor_id": user.get("supervisor_id"),
        "is_active": user.get("is_active", True)
    }

# ==================== 主程序入口 ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8891)
