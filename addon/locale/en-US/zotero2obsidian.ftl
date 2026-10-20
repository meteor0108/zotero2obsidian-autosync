zotero2obsidian-menu-sync =
    .label = Sync to Obsidian

## Preferences

z2o-pref-vault-title = Obsidian vault
z2o-pref-vault = Vault folder:
z2o-pref-browse =
    .label = Browse…
z2o-pref-browse-title = Choose the Obsidian vault folder
z2o-pref-papers = Paper notes folder:
z2o-pref-template = Note template:
z2o-pref-images = Image folder:
z2o-pref-images-input =
    .placeholder = Empty: zotero/ inside the vault's attachment folder
z2o-pref-paths-help = Folders and the template are paths inside the vault. If the template file doesn't exist, the default template is created there.

z2o-pref-pass2-title = Pass 2 notes
z2o-pref-sections = Sections to bring over (one per line):
z2o-pref-sections-help = The h2 headings of the Zotero Pass 2 note must match the headers of the vault note template exactly.
z2o-pref-auto-pass2 =
    .label = Create a Pass 2 note when a paper is added or its PDF is opened, if it has none (Better Notes)
z2o-pref-pass2-template = Better Notes template name:
z2o-status-bn-found = Better Notes found. If it has no template with this name, one is added when Zotero starts.
z2o-status-bn-missing = Better Notes is not installed, so Pass 2 notes aren't created automatically.

z2o-pref-auto-title = Automatic sync
z2o-pref-auto-sync =
    .label = Bring changes in Zotero to the vault within seconds
z2o-pref-move-notes =
    .label = When a paper changes collection, move its note to that collection's folder
z2o-pref-move-pdfs =
    .label = When a paper changes collection, move its PDF too, with ZotMoov
z2o-status-zotmoov-ready = ZotMoov found. Only PDFs inside the ZotMoov folder are moved.
z2o-status-zotmoov-no-subdirs = Turn on the "move" behavior and subdirectories (a folder per collection) in ZotMoov's settings to have PDFs moved.
z2o-status-zotmoov-missing = ZotMoov is not installed, so PDFs aren't moved.

z2o-pref-run-title = Run now
z2o-pref-preview =
    .label = Preview
z2o-pref-sync =
    .label = Sync now
z2o-pref-log = Recent log
z2o-pref-log-preview = Preview (nothing was written)
z2o-pref-log-sync = Sync result

## Sync log

log-no-vault = No vault folder set. Choose one in Zotero settings → Zotero2Obsidian Autosync.
log-vault-missing = The vault folder doesn't exist: { $path }
log-template-copied = No template found, so the default template was created: { $path }
log-template-would-copy = No template found; the default template would be created: { $path }
log-template-invalid = The template has no properties between --- lines at the top: { $path }
log-no-header = ! [{ $note }] no '{ $section }' header, skipped
log-hand-written = ! [{ $note }] text written by hand under '{ $section }', Zotero content not added
log-image-missing = ! [{ $paper }] image file missing: { $path }
log-ambiguous = ? '{ $title }' ({ $year }) — several candidate notes, skipped: { $candidates }
log-claimed-twice = ? '{ $note }' matches more than one Zotero item ({ $first }, { $second }) — the second was skipped
log-move-blocked = ? '{ $note }.md' was not moved to { $folder }/ because a note with that name is already there
log-updated = ~ updated  { $path }
log-linked = ~ linked  { $path }
log-moved = > moved  { $from } → { $to }
log-name-taken = ? '{ $file }' already exists and looks like a different paper, not created ({ $title })
log-created = + created  { $path }
log-other-sections = ! [{ $paper }] Pass 2 sections not in the template were not brought over: { $sections }
log-summary = Done: { $created } new notes, { $updated } updated ({ $papers } papers in Zotero)
log-summary-dry = Preview: { $created } new notes, { $updated } updated ({ $papers } papers in Zotero) — nothing written
log-error = Error: { $message }

## Text written into notes

note-image-missing = image: see the Zotero note
