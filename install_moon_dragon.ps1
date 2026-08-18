$project = 'C:\TATUER\01a011c4-029e-7a90-ab38-15bf3b73ac13'
Set-Location $project
Copy-Item 'src\boot\dragonCrossArt.ts' 'src\boot\dragonCrossArt.before-moon.bak' -Force
Invoke-WebRequest -UseBasicParsing -Uri 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663861449043/aphQGLrAoohmFMLS.ts' -OutFile 'src\boot\dragonCrossArt.ts'
Write-Output 'moon dragon installed'
