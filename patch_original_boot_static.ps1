$project = 'C:\TATUER\01a011c4-029e-7a90-ab38-15bf3b73ac13'
Set-Location $project
$path = Join-Path $project 'src\boot\BootSequence.tsx'
Copy-Item $path (Join-Path $project 'src\boot\BootSequence.before-static-grid.bak') -Force
$boot = [System.IO.File]::ReadAllText($path)
$boot = $boot -replace "import type \{TerminalSize\} from '../utils/useTerminalSize\.js';", "import type {TerminalSize} from '../utils/useTerminalSize.js';`r`nimport {dragonCrossArt} from './dragonCrossArt.js';"
$boot = [regex]::Replace($boot, '(?s)const dragonForm = \[.*?\] as const;\r?\n', '')
$boot = [regex]::Replace($boot, '(?s)function revealLine\(line: string, amount: number\) \{.*?\r?\n\}\r?\n', '')
$boot = $boot.Replace('  const identityAmount = Math.min(1, Math.max(0, (tick - 42) / 20));`r`n', '')
$helper = @'
function fixedArtLine(line: string, width: number) {
  const artWidth = 52;
  if (width <= artWidth) return fit(line, width);
  const left = Math.floor((width - artWidth) / 2);
  return `${' '.repeat(left)}${line.padEnd(artWidth, ' ')}`.slice(0, width);
}
'@
$boot = $boot.Replace('export function BootSequence({size, onComplete}: BootSequenceProps) {', $helper + "`r`nexport function BootSequence({size, onComplete}: BootSequenceProps) {")
$pattern = '(?s)  if \(tick > 36\) \{.*?  \}\r?\n\r?\n  if \(tick > 54\)'
$replacement = @'
  if (tick > 36 && !collapse) {
    rows.length = 0;
    for (const [index, line] of dragonCrossArt.entries()) {
      rows.push({
        text: fixedArtLine(line, width),
        color: line.includes('O|') ? palette.amber : tick > 56 || index > 6 ? palette.cyan : palette.cyanSoft
      });
    }
  }

  if (tick > 54)
'@
$boot = [regex]::Replace($boot, $pattern, $replacement, 1)
[System.IO.File]::WriteAllText($path, $boot, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'patched static grid'
Select-String -Path $path -Pattern 'dragonCrossArt|fixedArtLine|rows.length = 0|text: fixedArtLine'
