<#
zotero2obsidian-autosync 설치

  1. Obsidian 볼트에 논문 노트 템플릿을 복사한다 (이미 있으면 건드리지 않음)
  2. config.json 을 만든다
  3. Zotero 설정을 바꾼다 — 로컬 API 켜기, Better Notes 에 Pass 2 노트 템플릿 등록
     (Zotero 가 켜져 있으면 설정이 덮어써지므로 건너뛴다. Zotero 를 끄고 다시 실행하면 된다)
  4. 작업 스케줄러에 감시 작업을 등록한다 — 로그온할 때 zotero_watch.ps1 을 창 없이 띄워,
     Zotero 가 바뀌면 몇 초 안에 동기화한다. 기본은 '사용 안 함' 상태. -EnableTask 로 바로 켤 수 있다

  예:  powershell -ExecutionPolicy Bypass -File install.ps1 -VaultPath "C:\Users\me\Documents\Obsidian Vault"
#>
param(
  [string]$VaultPath,
  [string]$PapersFolder = 'Papers',
  [string]$TemplateFolder = 'Templates',
  [string]$ImageFolder,
  [string]$TaskName = 'zotero2obsidian-autosync',
  [switch]$EnableTask,
  [switch]$SkipZotero,
  [switch]$SkipTask
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Utf8 = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Web.Extensions
$Json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
function J([string]$s) { $Json.Serialize($s) }
function Step([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }

# ---------------------------------------------------------------- 1. 볼트와 템플릿
Step '볼트'
if (-not $VaultPath) { $VaultPath = Read-Host 'Obsidian 볼트 폴더 경로' }
$VaultPath = $VaultPath.Trim('"').TrimEnd('\')
if (-not (Test-Path -LiteralPath $VaultPath)) { throw "폴더가 없습니다: $VaultPath" }
if (-not (Test-Path -LiteralPath (Join-Path $VaultPath '.obsidian'))) { Write-Warning '.obsidian 폴더가 없습니다. Obsidian 볼트가 맞는지 확인하세요.' }

if (-not $ImageFolder) {
  # Obsidian 의 첨부 파일 폴더 설정이 있으면 그 아래 zotero/ 에 둔다
  $ImageFolder = 'Attachments\zotero'
  $app = Join-Path $VaultPath '.obsidian\app.json'
  if (Test-Path -LiteralPath $app) {
    $a = $Json.DeserializeObject([IO.File]::ReadAllText($app, $Utf8))
    $p = [string]$a['attachmentFolderPath']
    if ($p -and $p -ne '/' -and -not $p.StartsWith('.')) { $ImageFolder = ($p.Trim('/') -replace '/', '\') + '\zotero' }
  }
}

$tplName = 'paper-note.md'
$tplDst = Join-Path (Join-Path $VaultPath $TemplateFolder) $tplName
if (Test-Path -LiteralPath $tplDst) { Write-Host "템플릿이 이미 있어 그대로 둡니다: $tplDst" }
else {
  New-Item -ItemType Directory -Force (Split-Path $tplDst) | Out-Null
  Copy-Item -LiteralPath (Join-Path $Root "obsidian\$tplName") -Destination $tplDst
  Write-Host "템플릿 복사: $tplDst"
}

# ---------------------------------------------------------------- 2. config.json
Step 'config.json'
$cfgPath = Join-Path $Root 'config.json'
if (Test-Path -LiteralPath $cfgPath) { Copy-Item -LiteralPath $cfgPath "$cfgPath.bak" -Force; Write-Host '기존 config.json 은 config.json.bak 으로 백업' }
$cfg = @"
{
  "vaultPath": $(J $VaultPath),
  "papersFolder": $(J $PapersFolder),
  "templatePath": $(J (Join-Path $TemplateFolder $tplName)),
  "imageFolder": $(J $ImageFolder),
  "zoteroDataDir": "",
  "sections": ["1. Prior work", "2. Limitations of prior work", "3. Method", "4. Experiments"]
}
"@
[IO.File]::WriteAllText($cfgPath, $cfg.Replace("`r`n", "`n"), $Utf8)
Write-Host $cfg

# ---------------------------------------------------------------- 3. Zotero 설정
function Set-Pref([string]$text, [string]$name, [string]$literal) {
  $line = "user_pref($(J $name), $literal);"
  $pat = '(?m)^user_pref\(' + [regex]::Escape((J $name)) + ',.*\);(?=\r?$)'
  if ([regex]::IsMatch($text, $pat)) { return [regex]::Replace($text, $pat, { param($m) $line }) }
  return $text.TrimEnd("`r", "`n") + "`r`n" + $line + "`r`n"
}

Step 'Zotero 설정'
if ($SkipZotero) { Write-Host '-SkipZotero: 건너뜀' }
elseif (Get-Process zotero -ErrorAction SilentlyContinue) {
  Write-Warning 'Zotero 가 켜져 있어 설정을 바꾸지 않았습니다. Zotero 를 완전히 끄고 install.ps1 을 다시 실행하세요.'
}
else {
  $profiles = @(Get-ChildItem "$env:APPDATA\Zotero\Zotero\Profiles\*\prefs.js" -ErrorAction SilentlyContinue)
  if ($profiles.Count -eq 0) { Write-Warning 'Zotero 프로필(prefs.js)을 찾지 못했습니다. Zotero 를 한 번 실행한 뒤 다시 시도하세요.' }
  foreach ($pf in $profiles) {
    $bak = "$($pf.FullName).bak-zotero2obsidian"
    if (-not (Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $pf.FullName $bak }
    $text = [IO.File]::ReadAllText($pf.FullName, $Utf8)

    $text = Set-Pref $text 'extensions.zotero.httpServer.localAPI.enabled' 'true'
    Write-Host "로컬 API 켬: $($pf.Directory.Name)"

    $P = 'extensions.zotero.Knowledge4Zotero.'
    $km = [regex]::Match($text, '(?m)^user_pref\("' + [regex]::Escape($P) + 'templateKeys", (".*")\);(?=\r?$)')
    if ($km.Success) {
      $key = '[Item]Paper Pass 2'
      $html = [IO.File]::ReadAllText((Join-Path $Root 'zotero\pass2-note-template.html'), $Utf8).Replace("`r`n", "`n").Trim()
      $text = Set-Pref $text ($P + 'template.' + $key) (J (J $html))
      $keys = @($Json.DeserializeObject($Json.DeserializeObject($km.Groups[1].Value)))
      if ($keys -notcontains $key) { $keys += $key }
      $text = Set-Pref $text ($P + 'templateKeys') (J ($Json.Serialize([object[]]$keys)))
      Write-Host "Better Notes 템플릿 등록: $key"
    }
    else {
      Write-Warning 'Better Notes 설정을 찾지 못했습니다. Better Notes 를 설치하고 Zotero 를 한 번 켰다 끈 뒤 다시 실행하거나, README 의 "Pass 2 템플릿 직접 등록" 을 따라 하세요.'
    }
    [IO.File]::WriteAllText($pf.FullName, $text, $Utf8)
    Write-Host "원래 설정 백업: $bak"
  }
}

# ---------------------------------------------------------------- 4. 작업 스케줄러
Step '작업 스케줄러'
if ($SkipTask) { Write-Host '-SkipTask: 건너뜀' }
else {
  # 로그온할 때 감시 스크립트를 띄운다. 매시간 트리거는 감시가 멈췄을 때 다시 띄우기 위한 것 (이미 돌고 있으면 무시됨)
  $vbs = Join-Path $Root 'scripts\zotero_watch_hidden.vbs'
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
  $onLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $hourly = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $onLogon, $hourly -Settings $settings -Description "Zotero -> Obsidian 논문 노트 동기화 ($Root)" -Force | Out-Null
  if ($EnableTask) { Start-ScheduledTask -TaskName $TaskName; Write-Host "등록하고 켰습니다: $TaskName (Zotero 가 바뀌면 몇 초 안에 동기화)" }
  else {
    Disable-ScheduledTask -TaskName $TaskName | Out-Null
    Write-Host "등록했습니다 (지금은 '사용 안 함'): $TaskName"
  }
}

Step '다음 단계'
Write-Host '1. Zotero 를 켭니다.'
Write-Host '2. 미리보기 (파일을 쓰지 않음):'
Write-Host "     powershell -ExecutionPolicy Bypass -File `"$Root\scripts\zotero_sync.ps1`" -DryRun"
Write-Host '3. 결과가 괜찮으면 한 번 실행:'
Write-Host "     powershell -ExecutionPolicy Bypass -File `"$Root\scripts\zotero_sync.ps1`" -Force"
if (-not $SkipTask -and -not $EnableTask) {
  Write-Host '4. 자동 실행 켜기:'
  Write-Host "     Enable-ScheduledTask -TaskName $TaskName; Start-ScheduledTask -TaskName $TaskName"
}
