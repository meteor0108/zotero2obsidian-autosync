# zotero2obsidian-autosync

**English** | [한국어](README.ko.md)

A **paper note template** for following S. Keshav's [How to Read a Paper](https://web.stanford.edu/class/ee384m/Handouts/HowtoReadPaper.pdf) (the three-pass method) in Zotero and Obsidian, plus a Zotero plugin that **automatically syncs** the notes you write in Zotero into Obsidian. Works on Windows, macOS and Linux.

![Demo: writing a Pass 2 note in Zotero creates and fills the Obsidian paper note within seconds](docs/images/demo.gif)

## Notes that follow the three-pass method

Instead of reading a paper once from start to finish, you read it in three passes, each with a different goal. Every paper gets one note, and the note is laid out in the order of the three passes, so you fill it in from top to bottom.

| Pass | Time | What you do | Where you write |
|---|---|---|---|
| **Pass 1** Skim | 5–10 min | Read only the title, abstract, introduction and conclusion, write down the 5 Cs (Category, Context, Correctness, Contributions, Clarity), and decide whether to keep reading | Obsidian |
| **Pass 2** Grasp the content | about 1 hour | Go through the figures and tables and summarize prior work, its limitations, this paper's method, and the experiments. Skip the proofs | **Zotero** → synced to Obsidian automatically |
| **Pass 3** Virtually re-implement | 1–5 hours | Start from the same assumptions as the authors, rebuild the work yourself, and compare it with the paper to find hidden assumptions and limitations | Obsidian |

Only Pass 2 is written in Zotero, because that is where the PDF and its figures are. Everything else is written directly in Obsidian. The plugin joins the two into a single note.

### The flow at a glance

<table>
<tr>
<td width="50%" valign="top"><img src="docs/images/01-save-to-zotero.png" alt="Saving a paper from the browser into the SLAM collection with Zotero Connector"><br><b>1. Save the paper</b><br>Save the paper from your browser with Zotero Connector. The <b>collection</b> you save it to becomes the folder in your vault.</td>
<td width="50%" valign="top"><img src="docs/images/02-zotero-item.png" alt="The paper added to the Zotero library with its metadata filled in"><br><b>2. Added to Zotero</b><br>The metadata is filled in. The <b>Short Title</b> becomes the name of the Obsidian note.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/images/03-zotero-pass2-note.png" alt="A Pass 2 note with headings 1 to 4 next to the PDF in Zotero"><br><b>3. Pass 2 note</b><br>A Pass 2 note with headings 1–4 is created next to the PDF. Write your summary here.</td>
<td width="50%" valign="top"><img src="docs/images/04-obsidian-note.png" alt="The paper note created in the Obsidian vault with its properties filled in"><br><b>4. Obsidian note</b><br>The paper note is created in your vault with its properties filled in. The Pass 2 content follows within seconds.</td>
</tr>
</table>

### What is in the note template

[`addon/templates/paper-note.md`](addon/templates/paper-note.md) is the Obsidian note template, and [`addon/templates/pass2-note.html`](addon/templates/pass2-note.html) is the Pass 2 note template for Zotero (Better Notes). Both ship with the plugin, so there is nothing to copy by hand.

| Part | Contents |
|---|---|
| Properties | `title`, `authors`, `year`, `venue`, `url`, `zotero`, `pdf` and others are filled in automatically. You set `pass` (the pass you finished, e.g. `1`, `2`, `3`) and `status` yourself |
| One-line summary | "So what is new?" in one sentence. Write a guess during Pass 1, then rewrite it in your own words after reading |
| Pass 1 | The 5 Cs, references you have already read, and a keep-reading checklist |
| Pass 2 | Sections 1–4 from Zotero (prior work / limitations / method / experiments), a table of main claims and evidence, and where you got stuck |
| Pass 3 | Assumptions, what you would have done, your thoughts and the paper's limitations, and what to take for your own writing |
| Related concepts, After reading | The concepts the paper's contribution hinges on, and a wrap-up checklist |

