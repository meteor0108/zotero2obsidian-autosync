zotero2obsidian-menu-sync =
    .label = Obsidian으로 동기화

## 설정 창

z2o-pref-vault-title = Obsidian 볼트
z2o-pref-vault = 볼트 폴더:
z2o-pref-browse =
    .label = 찾아보기…
z2o-pref-browse-title = Obsidian 볼트 폴더 선택
z2o-pref-papers = 논문 노트 폴더:
z2o-pref-template = 노트 템플릿:
z2o-pref-images = 그림 폴더:
z2o-pref-images-input =
    .placeholder = 비우면 볼트의 첨부 파일 폴더 아래 zotero
z2o-pref-paths-help = 폴더와 템플릿은 볼트 안의 경로입니다. 템플릿 파일이 없으면 기본 템플릿을 그 자리에 만듭니다.

z2o-pref-pass2-title = Pass 2 노트
z2o-pref-sections = 가져올 섹션 (한 줄에 하나):
z2o-pref-sections-help = Zotero Pass 2 노트의 h2 제목과 볼트 노트 템플릿의 헤더 이름이 글자까지 같아야 합니다.
z2o-pref-auto-pass2 =
    .label = 논문을 추가하거나 PDF를 열 때 Pass 2 노트가 없으면 만들기 (Better Notes)
z2o-pref-pass2-template = Better Notes 템플릿 이름:
z2o-status-bn-found = Better Notes를 찾았습니다. 이 이름의 템플릿이 없으면 Zotero를 켤 때 등록합니다.
z2o-status-bn-missing = Better Notes가 설치되어 있지 않아 Pass 2 노트를 자동으로 만들지 않습니다.

z2o-pref-auto-title = 자동 동기화
z2o-pref-auto-sync =
    .label = Zotero에서 바뀐 내용을 몇 초 안에 볼트에 반영하기
z2o-pref-move-notes =
    .label = 논문의 컬렉션이 바뀌면 노트도 그 컬렉션 폴더로 옮기기
z2o-pref-move-pdfs =
    .label = 논문의 컬렉션이 바뀌면 PDF도 ZotMoov로 옮기기
z2o-status-zotmoov-ready = ZotMoov를 찾았습니다. ZotMoov 폴더 안에 있는 PDF만 옮깁니다.
z2o-status-zotmoov-no-subdirs = ZotMoov 설정에서 "move" 방식과 하위 폴더(컬렉션별 폴더)를 켜야 PDF를 옮깁니다.
z2o-status-zotmoov-missing = ZotMoov가 설치되어 있지 않아 PDF는 옮기지 않습니다.

z2o-pref-run-title = 지금 실행
z2o-pref-preview =
    .label = 미리보기
z2o-pref-sync =
    .label = 지금 동기화
z2o-pref-log = 최근 기록
z2o-pref-log-preview = 미리보기 결과 (아무것도 쓰지 않음)
z2o-pref-log-sync = 동기화 결과

## 동기화 기록

log-no-vault = 볼트 폴더가 정해지지 않았습니다. Zotero 설정 → Zotero2Obsidian Autosync에서 정하세요.
log-vault-missing = 볼트 폴더가 없습니다: { $path }
log-template-copied = 템플릿이 없어 기본 템플릿을 만들었습니다: { $path }
log-template-would-copy = 템플릿이 없어 기본 템플릿을 만들 예정입니다: { $path }
log-template-invalid = 템플릿 맨 위에 ---로 감싼 속성이 없습니다: { $path }
log-no-header = ! [{ $note }] '{ $section }' 헤더가 없어 건너뜀
log-hand-written = ! [{ $note }] '{ $section }' 밑에 직접 쓴 내용이 있어 Zotero 내용을 넣지 않음
log-image-missing = ! [{ $paper }] 그림 파일 없음: { $path }
log-ambiguous = ? '{ $title }' ({ $year }) — 후보가 여럿이라 건너뜀: { $candidates }
log-claimed-twice = ? '{ $note }'에 Zotero 아이템이 둘 이상 짝지어짐 ({ $first }, { $second }) — 두 번째는 건너뜀
log-move-blocked = ? '{ $note }.md'를 { $folder }/로 옮기려 했지만 같은 이름의 노트가 있어 그대로 둠
log-updated = ~ 갱신  { $path }
log-linked = ~ 연결  { $path }
log-moved = > 이동  { $from } → { $to }
log-name-taken = ? '{ $file }'가 이미 있는데 다른 논문으로 보여 만들지 않음 ({ $title })
log-created = + 생성  { $path }
log-other-sections = ! [{ $paper }] 템플릿에 없는 Pass 2 섹션은 옮기지 않음: { $sections }
log-summary = 완료: 새 노트 { $created }편, 갱신 { $updated }편 (Zotero 논문 { $papers }편)
log-summary-dry = 미리보기: 새 노트 { $created }편, 갱신 { $updated }편 (Zotero 논문 { $papers }편) — 아무것도 쓰지 않음
log-error = 오류: { $message }

## 노트에 들어가는 글

note-image-missing = 그림: Zotero 노트에서 확인
