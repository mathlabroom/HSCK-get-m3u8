@echo off
cd /d "%~dp0"
chcp 65001 >nul

set "NAMES=动漫 国产系列 欧美高清 骑兵破解 日本无码 日本有码 无码中文字幕 有码中文字幕"

echo === 正在批量启动收割机 ===

for %%n in (%NAMES%) do (
    if exist "%%n.js" (
        echo 正在启动: %%n
        start "收割-%%n" node "%%n.js" 1 60 %%n
    ) else ( 
        echo 找不到文件: %%n.js
    )
)

pause