The templates are written in Korean. English versions are in [`templates/en/`](templates/en/); see [Using your own language](#using-your-own-language).

## What it does

When you add a paper to Zotero, a paper note is created in your Obsidian vault, and the Pass 2 note you write in Zotero keeps being synced into it.

- New paper → a note is created from the template, with its properties (authors, year, venue, URL, Zotero link, PDF link) filled in
- New paper → a Pass 2 note is created from the Better Notes template
- Pass 2 note in Zotero (sections 1–4) → copied under the headings of the same name in the Obsidian note, including images
- Zotero collection → folder in the vault (`Papers/<collection>/`). When a paper changes collection, its note moves with it, and with [ZotMoov](https://github.com/wileyyugioh/zotmoov) its PDF does too.

The plugin runs inside Zotero and listens to Zotero's own events. After a change it waits **3 seconds** and syncs once, so while you are typing a note it waits until you pause. Nothing else needs to run in the background, and Obsidian needs no plugin.

## Requirements

| | |
|---|---|
| [Zotero](https://www.zotero.org/) 7 or later | Used with Zotero 9 |
| [Better Notes](https://github.com/windingwind/zotero-better-notes) | Creates the Pass 2 note from a template. Without it, sync still works if you create the Pass 2 note yourself |
| [ZotMoov](https://github.com/wileyyugioh/zotmoov) (optional) | With PDFs moved into the vault, notes get a `pdf:` link, and PDFs follow their paper when it changes collection |
| Obsidian | No plugin needed |

## Installation

1. Download `zotero2obsidian.xpi` from [Releases](https://github.com/meteor0108/zotero2obsidian-autosync/releases). To build it yourself, see [Development](#development).
2. In Zotero, go to Tools → Plugins → gear icon → **Install Plugin From File…** and choose the file.
3. In Zotero → Settings → **Zotero2Obsidian Autosync**, choose your vault folder. Change the rest if you need to.

   | Setting | Default | Meaning |
   |---|---|---|
   | Vault folder | (none) | Your Obsidian vault folder |
   | Paper notes folder | `Papers` | Folder in the vault for paper notes |
   | Note template | `Templates/paper-note.md` | Template for new notes. If the file doesn't exist, the default template is created there |
   | Image folder | Obsidian attachment folder + `/zotero` | Where images from Pass 2 notes are copied |
   | Sections to bring over | `1. 기존 방법론` and 3 more | The section headings taken from Zotero, one per line |
   | Better Notes template name | `[Item]Paper Pass 2` | If Better Notes has no template with this name, it is added when Zotero starts |

4. Click **Preview** at the bottom of the settings pane to see what would happen. Nothing is written. `+ created` is a note to be created, `~ linked` is an existing note matched to a paper, and `?` is something skipped because it was ambiguous. If a paper that already has a note in the vault shows up as `+ created`, see [Matching existing notes](#matching-existing-notes).
5. If it looks right, click **Sync now**. From then on, syncing is automatic.

Zotero checks for updates to the plugin on its own.

## How to use

1. Add a paper to Zotero. Decide on its **collection** (it becomes the folder in the vault) and its **Short Title** (it becomes the note name) before adding it. The note name is set once when the note is created and doesn't follow later changes in Zotero. The folder does; see [When a paper changes collection](#when-a-paper-changes-collection).
2. A Pass 2 note is created for the paper. For papers added before you installed the plugin, it is created when you open the PDF. Without Better Notes, create a note with h2 headings such as `1. 기존 방법론` yourself.
3. Write the Pass 2 note in Zotero. A few seconds later it appears under headings 1–4 of the Obsidian note.

- Everything between `%% zotero:start %%` and `%% zotero:end %%` in the Obsidian note is **overwritten** on every sync. Make changes in Zotero. These markers are hidden in reading view.
- Write the rest (Pass 1, Pass 3, the one-line summary and so on) freely in Obsidian.
- Properties are filled in **only when empty**. Values you wrote yourself are never overwritten. One exception: when the file a `pdf:` link points to is gone (because ZotMoov moved the PDF to another folder), the link is updated to the PDF's current path.
- To sync right away, use Zotero → Tools → **Sync to Obsidian**.

### When the template is applied

- The template is used **only once, when a note is created**. It is read again on every sync, so edits to the template apply **from the next new note** on.
- **Existing notes keep their layout.** In an existing note only the parts between `%% zotero:start %%` and `%% zotero:end %%` in sections 1–4 and empty properties are filled in, so nothing you wrote in Obsidian is deleted.
- To give an existing note the new layout, move its content into the new template by hand. If you haven't written anything in it in Obsidian, you can also delete the note; it is recreated from the new template within seconds.
- `{{title}}` (the file name) and `{{date}}` (today's date) in the template are filled in automatically. The properties `title`, `authors`, `year`, `venue`, `citekey`, `url`, `zotero`, `pdf` and `field` (the collection name) are filled in when empty.

### When a paper changes collection

When you move a paper to another collection in Zotero, its note moves to `Papers/<new collection>/`. If `field:` is empty or equal to the old folder name, it changes to the new collection name.
- Papers that are only taken out of a collection keep their note where it is.
- Notes you put deeper than `Papers/<folder>/` yourself are not moved.
- If a note with the same name already exists in the target folder, the note is not moved and the log says so.
- **PDFs** are moved with ZotMoov when it is installed and set to the "move" behavior with subdirectories (a folder per collection). Only PDFs inside the ZotMoov folder are moved. The `pdf:` link follows.
- In a subcollection, the note goes to the top-level collection folder (`Papers/VLN/`) and the PDF goes where ZotMoov puts it (`VLN/sub/`).

### Note names

`<Short Title> (<year>).md`. When the Short Title is empty, the part of the title before `:` is used. Example: `LIO-SAM: Tightly-coupled ...` → `LIO-SAM (2020).md`

### Which note counts as the Pass 2 note

A child note of the paper that contains `<h1>Pass 2</h1>`, or an h2 heading with the same name as one of the "sections to bring over". If there are several, the most recently edited one is used. Headings must match the headings in the vault template **character for character**. h2 sections that aren't in the template are not brought over, and the log says so.

### Matching existing notes

Notes already in the vault are matched to papers in Zotero in this order:
1. The item key in the note's `zotero:` property (`zotero://select/library/items/ABCD1234`)
2. Among notes with the `type: paper` property, a note whose file name or `title:` equals the paper's Short Title or title, with a year within ±1. Notes whose `zotero:` key points to an item deleted from Zotero are included here; this happens when the same paper was deleted and added again, and the `zotero:` link is updated to the new item once it is matched.

If there is more than one candidate, nothing is done and the log says so. A paper with no matching note gets a new note, so if a note for it already exists, put the paper's Zotero link in that note's `zotero:` property. You can copy the link by right-clicking the paper in Zotero.

## Using your own language

The templates and the default section names are in Korean, and the plugin's own interface is in English or Korean, following Zotero's language. To write notes in another language, change three things so that their headings match. For English, [`templates/en/`](templates/en/) has both templates ready:
1. **Sections to bring over** in the plugin settings. For the English templates: `1. Prior work`, `2. Limitations of prior work`, `3. Method`, `4. Experiments`
2. The Better Notes template (Zotero → Settings → Better Notes → Template Editor → `[Item]Paper Pass 2`). Replace its content with [`templates/en/pass2-note.html`](templates/en/pass2-note.html)
3. The vault note template (the file in the "Note template" setting). Copy [`templates/en/paper-note.md`](templates/en/paper-note.md) into your vault and point the setting to it

## Troubleshooting

- **What was done, and what was skipped** → see "Recent log" at the bottom of the settings pane. It is also written to `zotero2obsidian.log` in the Zotero data folder.
- **Nothing syncs** → check that the vault folder in the settings is right and that "Bring changes in Zotero to the vault within seconds" is on.
- **Template edits don't show up** → see [When the template is applied](#when-the-template-is-applied). Existing notes aren't changed.
- **No Pass 2 note is created** → check that Better Notes is installed and that the template name in the settings matches a template in Better Notes.
- **PDFs don't follow their paper to another collection** → read the ZotMoov status line in the settings pane. PDFs outside the ZotMoov folder (in Zotero's own storage, for example) are not moved.

## Limitations

- Works only while Zotero is running. When Zotero starts, everything that changed in the meantime is synced at once.
- One way only, from Zotero to Obsidian. Pass 2 content edited in Obsidian doesn't go back to Zotero and is overwritten on the next sync.
- Only My Library is synced. Group libraries are not supported.
- PDF links are added only when the PDF is inside the vault folder (for example, moved there by ZotMoov).

## Migrating from the PowerShell version (v1)

v1 ran a PowerShell watcher from Task Scheduler on Windows. Its last version is at the [`v1-powershell`](https://github.com/meteor0108/zotero2obsidian-autosync/tree/v1-powershell) tag. Turn v1 off first, so that the two don't write to the same vault at once.

1. Run `uninstall.ps1` in the v1 folder, or delete the `zotero2obsidian-autosync` task in Task Scheduler.
2. Install the plugin and give it the same values as v1's `config.json`. Notes are matched the same way as in v1, so your existing notes carry on.
3. The Pass 2 template v1 added to Better Notes is used as is. Delete the Actions & Tags action that created Pass 2 notes; the plugin does that now.

## Development

```
addon/
  bootstrap.js, manifest.json, prefs.js   plugin startup and default settings
  preferences.xhtml, preferences.js       Zotero settings pane
  src/core.js                             sync logic (independent of Zotero)
  src/zotero2obsidian.js                  Zotero events, Better Notes, ZotMoov
  templates/                              vault note template, Pass 2 note template
  locale/                                 English and Korean strings
templates/en/                             English versions of the two templates (not bundled)
test/core.test.js                         tests for core.js
updates.json                              update manifest Zotero reads
```

- Build: `powershell -ExecutionPolicy Bypass -File build.ps1` on Windows, `sh build.sh` on macOS and Linux. The result is `build/zotero2obsidian.xpi`.
- Test: `node --test` (Node 18 or later)
- Release: raise `version` in `addon/manifest.json`, add the version to `updates.json`, and attach the built `.xpi` to a GitHub release tagged `v<version>`.

## Uninstall

Remove Zotero2Obsidian Autosync in Zotero → Tools → Plugins. The notes and templates in your vault and the Pass 2 template in Better Notes are kept.
