@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

:: 定义你要跑的 8 个脚本文件名 (不带.js)
set NAMES=动漫 国产系列 欧美高清 骑兵破解 日本无码 日本有码 无码中文字幕 有码中文字幕

echo === 正在批量启动收割机 (自动截止至昨天) ===

for %%n in (%NAMES%) do (
    if exist "%%n.js" (
        :: 传参：起始页 终止页 进程标识
        start "收割机-%%n" node "%%n.js" 1 60 %%n
    )
)

echo.
echo 所有窗口已弹出。跑完后请检查 VideoResults 目录下的合并文件。
pause