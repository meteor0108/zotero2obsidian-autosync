// node --test
// Tests addon/src/core.js against a vault kept in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

vm.runInThisContext(fs.readFileSync(path.join(__dirname, "../addon/src/core.js"), "utf8"));
/* global Z2OCore */

const SECTIONS = ["1. 기존 방법론", "2. 기존 방법론의 한계", "3. 방법론", "4. 실험 결과"];
const TEMPLATE = fs.readFileSync(path.join(__dirname, "../addon/templates/paper-note.md"), "utf8");

/** A vault in memory: path → text. Directories exist when a file is under them. */
function memoryIO(files) {
	let fsMap = new Map(Object.entries(files));
	let isDir = p => [...fsMap.keys()].some(f => f.startsWith(p + "/"));
	return {
		files: fsMap,
		sep: "/",
		join: (base, rel) => [base, ...String(rel).split(/[\\/]+/).filter(Boolean)].join("/"),
		parent: p => p.slice(0, p.lastIndexOf("/")),
		leaf: p => p.slice(p.lastIndexOf("/") + 1),
		same: (a, b) => a.toLowerCase() == b.toLowerCase(),
		listMarkdown: async dir => [...fsMap.keys()].filter(f => f.startsWith(dir + "/") && f.endsWith(".md")).sort(),
		read: async p => fsMap.get(p),
		write: async (p, text) => void fsMap.set(p, text),
		exists: async p => fsMap.has(p) || isDir(p),
		size: async p => fsMap.get(p).length,
		mkdir: async () => {},
		copy: async (a, b) => void fsMap.set(b, fsMap.get(a)),
		move: async (a, b) => {
			fsMap.set(b, fsMap.get(a));
			fsMap.delete(a);
		},
	};
}

function paper(key, title, extra = {}) {
	return {
		key,
		data: {
			key, itemType: "journalArticle", title, date: "2024",
			creators: [{ creatorType: "author", firstName: "A", lastName: "Kim" }],
			collections: [], dateModified: "2026-01-01T00:00:00Z", ...extra,
		},
		meta: { parsedDate: "2024" },
	};
}

async function run(io, opts) {
	let log = [];
	let result = await Z2OCore.sync({
		vault: "/v", papers: "/v/Papers", imgDir: "/v/img", templateText: TEMPLATE, sections: SECTIONS,
		moveNotes: true, dryRun: false, today: "2026-10-20", children: [], collections: [], ...opts,
	}, io, (id, args) => log.push([id, args]), () => "image");
	return { ...result, log };
}

const COLLECTIONS = [
	{ key: "C1", name: "SLAM", parentCollection: null },
	{ key: "C2", name: "VLN", parentCollection: null },
	{ key: "C3", name: "Sub", parentCollection: "C2" },
];

// ------------------------------------------------------------ Markdown

test("toMarkdown: headings shift, lists, quotes, tables, links, code", () => {
	let html = "<h3>Title</h3><p>Some <strong>bold</strong> and <em>em</em> with <a href=\"https://x.org/?a=1&amp;b=2\">link</a>.</p>"
		+ "<ul><li><p>one</p></li><li><p>two</p><ol><li><p>inner</p></li></ol></li></ul>"
		+ "<blockquote><p>quoted</p><p>more</p></blockquote>"
		+ "<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>"
		+ "<pre>x &lt; y\n  z</pre><p><code>c</code> &amp; x<sub>i</sub></p>";
	assert.equal(Z2OCore.toMarkdown(html, 1, {}, "img"), [
		"#### Title",
		"",
		"Some **bold** and *em* with [link](https://x.org/?a=1&b=2).",
		"",
		"- one",
		"- two",
		"\t1. inner",
		"",
		"> quoted",
		">",
		"> more",
		"",
		"| a | b |",
		"| --- | --- |",
		"| 1 | 2 |",
		"",
		"```",
		"x < y",
		"  z",
		"```",
		"",
		"`c` & x<sub>i</sub>",
	].join("\n"));
});

test("toMarkdown: images map to vault files, unknown ones get a placeholder", () => {
	let html = '<p>before</p><img data-attachment-key="ABCD1234"><p><img data-attachment-key="ZZZZ9999"></p>';
	assert.equal(Z2OCore.toMarkdown(html, 0, { ABCD1234: "ABCD1234.png" }, "image"),
		"before\n\n![[ABCD1234.png]]\n\n*(image)*");
});

