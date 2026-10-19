@echo off
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
for %%I in ("%HERE%") do set "ROOT=%%~dpI"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
echo %ROOT%| clip
echo.
echo 已复制安装地址到剪贴板:
echo   %ROOT%
echo.
echo 下一步:
echo   打开 DSH -^> 左侧「插件」-^> 「添加插件」
echo   粘贴地址 -^> 安装 -^> 重启一次 DSH
echo.
pause
