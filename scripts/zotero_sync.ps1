<#
Zotero → Obsidian 논문 노트 동기화 (Zotero 로컬 API 사용, Zotero가 켜져 있을 때만 동작)

  - Zotero에 새 논문이 있으면 템플릿(config.json 의 templatePath)으로 노트를 만든다.
      위치: <papersFolder>/<논문이 들어 있는 Zotero 최상위 컬렉션>/   (컬렉션이 없으면 <papersFolder>/)
      이름: <Short Title> (<연도>).md   — Short Title 이 없으면 제목의 ':' 앞부분
  - 속성(authors, year, venue, url, zotero, pdf ...)은 **비어 있을 때만** 채운다. 직접 쓴 값은 건드리지 않는다.
  - 논문의 자식 노트 중 Pass 2 노트(<h1>Pass 2</h1> 이거나 sections 와 같은 h2 가 있는 노트)의
    섹션을 볼트 노트의 같은 이름 헤더 밑 %% zotero:start %% ~ %% zotero:end %% 사이에 넣는다.
    그 사이는 매번 덮어쓴다. 수정은 Zotero에서. 노트 안 그림은 <imageFolder>/ 로 복사한다.
  - 이미 있는 노트는 zotero: 속성의 아이템 키로, 없으면 이름+연도로 짝을 찾는다.
    애매하면 아무것도 하지 않고 로그(zotero-sync.log)에 남긴다. Zotero에 없는 노트는 건드리지 않는다.

  설정:   저장소 루트의 config.json (install.ps1 이 만든다. 예시는 config.example.json)
  실행:   powershell -ExecutionPolicy Bypass -File scripts\zotero_sync.ps1 [-DryRun] [-Force] [-Config <경로>]
    -DryRun  파일을 쓰지 않고 할 일만 출력
    -Force   Zotero 라이브러리가 지난번 이후 안 바뀌었어도 전부 다시 확인
#>
param([switch]$DryRun, [switch]$Force, [string]$Config)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Utf8 = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Web.Extensions
$Json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$Json.MaxJsonLength = [int]::MaxValue

if (-not $Config) { $Config = Join-Path $Root 'config.json' }
if (-not (Test-Path -LiteralPath $Config)) { Write-Host "설정 파일이 없습니다: $Config  (install.ps1 을 먼저 실행하세요)"; exit 1 }
$cfg = $Json.DeserializeObject([IO.File]::ReadAllText($Config, $Utf8))
function Cfg([string]$key, $default) { if ($cfg.ContainsKey($key) -and $cfg[$key]) { return $cfg[$key] }; return $default }

$Vault     = [string](Cfg 'vaultPath' '')
if (-not $Vault -or -not (Test-Path -LiteralPath $Vault)) { Write-Host "vaultPath 가 없거나 잘못됐습니다: $Vault"; exit 1 }
$Papers    = Join-Path $Vault (Cfg 'papersFolder' 'Papers')
$Template  = Join-Path $Vault (Cfg 'templatePath' 'Templates\paper-note.md')
$ImgDir    = Join-Path $Vault (Cfg 'imageFolder' 'Attachments\zotero')
$Sections  = @(Cfg 'sections' @('1. Prior work', '2. Limitations of prior work', '3. Method', '4. Experiments'))
$StateFile = Join-Path $Root '.zotero-sync-state.json'
$LogFile   = Join-Path $Root 'zotero-sync.log'
$Api       = 'http://127.0.0.1:23119/api/users/0'
$MarkStart = '%% zotero:start %%'
$MarkEnd   = '%% zotero:end %%'
$ImgMap    = @{}                                     # Zotero 노트 그림 attachmentKey → 볼트 파일 이름 (논문마다 다시 채움)

