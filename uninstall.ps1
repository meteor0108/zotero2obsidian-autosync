<#
zotero2obsidian-autosync 제거 — 작업 스케줄러 작업만 지운다.

  볼트의 노트, 템플릿, config.json 은 그대로 둔다.
  Zotero 설정은 되돌리지 않는다. 되돌리려면 Zotero 를 끄고
  %APPDATA%\Zotero\Zotero\Profiles\<프로필>\prefs.js.bak-zotero2obsidian 을 prefs.js 로 복사한다.
#>
param([string]$TaskName = 'zotero2obsidian-autosync')

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "작업 스케줄러에서 지웠습니다: $TaskName"
}
else { Write-Host "등록된 작업이 없습니다: $TaskName" }
