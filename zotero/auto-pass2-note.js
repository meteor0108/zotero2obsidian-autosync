// 논문에 Pass 2 노트가 없으면 Better Notes 템플릿으로 하나 만든다.
// Zotero 의 Actions & Tags 플러그인에 액션으로 등록해 쓴다 (Operation: Script). 이 파일은 그 스크립트의 보관용 사본이다.
//   Event: Create Item — 논문을 Zotero 에 추가했을 때
//   Event: Open File   — PDF 를 열었을 때 (예전에 추가해 둔 논문용)
// 바탕: https://github.com/windingwind/zotero-actions-tags/discussions/109

const TEMPLATE = "[Item]Paper Pass 2";
const SECTIONS = ["1. 기존 방법론", "2. 기존 방법론의 한계", "3. 방법론", "4. 실험 결과"];

if (!item) return;
const paper = Zotero.Items.getTopLevel([item])[0];
if (!paper || !paper.isRegularItem()) return;

const bn = Zotero.BetterNotes?.api;
if (!bn?.note?.insert || !bn.template.getTemplateText(TEMPLATE)) {
  return `[Pass 2] Better Notes 템플릿 "${TEMPLATE}" 을 찾지 못했습니다.`;
}

// 이미 Pass 2 노트가 있으면 만들지 않는다 (zotero_sync.ps1 의 Test-Pass2Note 와 같은 기준)
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

return `[Pass 2] 노트를 만들었습니다: ${paper.getField("title")}`;