# Zotero 데이터 폴더 (그림 원본이 storage/<key>/ 에 있음). config 에 없으면 Zotero 설정에서 찾는다.
$ZoteroData = [string](Cfg 'zoteroDataDir' '')
if (-not $ZoteroData) {
  $ZoteroData = Join-Path $env:USERPROFILE 'Zotero'
  $prefsFile = Get-ChildItem "$env:APPDATA\Zotero\Zotero\Profiles\*\prefs.js" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($prefsFile) {
    $dm = Select-String -Path $prefsFile.FullName -Pattern 'user_pref\("extensions\.zotero\.dataDir", "(.*)"\);' | Select-Object -First 1
    if ($dm) { $ZoteroData = $dm.Matches[0].Groups[1].Value -replace '\\\\', '\' }
  }
}

$Log = New-Object System.Collections.Generic.List[string]
function Say([string]$msg) { $Log.Add($msg); Write-Host $msg }

# ---------------------------------------------------------------- Zotero API

function Get-Api([string]$path) {
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = [System.Text.Encoding]::UTF8
  $wc.Headers.Add('Zotero-API-Version', '3')
  $body = $wc.DownloadString("$Api$path")
  return @{ Data = $Json.DeserializeObject($body); Headers = $wc.ResponseHeaders }
}

function Get-All([string]$path) {
  $all = New-Object System.Collections.Generic.List[object]
  $start = 0
  while ($true) {
    $sep = if ($path.Contains('?')) { '&' } else { '?' }
    $r = Get-Api "$path${sep}limit=100&start=$start"
    $page = @($r.Data)
    foreach ($x in $page) { $all.Add($x) }
    $total = [int]$r.Headers['Total-Results']
    $start += 100
    if ($page.Count -eq 0 -or $start -ge $total) { break }
  }
  return , $all
}

# ---------------------------------------------------------------- 문자열 도우미

function Norm([string]$s) {
  if (-not $s) { return '' }
  return ($s.ToLowerInvariant() -replace '[^\p{L}\p{Nd}]', '')
}

function Strip-Tags([string]$html) {
  return [System.Net.WebUtility]::HtmlDecode(($html -replace '<[^>]+>', '')).Trim()
}

function Quote-Yaml([string]$v) {
  if ($v -match '^[\p{L}\p{Nd}(]' -and $v -notmatch ': |\s#|^\d+[-:]|[\[\]{}]' -and $v -notmatch '[''"]$') { return $v }
  return '"' + ($v -replace '\\', '\\' -replace '"', '\"') + '"'
}

function Safe-FileName([string]$s) {
  $s = ($s -replace '[\\/:*?"<>|]', '-' -replace '\s+', ' ').Trim().TrimEnd('.')
  if ($s.Length -gt 120) { $s = $s.Substring(0, 120).Trim() }
  return $s
}

# ---------------------------------------------------------------- Zotero 노트 HTML → Markdown

function ConvertTo-Md([string]$html, [int]$headShift) {
  $sb = New-Object System.Text.StringBuilder
  $lists = New-Object System.Collections.Generic.List[object]
  $quotes = New-Object System.Collections.Generic.Stack[int]
  $links = New-Object System.Collections.Generic.Stack[string]
  $pre = 0; $preMath = $false; $liFresh = $false; $inTable = $false; $rows = 0; $cells = 0

  $tokens = [regex]::Matches($html, '(?s)<!--.*?-->|<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"'']|"[^"]*"|''[^'']*'')*)>|[^<]+|<')
  foreach ($m in $tokens) {
    $tok = $m.Value
    if ($tok.StartsWith('<!--')) { continue }
    $s = $sb.ToString()
    $atLineStart = ($s.Length -eq 0 -or $s.EndsWith("`n") -or $s.EndsWith(' '))
    $indent = "`t" * [Math]::Max(0, $lists.Count)

    if (-not $m.Groups[2].Success) {
      $t = [System.Net.WebUtility]::HtmlDecode($tok)
      if ($pre -gt 0) { [void]$sb.Append($t); continue }
      $t = ($t -replace '\s+', ' ') -replace '<', '&lt;'
      if ($atLineStart) { $t = $t.TrimStart() }
      if ($t) { [void]$sb.Append($t) }
      continue
    }

    $close = $m.Groups[1].Value -eq '/'
    $tag = $m.Groups[2].Value.ToLowerInvariant()
    $attrs = $m.Groups[3].Value
    $blank = { $x = $sb.ToString(); if ($x.Length -gt 0 -and -not $x.EndsWith("`n`n")) { [void]$sb.Append($(if ($x.EndsWith("`n")) { "`n" } else { "`n`n" })) } }
    $newline = { $x = $sb.ToString(); if ($x.Length -gt 0 -and -not $x.EndsWith("`n")) { [void]$sb.Append("`n") } }

    switch -regex ($tag) {
      '^h([1-6])$' {
        if ($inTable) { break }
        if ($close) { [void]$sb.Append("`n`n") }
        else { & $blank; $lv = [Math]::Min(6, [int]$Matches[1] + $headShift); [void]$sb.Append(('#' * $lv) + ' ') }
        break
      }
      '^p$' {
        if ($inTable -or $pre -gt 0) { break }
        if ($lists.Count -gt 0) {
          if (-not $close) { if ($liFresh) { $liFresh = $false } else { [void]$sb.Append("`n" + $indent) } }
        }
        elseif ($close) { [void]$sb.Append("`n`n") }
        else { & $blank }
        break
      }
      '^(ul|ol)$' {
        if ($close) {
          if ($lists.Count -gt 0) { $lists.RemoveAt($lists.Count - 1) }
          if ($lists.Count -eq 0) { [void]$sb.Append("`n`n") }
        }
        else {
          if ($lists.Count -eq 0) { & $blank }
          $n = 0; if ($attrs -match 'start="?(\d+)') { $n = [int]$Matches[1] - 1 }
          $lists.Add(@{ Ordered = ($tag -eq 'ol'); N = $n })
        }
        break
      }
      '^li$' {
        if (-not $close -and $lists.Count -gt 0) {
          $top = $lists[$lists.Count - 1]; $top.N++
          & $newline
          [void]$sb.Append(("`t" * ($lists.Count - 1)) + $(if ($top.Ordered) { "$($top.N). " } else { '- ' }))
          $liFresh = $true
        }
        break
      }
      '^blockquote$' {
        if (-not $close) { & $blank; $quotes.Push($sb.Length) }
        elseif ($quotes.Count -gt 0) {
          $st = $quotes.Pop()
          $inner = $sb.ToString($st, $sb.Length - $st).Trim("`n")
          $sb.Length = $st
          [void]$sb.Append((($inner -split "`n") | ForEach-Object { if ($_) { "> $_" } else { '>' } }) -join "`n")
          [void]$sb.Append("`n`n")
        }
        break
      }
      '^pre$' {
        if (-not $close) {
          & $blank; $pre++
          $preMath = $attrs -match 'class="[^"]*math'
          if (-not $preMath) { [void]$sb.Append('```' + "`n") }
        }
        else {
          $pre = [Math]::Max(0, $pre - 1)
          if (-not $preMath) { & $newline; [void]$sb.Append('```') }
          [void]$sb.Append("`n`n")
        }
        break
      }
      '^(strong|b)$' { if ($pre -eq 0) { [void]$sb.Append('**') }; break }
      '^(em|i)$' { if ($pre -eq 0) { [void]$sb.Append('*') }; break }
      '^(s|del|strike)$' { [void]$sb.Append('~~'); break }
      '^code$' { if ($pre -eq 0) { [void]$sb.Append('`') }; break }
      '^(sub|sup)$' { [void]$sb.Append($(if ($close) { "</$tag>" } else { "<$tag>" })); break }
      '^a$' {
        if (-not $close) {
          $href = ''; if ($attrs -match 'href="([^"]*)"') { $href = [System.Net.WebUtility]::HtmlDecode($Matches[1]) }
          $links.Push($href); if ($href) { [void]$sb.Append('[') }
        }
        elseif ($links.Count -gt 0) { $href = $links.Pop(); if ($href) { [void]$sb.Append("]($href)") } }
        break
      }
      '^br$' { if ($pre -gt 0) { [void]$sb.Append("`n") } else { [void]$sb.Append("`n" + $indent) }; break }
      '^hr$' { & $blank; [void]$sb.Append("---`n`n"); break }
      '^img$' {
        if ($attrs -match 'data-attachment-key="([A-Za-z0-9]+)"' -and $ImgMap.ContainsKey($Matches[1])) {
          if ($lists.Count -eq 0 -and -not $inTable) { & $blank }
          [void]$sb.Append('![[' + $ImgMap[$Matches[1]] + ']]')
          if ($lists.Count -eq 0 -and -not $inTable) { [void]$sb.Append("`n`n") }
        }
        else { [void]$sb.Append('*(그림: Zotero 노트에서 확인)*') }
        break
      }
      '^table$' {
        if ($close) { $inTable = $false; [void]$sb.Append("`n") } else { & $blank; $inTable = $true; $rows = 0 }
        break
      }
      '^tr$' {
        if (-not $close) { $cells = 0; [void]$sb.Append('|') }
        else {
          [void]$sb.Append("`n"); $rows++
          if ($rows -eq 1) { [void]$sb.Append('|' + (' --- |' * [Math]::Max(1, $cells)) + "`n") }
        }
        break
      }
      '^(td|th)$' { if ($close) { [void]$sb.Append(' |'); $cells++ } else { [void]$sb.Append(' ') }; break }
      default { }
    }
  }

  $md = $sb.ToString() -replace "[ \t]+`n", "`n" -replace "`n{3,}", "`n`n"
  return $md.Trim()
}

# Pass 2 노트 HTML → @{ '1. Prior work' = '<html>' ... }, 그리고 템플릿에 없는 h2 이름들
function Split-Pass2([string]$html) {
  $found = @{}; $other = @()
  $hs = [regex]::Matches($html, '(?is)<h2[^>]*>(.*?)</h2>')
  for ($i = 0; $i -lt $hs.Count; $i++) {
    $name = Strip-Tags $hs[$i].Groups[1].Value
    $from = $hs[$i].Index + $hs[$i].Length
    $to = if ($i + 1 -lt $hs.Count) { $hs[$i + 1].Index } else { $html.Length }
    $sec = $Sections | Where-Object { ($_ -replace '\s', '') -eq ($name -replace '\s', '') } | Select-Object -First 1
    if ($sec) { $found[$sec] = $html.Substring($from, $to - $from) } else { $other += $name }
  }
  return @{ Found = $found; Other = $other }
}

function Test-Pass2Note([string]$html) {
  if ($html -match '(?is)<h1[^>]*>\s*(<[^>]+>\s*)*Pass\s*2') { return $true }
  foreach ($h in [regex]::Matches($html, '(?is)<h2[^>]*>(.*?)</h2>')) {
    $n = (Strip-Tags $h.Groups[1].Value) -replace '\s', ''
    foreach ($s in $Sections) { if ($n -eq ($s -replace '\s', '')) { return $true } }
  }
  return $false
}

# ---------------------------------------------------------------- 볼트 노트 편집

function Split-Note([string]$text) {
  if (-not $text.StartsWith('---')) { return $null }
  $end = $text.IndexOf("`n---", 3)
  if ($end -lt 0) { return $null }
  return @{ Fm = $text.Substring(3, $end - 3); Body = $text.Substring($end) }
}

function Get-Fm([string]$fm, [string]$key) {
  $m = [regex]::Match($fm, "(?m)^$([regex]::Escape($key)):[ \t]*(.*?)[ \t]*$")
  if ($m.Success) { return $m.Groups[1].Value.Trim('"', "'") }
  return $null
}

function Fill-Fm([string]$fm, [string]$key, [string]$value, [string]$after) {
  if (-not $value) { return $fm }
  $line = "${key}: " + (Quote-Yaml $value)
  $m = [regex]::Match($fm, "(?m)^$([regex]::Escape($key)):[ \t]*(.*?)[ \t]*$")
  if ($m.Success) {
    $cur = $m.Groups[1].Value
    if ($cur -and $cur -notin @('—', '-', '""', "''")) { return $fm }
    return $fm.Substring(0, $m.Index) + $line + $fm.Substring($m.Index + $m.Length)
  }
  if ($after) {
    $a = [regex]::Match($fm, "(?m)^$([regex]::Escape($after)):.*$")
    if ($a.Success) { return $fm.Insert($a.Index + $a.Length, "`n" + $line) }
  }
  return $fm.TrimEnd("`n") + "`n" + $line
}

function Update-Pass2([string]$body, $pass2, [string]$noteName) {
  foreach ($s in $Sections) {
    $h = [regex]::Match($body, '(?m)^(#{2,4}) ' + [regex]::Escape($s) + '[ \t]*$')
    if (-not $h.Success) { Say "  ! [$noteName] '$s' 헤더가 없어 건너뜀"; continue }
    $shift = $h.Groups[1].Length - 2
    $md = ''
    if ($pass2.Found.ContainsKey($s)) { $md = ConvertTo-Md $pass2.Found[$s] $shift }
    $block = if ($md) { "$MarkStart`n$md`n$MarkEnd" } else { "$MarkStart`n$MarkEnd" }
    $after = $h.Index + $h.Length

    $old = [regex]::new('(?s)\G\s*%% zotero:start.*?%% zotero:end %%').Match($body, $after)
    if ($old.Success) {
      $body = $body.Substring(0, $after) + "`n`n" + $block + $body.Substring($old.Index + $old.Length)
      continue
    }
    if (-not $md) { continue }
    $next = [regex]::new('(?m)^(#{1,6} |---[ \t]*$)').Match($body, [Math]::Min($after + 1, $body.Length))
    $to = if ($next.Success) { $next.Index } else { $body.Length }
    if ($body.Substring($after, $to - $after).Trim()) {
      Say "  ! [$noteName] '$s' 밑에 직접 쓴 내용이 있어 Zotero 내용을 넣지 않음"
      continue
    }
    $body = $body.Substring(0, $after) + "`n`n" + $block + "`n`n" + $body.Substring($to)
  }
  return $body
}

# ---------------------------------------------------------------- 메인

try { $probe = Get-Api '/items?limit=1&sort=dateModified&direction=desc' }
catch { Write-Host 'Zotero가 꺼져 있거나 로컬 API가 꺼져 있습니다 (설정 → 고급 → "Allow other applications on this computer to communicate with Zotero").'; exit 0 }

# 로컬 전용 라이브러리는 Last-Modified-Version 이 항상 0 이라, 아이템 수 + 가장 최근 수정 시각으로 변경을 판단한다
$latest = @($probe.Data)
$libVersion = [string]$probe.Headers['Total-Results'] + '|' + $(if ($latest.Count) { [string]$latest[0]['data']['dateModified'] } else { '' })
$state = @{}
if (Test-Path $StateFile) { try { $state = $Json.DeserializeObject([IO.File]::ReadAllText($StateFile, $Utf8)) } catch { $state = @{} } }
if (-not $Force -and -not $DryRun -and $libVersion -and $state -and $state['version'] -eq $libVersion) { exit 0 }

# Zotero 데이터
$cols = @{}
foreach ($c in (Get-All '/collections')) { $cols[$c['key']] = $c['data'] }
function Get-TopCollection([string]$key) {
  $d = $cols[$key]
  while ($d -and $d['parentCollection']) { $d = $cols[[string]$d['parentCollection']] }
  if ($d) { return $d['name'] }
  return $null
}

$parents = New-Object System.Collections.Generic.List[object]
$kids = @{}
foreach ($it in (Get-All '/items')) {
  $d = $it['data']
  if ($d['deleted']) { continue }
  $type = $d['itemType']
  if ($type -eq 'annotation') { continue }
  if ($type -eq 'note' -or $type -eq 'attachment') {
    if ($d['parentItem']) {
      if (-not $kids.ContainsKey($d['parentItem'])) { $kids[$d['parentItem']] = New-Object System.Collections.Generic.List[object] }
      $kids[$d['parentItem']].Add($d)
    }
    continue
  }
  if ($d['title']) { $parents.Add($it) }
}

# 볼트 논문 노트 목록
$notes = New-Object System.Collections.Generic.List[object]
$existing = if (Test-Path -LiteralPath $Papers) { Get-ChildItem -LiteralPath $Papers -Recurse -Filter *.md -File } else { @() }
foreach ($f in $existing) {
  $txt = [IO.File]::ReadAllText($f.FullName, $Utf8).Replace("`r`n", "`n")
  $sp = Split-Note $txt
  if (-not $sp -or $sp.Fm -notmatch '(?m)^type:\s*paper\s*$') { continue }
  $z = Get-Fm $sp.Fm 'zotero'
  $key = if ($z -match 'items/([A-Z0-9]{8})') { $Matches[1] } else { $null }
  $base = $f.BaseName
  $notes.Add(@{
    Path = $f.FullName; Base = $base; Key = $key
    Name = ($base -replace '\s*\(\d{4}\)\s*$', '')
    Title = (Get-Fm $sp.Fm 'title'); Year = (Get-Fm $sp.Fm 'year')
  })
}

function Get-ItemInfo($it) {
  $d = $it['data']
  $year = ''
  if ($it['meta'] -and $it['meta']['parsedDate']) { $year = ([string]$it['meta']['parsedDate']).Substring(0, 4) }
  elseif ($d['date'] -match '\d{4}') { $year = $Matches[0] }
  $title = ([string]$d['title']).Trim()
  $short = ([string]$d['shortTitle']).Trim()
  if (-not $short) { $i = $title.IndexOf(':'); $short = if ($i -gt 0 -and $i -le 40) { $title.Substring(0, $i).Trim() } else { $title } }
  $authors = @($d['creators'] | Where-Object { $_['creatorType'] -eq 'author' })
  if ($authors.Count -eq 0) { $authors = @($d['creators']) }
  $last = @($authors | ForEach-Object { if ($_['lastName']) { $_['lastName'] } else { $_['name'] } } | Where-Object { $_ })
  $authorStr = if ($last.Count -gt 4) { "$($last[0]) et al." } else { $last -join ', ' }
  $venue = ''
  foreach ($k in 'publicationTitle', 'proceedingsTitle', 'conferenceName', 'bookTitle', 'repository', 'university', 'publisher') {
    if ($d[$k]) { $venue = [string]$d[$k]; break }
  }
  $url = [string]$d['url']
  if (-not $url -and $d['DOI']) { $url = "https://doi.org/$($d['DOI'])" }
  $pdf = ''
  if ($kids.ContainsKey($d['key'])) {
    foreach ($a in $kids[$d['key']]) {
      if ($a['itemType'] -ne 'attachment' -or $a['contentType'] -ne 'application/pdf' -or -not $a['path']) { continue }
      $p = [string]$a['path']
      if ($p.StartsWith($Vault + '\', [StringComparison]::OrdinalIgnoreCase)) { $pdf = '[[' + $p.Substring($Vault.Length + 1).Replace('\', '/') + ']]'; break }
    }
  }
  $col = $null
  foreach ($ck in @($d['collections'])) { if (-not $ck) { continue }; $col = Get-TopCollection $ck; if ($col) { break } }
  return @{
    Key = $d['key']; Title = $title; Short = $short; Year = $year; Authors = $authorStr
    Venue = $venue; Url = $url; Pdf = $pdf; Collection = $col; CiteKey = [string]$d['citationKey']
    Zotero = "zotero://select/library/items/$($d['key'])"
  }
}

function Find-Note($info) {
  $hit = @($notes | Where-Object { $_.Key -eq $info.Key })
  if ($hit.Count -gt 0) { return @{ Note = $hit[0] } }
  $names = @((Norm $info.Short), (Norm $info.Title)) | Where-Object { $_ }
  $tl = $info.Title.ToLowerInvariant()
  $cands = @($notes | Where-Object {
    $n = $_
    if ($n.Key) { return $false }
    if ($n.Year -match '^\d{4}$' -and $info.Year -match '^\d{4}$' -and [Math]::Abs([int]$n.Year - [int]$info.Year) -gt 1) { return $false }
    foreach ($v in @($n.Name, $n.Title)) {
      if (-not $v) { continue }
      if ($names -contains (Norm $v)) { return $true }
      $vl = $v.ToLowerInvariant()
      if ($vl.Length -ge 4 -and $tl.StartsWith($vl) -and ($tl.Length -eq $vl.Length -or ': -—,('.Contains($tl[$vl.Length]))) { return $true }
    }
    return $false
  })
  if ($cands.Count -eq 1) { return @{ Note = $cands[0] } }
  if ($cands.Count -gt 1) { return @{ Ambiguous = ($cands | ForEach-Object { $_.Base }) -join ', ' } }
  return @{}
}

function Write-Note([string]$path, [string]$text, [bool]$crlf) {
  if ($crlf) { $text = $text.Replace("`n", "`r`n") }
  [IO.File]::WriteAllText($path, $text, $Utf8)
}

$today = Get-Date -Format 'yyyy-MM-dd'
$tplText = [IO.File]::ReadAllText($Template, $Utf8).Replace("`r`n", "`n")
$claimed = @{}
$created = 0; $updated = 0

foreach ($it in $parents) {
  $info = Get-ItemInfo $it
  $p2html = $null
  if ($kids.ContainsKey($info.Key)) {
    $best = $null
    foreach ($k in $kids[$info.Key]) {
      if ($k['itemType'] -eq 'note' -and (Test-Pass2Note $k['note']) -and (-not $best -or $k['dateModified'] -gt $best['dateModified'])) { $best = $k }
    }
    if ($best) { $p2html = $best['note'] }
  }

  # Pass 2 노트에 붙은 그림 → <imageFolder>/<key>.<ext>
  $ImgMap.Clear()
  if ($p2html -and $kids.ContainsKey($best['key'])) {
    foreach ($a in $kids[$best['key']]) {
      if ($a['itemType'] -ne 'attachment' -or -not ([string]$a['contentType']).StartsWith('image/') -or -not $a['filename']) { continue }
      if (-not $p2html.Contains("data-attachment-key=`"$($a['key'])`"")) { continue }   # 노트에서 지운 그림
      $src = Join-Path $ZoteroData "storage\$($a['key'])\$($a['filename'])"
      if (-not (Test-Path -LiteralPath $src)) { Say "  ! [$($info.Short)] 그림 파일 없음: $src"; continue }
      $ext = [IO.Path]::GetExtension([string]$a['filename'])
      $name = "$($a['key'])$ext"
      $ImgMap[$a['key']] = $name
      $dst = Join-Path $ImgDir $name
      if (-not $DryRun -and (-not (Test-Path -LiteralPath $dst) -or (Get-Item -LiteralPath $dst).Length -ne (Get-Item -LiteralPath $src).Length)) {
        if (-not (Test-Path $ImgDir)) { New-Item -ItemType Directory -Path $ImgDir | Out-Null }
        Copy-Item -LiteralPath $src -Destination $dst -Force
      }
    }
  }
  $pass2 = if ($p2html) { Split-Pass2 $p2html } else { @{ Found = @{}; Other = @() } }

  $match = Find-Note $info
  if ($match.Ambiguous) { Say "? '$($info.Title)' ($($info.Year)) — 후보가 여럿이라 건너뜀: $($match.Ambiguous)"; continue }

  if ($match.Note) {
    $n = $match.Note
    if ($claimed.ContainsKey($n.Path)) { Say "? '$($n.Base)' 에 Zotero 아이템이 둘 이상 짝지어짐 ($($claimed[$n.Path]), $($info.Key)) — 두 번째는 건너뜀"; continue }
    $claimed[$n.Path] = $info.Key
    $raw = [IO.File]::ReadAllText($n.Path, $Utf8)
    $crlf = $raw.Contains("`r`n")
    $sp = Split-Note $raw.Replace("`r`n", "`n")
    $fm = $sp.Fm
    $fm = Fill-Fm $fm 'authors' $info.Authors
    $fm = Fill-Fm $fm 'year' $info.Year
    $fm = Fill-Fm $fm 'venue' $info.Venue
    $fm = Fill-Fm $fm 'citekey' $info.CiteKey
    $fm = Fill-Fm $fm 'url' $info.Url
    $fm = Fill-Fm $fm 'zotero' $info.Zotero
    $fm = Fill-Fm $fm 'pdf' $info.Pdf 'zotero'
    $body = $sp.Body
    if ($p2html) { $body = Update-Pass2 $body $pass2 $n.Base }
    $new = '---' + $fm + $body
    if ($new -ne $raw.Replace("`r`n", "`n")) {
      $how = if ($n.Key) { '갱신' } else { '연결' }
      Say "~ $how  $($n.Path.Substring($Vault.Length + 1))"
      if (-not $DryRun) { Write-Note $n.Path $new $crlf }
      $updated++
    }
  }
  else {
    $folder = if ($info.Collection) { Join-Path $Papers (Safe-FileName $info.Collection) } else { $Papers }
    $base = Safe-FileName $(if ($info.Year) { "$($info.Short) ($($info.Year))" } else { $info.Short })
    $path = Join-Path $folder "$base.md"
    if (Test-Path $path) { Say "? '$base.md' 가 이미 있는데 다른 논문으로 보여 만들지 않음 ($($info.Title))"; continue }
    $sp = Split-Note ($tplText.Replace('{{date}}', $today).Replace('{{title}}', $base))
    $fm = $sp.Fm
    $fm = Fill-Fm $fm 'title' $info.Short
    $fm = Fill-Fm $fm 'authors' $info.Authors
    $fm = Fill-Fm $fm 'year' $info.Year
    $fm = Fill-Fm $fm 'venue' $info.Venue
    $fm = Fill-Fm $fm 'citekey' $info.CiteKey
    $fm = Fill-Fm $fm 'url' $info.Url
    $fm = Fill-Fm $fm 'zotero' $info.Zotero
    $fm = Fill-Fm $fm 'pdf' $info.Pdf 'zotero'
    if ($info.Collection) { $fm = Fill-Fm $fm 'field' $info.Collection }
    $body = $sp.Body
    if ($p2html) { $body = Update-Pass2 $body $pass2 $base }
    Say "+ 생성  $($path.Substring($Vault.Length + 1))"
    if (-not $DryRun) {
      if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
      Write-Note $path ('---' + $fm + $body) $false
    }
    $notes.Add(@{ Path = $path; Base = $base; Key = $info.Key; Name = $info.Short; Title = $info.Short; Year = $info.Year })
    $claimed[$path] = $info.Key
    $created++
  }
  if ($pass2.Other.Count -gt 0) { Say "  ! [$($info.Short)] 템플릿에 없는 Pass 2 섹션은 옮기지 않음: $($pass2.Other -join ' / ')" }
}

Say ("완료: 새 노트 {0}편, 갱신 {1}편 (Zotero 논문 {2}편){3}" -f $created, $updated, $parents.Count, $(if ($DryRun) { ' — DryRun, 아무것도 쓰지 않음' } else { '' }))

if (-not $DryRun) {
  [IO.File]::WriteAllText($StateFile, $Json.Serialize(@{ version = $libVersion }), $Utf8)
  if ($Log.Count -gt 1) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $lines = @()
    if (Test-Path $LogFile) { $lines = @([IO.File]::ReadAllLines($LogFile, $Utf8)) }
    $lines += @($Log | ForEach-Object { "[$stamp] $_" })
    if ($lines.Count -gt 500) { $lines = $lines[($lines.Count - 500)..($lines.Count - 1)] }
    [IO.File]::WriteAllLines($LogFile, $lines, $Utf8)
  }
}
