$project = 'C:\TATUER\01a011c4-029e-7a90-ab38-15bf3b73ac13'
Set-Location $project
Copy-Item 'src\boot\dragonCrossArt.ts' 'src\boot\dragonCrossArt.before-tattoo.bak' -Force
Invoke-WebRequest -UseBasicParsing -Uri 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663861449043/ezhgvHQIQaQmlzYf.ts' -OutFile 'src\boot\dragonCrossArt.ts'
$p = 'src\boot\BootSequence.tsx'
$s = Get-Content -Raw -Encoding UTF8 $p
$s = $s.Replace('const artWidth = 52;', 'const artWidth = Math.max(...dragonCrossArt.map(line => line.length));')
[System.IO.File]::WriteAllText((Join-Path $project $p), $s, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'tattoo dragon installed'
