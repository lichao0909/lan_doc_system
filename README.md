# 企业文档管理系统

基于 FastAPI 的局域网文档管理系统，支持用户分级、权限控制、文档管理和批复意见功能。

## 功能特性

### 用户分级系统
- **系统管理员 (Level 0)**: 所有权限
- **部门主管 (Level 1)**: 管理部门和下属
- **普通员工 (Level 2)**: 管理个人文档
- **访客 (Level 3)**: 只读权限

### 文档管理
- 文件上传/下载/预览
- 文档分类管理
- 权限控制（私有/部门/公开）
- 拖拽上传支持

### 批复系统
- 文档批复意见
- @提及用户功能
- 批复状态管理（待处理/已解决）

### 安全特性
- JWT 令牌认证
- SHA256 密码哈希
- 细粒度权限控制

## 技术栈

- **后端**: Python + FastAPI
- **前端**: HTML5 + TailwindCSS + JavaScript
- **存储**: 文件系统 (JSON/CSV)
- **认证**: JWT + SHA256

## 快速开始

### Windows
```bash
start.bat
```

### Linux/Mac
```bash
./start.sh
```

### 手动启动
```bash
# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py
```

## 默认账号

| 账号 | 密码 | 等级 |
|------|------|------|
| admin | admin123 | 系统管理员 |
| manager1 | manager123 | 部门主管 |
| staff1 | staff123 | 普通员工 |
| guest1 | guest123 | 访客 |

## 访问系统

启动后访问: http://localhost:8891

## API 文档

启动后访问:
- Swagger UI: http://localhost:8891/docs
- ReDoc: http://localhost:8891/redoc

## 项目结构

```
lan_doc_system/
├── main.py              # FastAPI 主程序
├── requirements.txt     # Python 依赖
├── start.bat           # Windows 启动脚本
├── start.sh            # Linux/Mac 启动脚本
├── README.md           # 项目说明
├── static/             # 前端文件
│   ├── index.html      # 主页面
│   ├── style.css       # 样式文件
│   └── app.js          # 前端逻辑
├── data/               # 数据文件
│   ├── users.json      # 用户数据
│   ├── documents.csv   # 文档元数据
│   └── comments.jsonl  # 批复记录
├── uploads/            # 上传文件存储
└── cache/              # 缓存目录
```

## 数据存储

### 用户数据 (users.json)
```json
{
  "id": "uuid",
  "username": "登录名",
  "password": "SHA256哈希",
  "employee_id": "员工编号",
  "name": "真实姓名",
  "email": "邮箱",
  "department": "部门",
  "level": 0-3,
  "supervisor_id": "上级ID",
  "role": "角色名称",
  "is_active": true
}
```

### 文档数据 (documents.csv)
- 文档元数据存储
- 实际文件存储在 uploads/ 目录

### 批复数据 (comments.jsonl)
- 每行一个 JSON 对象
- 支持@提及功能

## 权限规则

### 文档查看权限
1. 系统管理员可查看所有文档
2. 文档所有者可查看自己的文档
3. 公开文档所有人可见
4. 部门文档同部门可见
5. 上级可查看下属文档

### 文档编辑权限
1. 系统管理员可编辑所有文档
2. 文档所有者可编辑自己的文档
3. 部门主管可编辑本部门文档
4. 上级可编辑下属文档

### 文档删除权限
1. 系统管理员可删除所有文档
2. 文档所有者可删除自己的文档
3. 部门主管可删除本部门文档

## 开发计划

- [x] 用户认证系统
- [x] 用户分级管理
- [x] 文档上传下载
- [x] 权限控制系统
- [x] 批复意见系统
- [x] 统计报表
- [ ] 文档版本控制
- [ ] 全文搜索
- [ ] 文档在线预览
- [ ] 批量操作

## 许可证

MIT License