test("isPass2Note and splitPass2", () => {
	let html = "<h1>Pass 2</h1><h2>1. 기존 방법론</h2><p>a</p><h2>Extra</h2><p>b</p><h2>3.방법론</h2><p>c</p>";
	assert.ok(Z2OCore.isPass2Note(html, SECTIONS));
	assert.ok(Z2OCore.isPass2Note("<h2>4. 실험 결과</h2>", SECTIONS));
	assert.ok(!Z2OCore.isPass2Note("<h1>Notes</h1><h2>Other</h2>", SECTIONS));
	let { found, other } = Z2OCore.splitPass2(html, SECTIONS);
	assert.deepEqual(Object.keys(found), ["1. 기존 방법론", "3. 방법론"]);
	assert.deepEqual(other, ["Extra"]);
});

// ------------------------------------------------------------ frontmatter

test("fillFm fills only empty values, setFm always", () => {
	let fm = "\ntitle: X\nauthors:\nvenue: —\nzotero: z\n";
	fm = Z2OCore.fillFm(fm, "title", "Y");
	fm = Z2OCore.fillFm(fm, "authors", "Kim, Lee");
	fm = Z2OCore.fillFm(fm, "venue", "CVPR: 2024");
	fm = Z2OCore.fillFm(fm, "pdf", "[[a.pdf]]", "zotero");
	assert.equal(fm, '\ntitle: X\nauthors: Kim, Lee\nvenue: "CVPR: 2024"\nzotero: z\npdf: "[[a.pdf]]"\n');
	assert.equal(Z2OCore.setFm(fm, "title", "Y"), fm.replace("title: X", "title: Y"));
	assert.equal(Z2OCore.getFm(fm, "pdf"), "[[a.pdf]]");
});

// ------------------------------------------------------------ sync

