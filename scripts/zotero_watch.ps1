<#
Zotero 변화 감시 → 바뀌면 바로 zotero_sync.ps1 실행

  5초마다 Zotero 로컬 API 에 "가장 최근에 바뀐 아이템 1개"만 물어본다 (가볍다).
  무언가 바뀌었고, 그 뒤 5초 동안 더 안 바뀌면 (= 노트 입력이 잠깐 멈추면) 동기화를 한 번 돌린다.
  Zotero 가 꺼져 있으면 30초마다 다시 확인하며 기다린다.

  작업 스케줄러가 로그온할 때 zotero_watch_hidden.vbs 로 창 없이 띄운다. 한 번에 하나만 실행된다.
  실행:   powershell -ExecutionPolicy Bypass -File zotero_watch.ps1 [-PollSeconds 5] [-QuietSeconds 5]
#>
param([int]$PollSeconds = 5, [int]$QuietSeconds = 5)

$Sync = Join-Path $PSScriptRoot 'zotero_sync.ps1'
$Api  = 'http://127.0.0.1:23119/api/users/0/items?limit=1&sort=dateModified&direction=desc'

# 이미 감시 중이면 끝낸다
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\zotero2obsidian-watch', [ref]$created)
if (-not $created) { exit 0 }

function Get-LibVersion {
  # 전체 아이템 수 + 가장 최근에 바뀐 아이템의 키와 수정 시각 — 논문·노트를 추가하거나 고치면 이 값이 바뀐다
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = [Text.Encoding]::UTF8
  try {
    $body = $wc.DownloadString($Api)
    $k = [regex]::Match($body, '"key"\s*:\s*"([^"]+)"').Groups[1].Value
    $d = [regex]::Match($body, '"dateModified"\s*:\s*"([^"]+)"').Groups[1].Value
    return [string]$wc.ResponseHeaders['Total-Results'] + '|' + $k + '|' + $d
  }
  finally { $wc.Dispose() }
}

function Invoke-Sync {
  $p = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$Sync`"") -WindowStyle Hidden -PassThru -Wait
  return $p.ExitCode
}

$lastSynced = $null     # 마지막으로 동기화를 돌린 시점의 값
$lastSeen   = $null     # 직전 확인에서 본 값
$changedAt  = [DateTime]::MinValue

while ($true) {
  try { $v = Get-LibVersion }
  catch { $lastSeen = $null; Start-Sleep -Seconds 30; continue }     # Zotero 꺼짐

  if ($v -ne $lastSeen) { $lastSeen = $v; $changedAt = Get-Date }
  elseif ($v -ne $lastSynced -and ((Get-Date) - $changedAt).TotalSeconds -ge $QuietSeconds) {
    Invoke-Sync | Out-Null
    $lastSynced = $v
  }
  Start-Sleep -Seconds $PollSeconds
}
