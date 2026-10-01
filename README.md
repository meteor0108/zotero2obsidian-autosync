# zotero2obsidian-autosync

A **paper note template** for following S. Keshav's [How to Read a Paper](https://web.stanford.edu/class/ee384m/Handouts/HowtoReadPaper.pdf) (the three-pass method) in Zotero and Obsidian, plus a tool that **automatically syncs** the notes you write in Zotero into Obsidian. Windows only.

> This is the English branch. The Korean README and templates are on the [`main`](https://github.com/meteor0108/zotero2obsidian-autosync/tree/main) branch. The screenshots show a Korean setup, and the scripts still print their messages in Korean.

![Demo: writing a Pass 2 note in Zotero creates and fills the Obsidian paper note within seconds](docs/images/demo.gif)

## Notes that follow the three-pass method

Instead of reading a paper once from start to finish, you read it in three passes, each with a different goal. Every paper gets one note, and the note is laid out in the order of the three passes, so you fill it in from top to bottom.

| Pass | Time | What you do | Where you write |
|---|---|---|---|
| **Pass 1** Skim | 5–10 min | Read only the title, abstract, introduction and conclusion, write down the 5 Cs (Category, Context, Correctness, Contributions, Clarity), and decide whether to keep reading | Obsidian |
| **Pass 2** Grasp the content | about 1 hour | Go through the figures and tables and summarize prior work, its limitations, this paper's method, and the experiments. Skip the proofs | **Zotero** → synced to Obsidian automatically |
| **Pass 3** Virtually re-implement | 1–5 hours | Start from the same assumptions as the authors, rebuild the work yourself, and compare it with the paper to find hidden assumptions and limitations | Obsidian |

Only Pass 2 is written in Zotero, because that is where the PDF and its figures are. Everything else is written directly in Obsidian. The sync tool joins the two into a single note.

### The flow at a glance

<table>
<tr>
<td width="50%" valign="top"><img src="docs/images/01-save-to-zotero.png" alt="Saving a paper from the browser into the SLAM collection with Zotero Connector"><br><b>1. Save the paper</b><br>Save the paper from your browser with Zotero Connector. The <b>collection</b> you save it to becomes the folder in your vault.</td>
<td width="50%" valign="top"><img src="docs/images/02-zotero-item.png" alt="The paper added to the Zotero library with its metadata filled in"><br><b>2. Added to Zotero</b><br>The metadata is filled in. The <b>Short Title</b> becomes the name of the Obsidian note.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/images/03-zotero-pass2-note.png" alt="A Pass 2 note with headings 1 to 4 next to the PDF in Zotero"><br><b>3. Pass 2 note</b><br>A Pass 2 note with headings 1–4 appears next to the PDF. Write your summary here.</td>
<td width="50%" valign="top"><img src="docs/images/04-obsidian-note.png" alt="The paper note created in the Obsidian vault with its properties filled in"><br><b>4. Obsidian note</b><br>The paper note is created in your vault with its properties filled in. The Pass 2 content follows within seconds.</td>
</tr>
</table>

You create the Pass 2 note in step 3 by right-clicking the paper, or automatically by setting up [Create the Pass 2 note automatically](#optional-create-the-pass-2-note-automatically) below.

### What is in the note template

[`obsidian/paper-note.md`](obsidian/paper-note.md) is the Obsidian note template, and [`zotero/pass2-note-template.html`](zotero/pass2-note-template.html) is the Pass 2 note template for Zotero.

| Part | Contents |
|---|---|
| Properties | `title`, `authors`, `year`, `venue`, `url`, `zotero`, `pdf` and others are filled in automatically. You set `pass` (the pass you finished, e.g. `1`, `2`, `3`) and `status` (`unread` → `done`) yourself |
| One-line summary | "So what is new?" in one sentence. Write a guess during Pass 1, then rewrite it in your own words after reading |
| Pass 1 | The 5 Cs, references you have already read, and a keep-reading checklist |
| Pass 2 | Sections 1–4 from Zotero (prior work / limitations / method / experiments), a table of main claims and evidence, and where you got stuck |
| Pass 3 | Assumptions, what you would have done, your thoughts and the paper's limitations, and what to take for your own writing |
| Related concepts, After reading | The concepts the paper's contribution hinges on, and a wrap-up checklist |

## Automatic sync

When you add a paper to Zotero, a paper note is created in your Obsidian vault, and the Pass 2 note you write in Zotero keeps being synced into it.

- New paper → a note is created from the template, with its properties (authors, year, venue, URL, Zotero link, PDF link) filled in
- Pass 2 note in Zotero (sections 1–4) → copied under the headings of the same name in the Obsidian note, including images
- Zotero collection → folder in the vault (`Papers/<collection>/`)
- No Obsidian plugin is needed. Task Scheduler starts a watcher script at logon, and changes in Zotero are synced **within seconds**.

```
Zotero (local API) ◀──checked every 5 s── scripts/zotero_watch.ps1 ──on change──▶ scripts/zotero_sync.ps1 ──▶ .md files in the vault
```

The watcher is light: every 5 seconds it asks only for the single most recently modified item. When something has changed, it waits until you have stopped typing for 5 seconds and then syncs once. A note you create or edit in Zotero usually shows up in Obsidian within 10 seconds.

## Requirements

| | |
|---|---|
| Windows 10/11 | Uses PowerShell 5.1 (installed by default) |
| [Zotero](https://www.zotero.org/) 7 or later | The local API is required |
| [Better Notes](https://github.com/windingwind/zotero-better-notes) (Zotero plugin) | Used to create the Pass 2 note from a template. Without it, the sync still works as long as the note headings match |
| [Actions & Tags](https://github.com/windingwind/zotero-actions-tags) (optional) | Used to create the Pass 2 note automatically. See "Create the Pass 2 note automatically" below |
| [ZotMoov](https://github.com/wileyyugioh/zotmoov) (optional) | If it moves your PDFs into the vault, the note gets a `pdf:` link |
| Obsidian | No plugin needed |

## Installation

1. Clone this repository and switch to the `en` branch. The scripts keep running from this folder after installation, so do not delete it.
   ```
   git clone -b en https://github.com/meteor0108/zotero2obsidian-autosync.git
   ```
2. **Quit Zotero completely.** If it is running, it overwrites the changed settings when it closes.
3. Run the install script.
   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1 -VaultPath "C:\Users\me\Documents\Obsidian Vault"
   ```
   | Option | Default | Meaning |
   |---|---|---|
   | `-PapersFolder` | `Papers` | Folder in the vault where paper notes are created |
   | `-TemplateFolder` | `Templates` | Folder in the vault the template is copied to |
   | `-ImageFolder` | Obsidian attachment folder + `\zotero` | Folder that images from Zotero notes are copied to |
   | `-EnableTask` | off | Turn on automatic sync right away |

   What the install script does:
   - Copies the `paper-note.md` template into the vault (it leaves an existing file of the same name alone).
   - Creates `config.json`.
   - Turns on Zotero's local API and registers the `[Item]Paper Pass 2` note template in Better Notes. Your original settings are backed up as `prefs.js.bak-zotero2obsidian`.
   - Registers the `zotero2obsidian-autosync` task in Task Scheduler, **disabled**. The task starts the watcher script without a window at logon, and restarts it every hour if it has stopped.
4. Start Zotero and run a **preview** to see what would be created. It does not write any files.
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\zotero_sync.ps1 -DryRun
   ```
   In the output, `+ 생성` is a note that would be created, `~ 연결` is an existing note that was matched, and `?` is an ambiguous case that was skipped. If a paper that already has a note in your vault shows up as `+ 생성`, see "Matching existing notes" below.
5. If it looks right, run it once and turn on automatic sync.
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\zotero_sync.ps1 -Force
   Enable-ScheduledTask -TaskName zotero2obsidian-autosync
   Start-ScheduledTask -TaskName zotero2obsidian-autosync
   ```

## Usage

1. Add a paper to Zotero. Before you add it, decide on the **collection** (it becomes the folder in the vault) and the **Short Title** (it becomes the note name). The note name and folder are set once, when the note is created, and do not follow later changes in Zotero.
2. Right-click the paper → create a note from the Better Notes note template `[Item]Paper Pass 2`, and write your summary in Zotero. If you set up "Create the Pass 2 note automatically", the note already exists and you can start writing.
3. A few seconds later the content appears under headings 1–4 of the Obsidian note.

- Everything between `%% zotero:start %%` and `%% zotero:end %%` in the Obsidian note is **overwritten** on every sync. Edit it in Zotero. These markers are not visible in reading view.
- Everything else (Pass 1, Pass 3, the one-line summary and so on) is yours to write in Obsidian.
- Properties are filled in **only when they are empty**. Values you wrote yourself are not overwritten.
- To sync right now, run `scripts\zotero_sync.ps1 -Force`.

### When the template is applied

- The template is used **once, when a new note is created**. The script reads the template file on every run, so a change to the template applies **from the next note that is created**.
- **The layout of existing notes does not change.** In an existing note, only the part between `%% zotero:start %%` and `%% zotero:end %%` in sections 1–4 and the empty properties are filled in. This is so that nothing you wrote in Obsidian is deleted. So if you add a Pass 2 note in Zotero to a paper that already has a note, only the content comes in and the layout stays as it was.
- To apply a new layout to an existing note, move its content into the new template by hand. If you have not written anything in the note in Obsidian, you can also delete it. It is recreated from the new template within seconds.

### Note naming

`<Short Title> (<year>).md` — if Short Title is empty, the part of the title before `:` is used. Example: `LIO-SAM: Tightly-coupled ...` → `LIO-SAM (2020).md`

### What counts as a Pass 2 note

A child note of the paper that has `<h1>Pass 2</h1>`, or an h2 heading with the same name as one of the `sections` in `config.json`. If there are several, the most recently modified one is used. The heading names must match the headings in the vault template **character for character**. h2 sections that are not in the template are not copied and are written to the log.

### Matching existing notes

Paper notes that are already in your vault are matched to Zotero papers in this order.
1. The item key in the note's `zotero:` property (`zotero://select/library/items/ABCD1234`)
2. Among notes with the `type: paper` property, a note whose file name or `title:` equals the Short Title or title in Zotero and whose year is within ±1 year

If there is more than one candidate, nothing is done and it is written to the log. A paper without a match gets a new note, so if a note already exists, put the Zotero link in its `zotero:` property. You can copy the link by right-clicking the paper in Zotero.

## Configuration (`config.json`)

`install.ps1` creates it, and you can edit it by hand. See [`config.example.json`](config.example.json) for an example.

| Key | Meaning |
|---|---|
| `vaultPath` | Path to the Obsidian vault |
| `papersFolder` | Folder for paper notes (relative to the vault) |
| `templatePath` | Template for new notes (relative to the vault) |
| `imageFolder` | Folder that images from Zotero notes are copied to (relative to the vault) |
| `zoteroDataDir` | Zotero data folder. If empty, it is read from the Zotero settings |
| `sections` | Names of the section headings to bring in from Zotero |

When you change the template, `{{title}}` (the file name) and `{{date}}` (today's date) are filled in automatically. The properties `title`, `authors`, `year`, `venue`, `citekey`, `url`, `zotero`, `pdf` and `field` (the collection name) are filled in when they are empty.

## Registering the Pass 2 template by hand

If `install.ps1` could not find the Better Notes settings, register the template in Zotero yourself.
1. Zotero → Edit → Settings → Better Notes → **Template Editor**
2. Create a new template and name it `[Item]Paper Pass 2`.
3. Paste [`zotero/pass2-note-template.html`](zotero/pass2-note-template.html) into it and save.

## (Optional) Create the Pass 2 note automatically

By default you right-click a paper and create the `[Item]Paper Pass 2` note yourself. If you register [`zotero/auto-pass2-note.js`](zotero/auto-pass2-note.js) in the [Actions & Tags](https://github.com/windingwind/zotero-actions-tags) plugin, the note is created automatically when you add a paper or open its PDF. `install.ps1` does not set this up, so you register it yourself.

1. Install [Actions & Tags](https://github.com/windingwind/zotero-actions-tags) in Zotero.
2. In Zotero → Edit → Settings → Actions & Tags, create **two** actions. Both use the operation `Script`, with the contents of [`zotero/auto-pass2-note.js`](zotero/auto-pass2-note.js) pasted in as is.

   | Event | When it runs |
   |---|---|
   | `Create Item` | When a paper is added to Zotero |
   | `Open File` | When a PDF is opened. This covers papers you added before setting this up |

- **It does not create duplicates.** If the paper already has a Pass 2 note, nothing happens. The test is the same one the sync script uses (see "What counts as a Pass 2 note" above).
- The `[Item]Paper Pass 2` template has to be registered in Better Notes. If you rename the template or the section headings, change `TEMPLATE` and `SECTIONS` at the top of the script to match.
- In use with Zotero 9.0.6, Better Notes 3.3.3 and Actions & Tags 2.5.2.

## Troubleshooting

- **Nothing syncs** → Check that Zotero is running and that the task in Task Scheduler is enabled and running. If the watcher has stopped, start it again with `Start-ScheduledTask -TaskName zotero2obsidian-autosync`.
- **I changed the template but nothing changed** → See "When the template is applied" above. It is not applied to notes that already exist.
- **Local API error** → Turn on Zotero → Settings → Advanced → "Allow other applications on this computer to communicate with Zotero".
- **What was skipped** → Look at `zotero-sync.log` in the repository folder.
- **Garbled Korean text** → The `.ps1` files must stay saved as UTF-8 (with BOM). Do not save them in another encoding from your editor.

## Limitations

- It works only on this PC, while Zotero is running and you are logged in to Windows.
- The sync is one-way, Zotero → Obsidian. Pass 2 content you edit in Obsidian does not go back to Zotero and is overwritten on the next sync.
- Only the personal library (My Library) is covered. Group libraries are not supported.
- The PDF link is added only when the PDF is inside the vault folder (for example, moved there by ZotMoov).
- The scripts print their messages and write their log in Korean.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```
This stops the watcher script and removes the Task Scheduler task. The notes and the template in your vault are left as they are. To restore the Zotero settings, quit Zotero and copy `prefs.js.bak-zotero2obsidian` over `prefs.js`.