test("a new paper gets a note in its top-level collection folder", async () => {
	let io = memoryIO({});
	let r = await run(io, {
		items: [paper("AAAAAAAA", "LIO-SAM: Tightly-coupled Lidar", { collections: ["C3"] })],
		collections: COLLECTIONS,
	});
	assert.equal(r.created, 1);
	let note = io.files.get("/v/Papers/VLN/LIO-SAM (2024).md");
	assert.match(note, /^title: LIO-SAM$/m);
	assert.match(note, /^field: VLN$/m);
	assert.match(note, /^zotero: zotero:\/\/select\/library\/items\/AAAAAAAA$/m);
	assert.match(note, /^# LIO-SAM \(2024\)$/m);
});

test("the Pass 2 note goes under the vault headers, hand-written text is kept", async () => {
	let io = memoryIO({});
	let items = [paper("AAAAAAAA", "Paper")];
	let children = [{
		key: "NNNNNNNN", itemType: "note", parentItem: "AAAAAAAA", dateModified: "1",
		note: "<h1>Pass 2</h1><h2>1. 기존 방법론</h2><p>prior work</p><h2>2. 기존 방법론의 한계</h2><p>limits</p>",
	}];
	await run(io, { items, children });
	let path = "/v/Papers/Paper (2024).md";
	assert.match(io.files.get(path), /### 1\. 기존 방법론\n\n%% zotero:start %%\nprior work\n%% zotero:end %%/);

	// written by hand under a header without markers: left alone
	io.files.set(path, io.files.get(path).replace(/(### 2\. 기존 방법론의 한계\n\n)%% zotero:start %%\nlimits\n%% zotero:end %%/, "$1my own text"));
	children[0].note = children[0].note.replace("prior work", "prior work, edited");
	let r = await run(io, { items, children });
	let note = io.files.get(path);
	assert.match(note, /prior work, edited/);
	assert.match(note, /### 2\. 기존 방법론의 한계\n\nmy own text/);
	assert.ok(r.log.some(([id]) => id == "log-hand-written"));
});

test("a note follows its paper to the new collection; field follows when it matched the folder", async () => {
	let note = TEMPLATE.replace("zotero:", "zotero: zotero://select/library/items/AAAAAAAA").replace("field:", "field: SLAM");
	let io = memoryIO({ "/v/Papers/SLAM/Paper (2024).md": note });
	let r = await run(io, { items: [paper("AAAAAAAA", "Paper", { collections: ["C2"] })], collections: COLLECTIONS });
	assert.ok(!io.files.has("/v/Papers/SLAM/Paper (2024).md"));
	assert.match(io.files.get("/v/Papers/VLN/Paper (2024).md"), /^field: VLN$/m);
	assert.deepEqual(r.log.find(([id]) => id == "log-moved")[1], { from: "Papers/SLAM/Paper (2024).md", to: "Papers/VLN/Paper (2024).md" });
});

test("notes stay put: paper in no collection, note deeper than a folder, name taken, moveNotes off", async () => {
	let note = TEMPLATE.replace("zotero:", "zotero: zotero://select/library/items/AAAAAAAA");
	let noCollection = memoryIO({ "/v/Papers/SLAM/Paper (2024).md": note });
	await run(noCollection, { items: [paper("AAAAAAAA", "Paper")] });
	assert.ok(noCollection.files.has("/v/Papers/SLAM/Paper (2024).md"));

	let deep = memoryIO({ "/v/Papers/SLAM/old/Paper (2024).md": note });
	await run(deep, { items: [paper("AAAAAAAA", "Paper", { collections: ["C2"] })], collections: COLLECTIONS });
	assert.ok(deep.files.has("/v/Papers/SLAM/old/Paper (2024).md"));

	let taken = memoryIO({ "/v/Papers/SLAM/Paper (2024).md": note, "/v/Papers/VLN/Paper (2024).md": "other" });
	let r = await run(taken, { items: [paper("AAAAAAAA", "Paper", { collections: ["C2"] })], collections: COLLECTIONS });
	assert.ok(taken.files.has("/v/Papers/SLAM/Paper (2024).md"));
	assert.ok(r.log.some(([id]) => id == "log-move-blocked"));

	let off = memoryIO({ "/v/Papers/SLAM/Paper (2024).md": note });
	await run(off, { items: [paper("AAAAAAAA", "Paper", { collections: ["C2"] })], collections: COLLECTIONS, moveNotes: false });
	assert.ok(off.files.has("/v/Papers/SLAM/Paper (2024).md"));
});

test("a pdf link is filled, and repaired when its file is gone", async () => {
	let items = [paper("AAAAAAAA", "Paper")];
	let children = [{ key: "PPPPPPPP", itemType: "attachment", parentItem: "AAAAAAAA", contentType: "application/pdf", path: "/v/Papers/VLN/Kim - Paper.pdf" }];
	let io = memoryIO({ "/v/Papers/VLN/Kim - Paper.pdf": "%PDF" });
	await run(io, { items, children });
	let path = "/v/Papers/Paper (2024).md";
	assert.match(io.files.get(path), /^pdf: "\[\[Papers\/VLN\/Kim - Paper\.pdf\]\]"$/m);

	// ZotMoov moved the file: the link follows
	io.files.delete("/v/Papers/VLN/Kim - Paper.pdf");
	io.files.set("/v/Papers/SLAM/Kim - Paper.pdf", "%PDF");
	children[0].path = "/v/Papers/SLAM/Kim - Paper.pdf";
	await run(io, { items, children });
	assert.match(io.files.get(path), /^pdf: "\[\[Papers\/SLAM\/Kim - Paper\.pdf\]\]"$/m);

	// a link written by hand to a file that exists is kept
	io.files.set("/v/mine.pdf", "%PDF");
	io.files.set(path, io.files.get(path).replace(/^pdf: .*$/m, 'pdf: "[[x/mine.pdf]]"'));
	io.files.set("/v/x/mine.pdf", "%PDF");
	await run(io, { items, children });
	assert.match(io.files.get(path), /^pdf: "\[\[x\/mine\.pdf\]\]"$/m);
});

test("a note whose item was deleted is matched again by name and relinked", async () => {
	let note = TEMPLATE.replace("title:", "title: Paper").replace("year:", "year: 2024")
		.replace("zotero:", "zotero: zotero://select/library/items/DELETED1");
	let io = memoryIO({ "/v/Papers/Paper (2024).md": note });
	let r = await run(io, { items: [paper("NEWKEY12", "Paper")] });
	assert.equal(r.created, 0);
	assert.match(io.files.get("/v/Papers/Paper (2024).md"), /items\/NEWKEY12$/m);
	assert.equal(r.log[0][0], "log-linked");
});

test("dry run writes nothing", async () => {
	let io = memoryIO({});
	let r = await run(io, { items: [paper("AAAAAAAA", "Paper")], dryRun: true });
	assert.equal(r.created, 1);
	assert.equal(io.files.size, 0);
});
