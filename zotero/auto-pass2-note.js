// Creates a Pass 2 note from the Better Notes template when the paper does not have one yet.
// Register it as an action in Zotero's Actions & Tags plugin (Operation: Script). This file is a reference copy of that script.
//   Event: Create Item — when a paper is added to Zotero
//   Event: Open File   — when a PDF is opened (for papers added earlier)
// Based on: https://github.com/windingwind/zotero-actions-tags/discussions/109

const TEMPLATE = "[Item]Paper Pass 2";
const SECTIONS = ["1. Prior work", "2. Limitations of prior work", "3. Method", "4. Experiments"];

if (!item) return;
const paper = Zotero.Items.getTopLevel([item])[0];
if (!paper || !paper.isRegularItem()) return;

const bn = Zotero.BetterNotes?.api;
if (!bn?.note?.insert || !bn.template.getTemplateText(TEMPLATE)) {
  return `[Pass 2] Better Notes template "${TEMPLATE}" was not found.`;
}

// Do nothing if a Pass 2 note already exists (same test as Test-Pass2Note in zotero_sync.ps1)
const squash = (s) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "");
const isPass2 = (html) =>
  /<h1[^>]*>\s*(<[^>]+>\s*)*Pass\s*2/i.test(html) ||
  [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gis)].some((m) => SECTIONS.some((s) => squash(m[1]) === squash(s)));
if (Zotero.Items.get(paper.getNotes()).some((n) => isPass2(n.getNote()))) return;

const note = new Zotero.Item("note");
note.libraryID = paper.libraryID;
note.parentID = paper.id;
await note.saveTx();

const html = await bn.template.runItemTemplate(TEMPLATE, { itemIds: [paper.id], targetNoteId: note.id });
await bn.note.insert(note, html, -1);

return `[Pass 2] Note created: ${paper.getField("title")}`;
