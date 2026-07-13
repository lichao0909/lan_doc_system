@echo off
chcp 65001 >nul
title 企业文档管理系统

echo ==========================================
echo    企业文档管理系统 - 启动脚本
echo ==========================================
echo.

:: 检查Python环境
echo [1/5] 检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Python，请先安装Python 3.8+
    pause
    exit /b 1
)
echo [OK] Python已安装

:: 创建虚拟环境
echo.
echo [2/5] 创建虚拟环境...
if not exist venv (
    python -m venv venv
    echo [OK] 虚拟环境已创建
) else (
    echo [OK] 虚拟环境已存在
)

:: 激活虚拟环境
call venv\Scripts\activate.bat

:: 安装依赖
echo.
echo [3/5] 安装依赖包...
pip install -q -r requirements.txt
if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo [OK] 依赖包已安装

:: 初始化数据
echo.
echo [4/5] 初始化数据文件...
if not exist data\users.json (
    echo [INFO] 将在首次启动时创建默认用户数据
)
echo [OK] 数据目录已就绪

:: 启动服务
echo.
echo [5/5] 启动服务...
echo.
echo ==========================================
echo    系统已启动！
echo    访问地址: http://localhost:8891
echo.
echo    默认账号:
echo    管理员:  admin / admin123
echo    主管:    manager1 / manager123
echo    员工:    staff1 / staff123
echo    访客:    guest1 / guest123
echo ==========================================
echo.
echo 按Ctrl+C停止服务
echo.

python main.py

pause
