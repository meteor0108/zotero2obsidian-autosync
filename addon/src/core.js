/* exported Z2OCore */

/**
 * Zotero → Obsidian paper note sync, independent of Zotero.
 *
 * Takes Zotero data in the shape of the Zotero web API (item.toResponseJSON()) and does all
 * file access through `io`, so the same code runs inside Zotero and under Node for tests.
 *
 *   - New paper → a note from the vault template, in <papers>/<top-level collection>/
 *     (<papers>/ when the paper is in no collection), named "<Short Title> (<year>).md".
 *   - Frontmatter fields are filled only when empty; values written by hand are kept.
 *     Exception: a pdf link whose file is gone (ZotMoov moved it) points to the current path.
 *   - Sections of the paper's Pass 2 note go under the same-named headers of the vault note,
 *     between %% zotero:start %% and %% zotero:end %%, replaced on every sync.
 *   - Existing notes are matched by the item key in `zotero:`, else by name and year.
 *     A key whose item no longer exists is matched again by name and year.
 *   - When the paper's top-level collection changes, the note moves to that folder.
 */
var Z2OCore = {
	MARK_START: "%% zotero:start %%",
	MARK_END: "%% zotero:end %%",

	// ------------------------------------------------------------ strings

	ENTITIES: {
		amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
		ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
		hellip: "\u2026", middot: "\u00B7", bull: "\u2022", times: "\u00D7", divide: "\u00F7", deg: "\u00B0",
		plusmn: "\u00B1", laquo: "\u00AB", raquo: "\u00BB", copy: "\u00A9", reg: "\u00AE", trade: "\u2122",
	},

	decode(s) {
		return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (all, name) => {
			if (name[0] == "#") {
				let code = name[1] == "x" || name[1] == "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
				return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
			}
			let ch = this.ENTITIES[name] ?? this.ENTITIES[name.toLowerCase()];
			return ch ?? all;
		});
	},

	norm(s) {
		return s ? s.toLowerCase().replace(/[^\p{L}\p{Nd}]/gu, "") : "";
	},

	stripTags(html) {
		return this.decode(html.replace(/<[^>]+>/g, "")).trim();
	},

	quoteYaml(v) {
		if (/^[\p{L}\p{Nd}(]/u.test(v) && !/: |\s#|^\d+[-:]|[[\]{}]/.test(v) && !/['"]$/.test(v)) return v;
		return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
	},

	safeFileName(s) {
		s = s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
		if (s.length > 120) s = s.slice(0, 120).trim();
		return s;
	},

	escapeRegex(s) {
		return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	},

	// ------------------------------------------------------------ Zotero note HTML → Markdown

	/**
	 * @param {String} html
	 * @param {Number} headShift - added to every heading level (the section header's depth in the vault note)
	 * @param {Object} imgMap - attachment key of an embedded image → file name in the vault
	 * @param {String} missingImage - placeholder for an image that isn't in imgMap
	 */
	toMarkdown(html, headShift, imgMap, missingImage) {
		let out = "";
		let lists = [];
		let quotes = [];
		let links = [];
		let pre = 0, preMath = false, liFresh = false, inTable = false, rows = 0, cells = 0;
		let blank = () => {
			if (out.length && !out.endsWith("\n\n")) out += out.endsWith("\n") ? "\n" : "\n\n";
		};
		let newline = () => {
			if (out.length && !out.endsWith("\n")) out += "\n";
		};

		let tokens = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
		for (let m of html.matchAll(tokens)) {
			let tok = m[0];
			if (tok.startsWith("<!--")) continue;
			let atLineStart = !out.length || out.endsWith("\n") || out.endsWith(" ");
			let indent = "\t".repeat(lists.length);

			if (m[2] === undefined) {
				let t = this.decode(tok);
				if (pre > 0) {
					out += t;
					continue;
				}
				t = t.replace(/\s+/g, " ").replace(/</g, "&lt;");
				if (atLineStart) t = t.trimStart();
				out += t;
				continue;
			}

			let close = m[1] == "/";
			let tag = m[2].toLowerCase();
			let attrs = m[3];
			let h = /^h([1-6])$/.exec(tag);
			if (h) {
				if (inTable) continue;
				if (close) out += "\n\n";
				else {
					blank();
					out += "#".repeat(Math.min(6, Number(h[1]) + headShift)) + " ";
				}
				continue;
			}
			switch (tag) {
				case "p":
					if (inTable || pre > 0) break;
					if (lists.length) {
						if (!close) {
							if (liFresh) liFresh = false;
							else out += "\n" + indent;
						}
					}
					else if (close) out += "\n\n";
					else blank();
					break;
				case "ul":
				case "ol":
					if (close) {
						lists.pop();
						if (!lists.length) out += "\n\n";
					}
					else {
						if (!lists.length) blank();
						let start = /start="?(\d+)/i.exec(attrs);
						lists.push({ ordered: tag == "ol", n: start ? Number(start[1]) - 1 : 0 });
					}
					break;
				case "li":
					if (!close && lists.length) {
						let top = lists[lists.length - 1];
						top.n++;
						newline();
						out += "\t".repeat(lists.length - 1) + (top.ordered ? `${top.n}. ` : "- ");
						liFresh = true;
					}
					break;
				case "blockquote":
					if (!close) {
						blank();
						quotes.push(out.length);
					}
					else if (quotes.length) {
						let start = quotes.pop();
						let inner = out.slice(start).replace(/^\n+|\n+$/g, "");
						out = out.slice(0, start);
						out += inner.split("\n").map(line => (line ? "> " + line : ">")).join("\n");
						out += "\n\n";
					}
					break;
				case "pre":
					if (!close) {
						blank();
						pre++;
						preMath = /class="[^"]*math/i.test(attrs);
						if (!preMath) out += "```\n";
					}
					else {
						pre = Math.max(0, pre - 1);
						if (!preMath) {
							newline();
							out += "```";
						}
						out += "\n\n";
					}
					break;
				case "strong":
				case "b":
					if (!pre) out += "**";
					break;
				case "em":
				case "i":
					if (!pre) out += "*";
					break;
				case "s":
				case "del":
				case "strike":
					out += "~~";
					break;
				case "code":
					if (!pre) out += "`";
					break;
				case "sub":
				case "sup":
					out += close ? `</${tag}>` : `<${tag}>`;
					break;
				case "a":
					if (!close) {
						let href = /href="([^"]*)"/i.exec(attrs);
						href = href ? this.decode(href[1]) : "";
						links.push(href);
						if (href) out += "[";
					}
					else if (links.length) {
						let href = links.pop();
						if (href) out += `](${href})`;
					}
					break;
				case "br":
					out += pre > 0 ? "\n" : "\n" + indent;
					break;
				case "hr":
					blank();
					out += "---\n\n";
					break;
				case "img": {
					let key = /data-attachment-key="([A-Za-z0-9]+)"/i.exec(attrs);
					if (key && imgMap[key[1]]) {
						let block = !lists.length && !inTable;
						if (block) blank();
						out += "![[" + imgMap[key[1]] + "]]";
						if (block) out += "\n\n";
					}
					else out += `*(${missingImage})*`;
					break;
				}
				case "table":
					if (close) {
						inTable = false;
						out += "\n";
					}
					else {
						blank();
						inTable = true;
						rows = 0;
					}
					break;
				case "tr":
					if (!close) {
						cells = 0;
						out += "|";
					}
					else {
						out += "\n";
						rows++;
						if (rows == 1) out += "|" + " --- |".repeat(Math.max(1, cells)) + "\n";
					}
					break;
				case "td":
				case "th":
					if (close) {
						out += " |";
						cells++;
					}
					else out += " ";
					break;
			}
		}

		return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	},

	// ------------------------------------------------------------ Pass 2 notes

	sameHeader(a, b) {
		return a.replace(/\s/g, "").toLowerCase() == b.replace(/\s/g, "").toLowerCase();
	},

	isPass2Note(html, sections) {
		if (/<h1[^>]*>\s*(<[^>]+>\s*)*Pass\s*2/i.test(html)) return true;
		for (let h of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
			let name = this.stripTags(h[1]);
			if (sections.some(s => this.sameHeader(name, s))) return true;
		}
		return false;
	},

	/**
	 * @return {{ found: Object, other: String[] }} section name → its HTML, and h2 names not in `sections`
	 */
	splitPass2(html, sections) {
		let found = {};
		let other = [];
		let hs = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
		for (let i = 0; i < hs.length; i++) {
			let name = this.stripTags(hs[i][1]);
			let from = hs[i].index + hs[i][0].length;
			let to = i + 1 < hs.length ? hs[i + 1].index : html.length;
			let sec = sections.find(s => this.sameHeader(s, name));
			if (sec) found[sec] = html.slice(from, to);
			else other.push(name);
		}
		return { found, other };
	},

	// ------------------------------------------------------------ vault notes

	/**
	 * @return {{ fm: String, body: String } | null} - frontmatter without the opening "---", and the rest
	 *   starting at the "\n---" that closes it
	 */
	splitNote(text) {
		if (!text.startsWith("---")) return null;
		let end = text.indexOf("\n---", 3);
		if (end < 0) return null;
		return { fm: text.slice(3, end), body: text.slice(end) };
	},

	fmLine(key) {
		return new RegExp(`^${this.escapeRegex(key)}:[ \\t]*(.*?)[ \\t]*$`, "m");
	},

	getFm(fm, key) {
		let m = this.fmLine(key).exec(fm);
		return m ? m[1].replace(/^["']+|["']+$/g, "") : null;
	},

	/**
	 * Set `key` only if it is missing or empty. A missing key goes after `after`, else at the end.
	 */
	fillFm(fm, key, value, after) {
		if (!value) return fm;
		let line = `${key}: ${this.quoteYaml(value)}`;
		let m = this.fmLine(key).exec(fm);
		if (m) {
			if (m[1] && !["—", "-", '""', "''"].includes(m[1])) return fm;
			return fm.slice(0, m.index) + line + fm.slice(m.index + m[0].length);
		}
		if (after) {
			let a = new RegExp(`^${this.escapeRegex(after)}:.*$`, "m").exec(fm);
			if (a) return fm.slice(0, a.index + a[0].length) + "\n" + line + fm.slice(a.index + a[0].length);
		}
		return fm.replace(/\n+$/, "") + "\n" + line;
	},

	setFm(fm, key, value) {
		let m = this.fmLine(key).exec(fm);
		if (!m) return this.fillFm(fm, key, value);
		return fm.slice(0, m.index) + `${key}: ${this.quoteYaml(value)}` + fm.slice(m.index + m[0].length);
	},

	/**
	 * Put the Pass 2 sections under the vault note's headers.
	 * Text written by hand under a header (outside the markers) is never replaced.
	 */
	updatePass2(body, pass2, sections, toMd, say, noteName) {
		for (let s of sections) {
			let h = new RegExp(`^(#{2,4}) ${this.escapeRegex(s)}[ \\t]*$`, "m").exec(body);
			if (!h) {
				say("log-no-header", { note: noteName, section: s });
				continue;
			}
			let md = s in pass2.found ? toMd(pass2.found[s], h[1].length - 2) : "";
			let block = md ? `${this.MARK_START}\n${md}\n${this.MARK_END}` : `${this.MARK_START}\n${this.MARK_END}`;
			let after = h.index + h[0].length;

			let old = /\s*%% zotero:start[\s\S]*?%% zotero:end %%/y;
			old.lastIndex = after;
			let o = old.exec(body);
			if (o) {
				body = body.slice(0, after) + "\n\n" + block + body.slice(o.index + o[0].length);
				continue;
			}
			if (!md) continue;
			let next = /^(#{1,6} |---[ \t]*$)/gm;
			next.lastIndex = Math.min(after + 1, body.length);
			let n = next.exec(body);
			let to = n ? n.index : body.length;
			if (body.slice(after, to).trim()) {
				say("log-hand-written", { note: noteName, section: s });
				continue;
			}
			body = body.slice(0, after) + "\n\n" + block + "\n\n" + body.slice(to);
		}
		return body;
	},

	// ------------------------------------------------------------ Zotero items

	/**
	 * @param {Object} it - { key, data, meta } of a top-level item
	 * @param {Object} ctx
	 */
	itemInfo(it, ctx) {
		let d = it.data;
		let year = "";
		let m;
		if (it.meta && it.meta.parsedDate) year = String(it.meta.parsedDate).slice(0, 4);
		else if ((m = /\d{4}/.exec(d.date || ""))) year = m[0];
		let title = String(d.title || "").trim();
		let short = String(d.shortTitle || "").trim();
		if (!short) {
			let i = title.indexOf(":");
			short = i > 0 && i <= 40 ? title.slice(0, i).trim() : title;
		}
		let creators = d.creators || [];
		let authors = creators.filter(c => c.creatorType == "author");
		if (!authors.length) authors = creators;
		let last = authors.map(c => c.lastName || c.name).filter(Boolean);
		let authorStr = last.length > 4 ? `${last[0]} et al.` : last.join(", ");
		let venue = "";
		for (let k of ["publicationTitle", "proceedingsTitle", "conferenceName", "bookTitle", "repository", "university", "publisher"]) {
			if (d[k]) {
				venue = String(d[k]);
				break;
			}
		}
		let url = String(d.url || "");
		if (!url && d.DOI) url = `https://doi.org/${d.DOI}`;

		let pdf = "";
		for (let a of ctx.kids.get(d.key) || []) {
			if (a.itemType != "attachment" || a.contentType != "application/pdf" || !a.path) continue;
			let rel = ctx.vaultRel(a.path);
			if (rel) {
				pdf = `[[${rel}]]`;
				break;
			}
		}
		let collection = null;
		for (let ck of d.collections || []) {
			collection = this.topCollection(ck, ctx.cols);
			if (collection) break;
		}
		return {
			key: d.key, title, short, year, authors: authorStr, venue, url, pdf, collection,
			citeKey: String(d.citationKey || ""),
			zotero: `zotero://select/library/items/${d.key}`,
		};
	},

	topCollection(key, cols) {
		let c = cols.get(key);
		while (c && c.parentCollection) c = cols.get(c.parentCollection);
		return c ? c.name : null;
	},

	findNote(info, notes, liveKeys) {
		let hit = notes.find(n => n.key == info.key);
		if (hit) return { note: hit };
		let names = [this.norm(info.short), this.norm(info.title)].filter(Boolean);
		let tl = info.title.toLowerCase();
		let cands = notes.filter((n) => {
			if (n.key && liveKeys.has(n.key)) return false;
			if (/^\d{4}$/.test(n.year || "") && /^\d{4}$/.test(info.year) && Math.abs(Number(n.year) - Number(info.year)) > 1) return false;
			for (let v of [n.name, n.title]) {
				if (!v) continue;
				if (names.includes(this.norm(v))) return true;
				let vl = v.toLowerCase();
				if (vl.length >= 4 && tl.startsWith(vl) && (tl.length == vl.length || ": -—,(".includes(tl[vl.length]))) return true;
			}
			return false;
		});
		if (cands.length == 1) return { note: cands[0] };
		if (cands.length > 1) return { ambiguous: cands.map(n => n.base).join(", ") };
		return {};
	},

	// ------------------------------------------------------------ sync

	/**
	 * @param {Object} opts
	 * @param {String} opts.vault - vault folder (absolute)
	 * @param {String} opts.papers - paper notes folder (absolute)
	 * @param {String} opts.imgDir - folder for the images of Pass 2 notes (absolute)
	 * @param {String} opts.templateText - the vault note template
	 * @param {String[]} opts.sections - Pass 2 section headers
	 * @param {Boolean} opts.moveNotes - move a note when its paper's collection changes
	 * @param {Boolean} opts.dryRun - log only, write nothing
	 * @param {String} opts.today - "YYYY-MM-DD"
	 * @param {Object[]} opts.items - top-level items, { key, data, meta } like the web API
	 * @param {Object[]} opts.children - child notes and attachments (`data` objects with parentItem);
	 *   attachments have `path` only for linked files, and `filePath` for the file on disk
	 * @param {Object[]} opts.collections - { key, name, parentCollection }
	 * @param {Object} io - file access, see test/core.test.js or src/zotero2obsidian.js
	 * @param {Function} say - (messageID, args) → logs a line
	 * @param {Function} t - (messageID, args) → localized text written into notes
	 * @return {Promise<{ created: Number, updated: Number }>}
	 */
	async sync(opts, io, say, t) {
		let ctx = {
			kids: new Map(),
			cols: new Map(opts.collections.map(c => [c.key, c])),
			vaultRel: (p) => {
				let prefix = (opts.vault + io.sep).toLowerCase();
				if (!p.toLowerCase().startsWith(prefix)) return null;
				return p.slice(prefix.length).split(io.sep).join("/");
			},
		};
		for (let c of opts.children) {
			if (!c.parentItem) continue;
			if (!ctx.kids.has(c.parentItem)) ctx.kids.set(c.parentItem, []);
			ctx.kids.get(c.parentItem).push(c);
		}
		let liveKeys = new Set(opts.items.map(it => it.data.key));
		let rel = p => p.slice(opts.vault.length + 1).split(io.sep).join("/");

		// paper notes in the vault
		let notes = [];
		for (let path of await io.listMarkdown(opts.papers)) {
			let sp = this.splitNote((await io.read(path)).replace(/\r\n/g, "\n"));
			if (!sp || !/^type:\s*paper\s*$/im.test(sp.fm)) continue;
			let z = this.getFm(sp.fm, "zotero");
			let km = z && /items\/([A-Z0-9]{8})/i.exec(z);
			let base = io.leaf(path).replace(/\.md$/i, "");
			notes.push({
				path, base, key: km ? km[1] : null,
				name: base.replace(/\s*\(\d{4}\)\s*$/, ""),
				title: this.getFm(sp.fm, "title"), year: this.getFm(sp.fm, "year"),
			});
		}

		let tpl = opts.templateText.replace(/\r\n/g, "\n");
		let claimed = new Map();
		let created = 0, updated = 0;

		for (let it of opts.items) {
			let info = this.itemInfo(it, ctx);
			let kids = ctx.kids.get(info.key) || [];
			let best = null;
			for (let k of kids) {
				if (k.itemType == "note" && this.isPass2Note(k.note || "", opts.sections)
						&& (!best || k.dateModified > best.dateModified)) {
					best = k;
				}
			}
			let p2html = best ? best.note : null;

			// images in the Pass 2 note → <imgDir>/<key>.<ext>
			let imgMap = {};
			if (p2html) {
				for (let a of ctx.kids.get(best.key) || []) {
					if (a.itemType != "attachment" || !String(a.contentType || "").startsWith("image/") || !a.filename) continue;
					if (!p2html.includes(`data-attachment-key="${a.key}"`)) continue; // removed from the note
					let src = a.filePath;
					if (!src || !(await io.exists(src))) {
						say("log-image-missing", { paper: info.short, path: src || a.filename });
						continue;
					}
					let dot = a.filename.lastIndexOf(".");
					let name = a.key + (dot > 0 ? a.filename.slice(dot) : "");
					imgMap[a.key] = name;
					let dst = io.join(opts.imgDir, name);
					if (!opts.dryRun && (!(await io.exists(dst)) || (await io.size(dst)) != (await io.size(src)))) {
						await io.mkdir(opts.imgDir);
						await io.copy(src, dst);
					}
				}
			}
			let pass2 = p2html ? this.splitPass2(p2html, opts.sections) : { found: {}, other: [] };
			let toMd = (html, shift) => this.toMarkdown(html, shift, imgMap, t("note-image-missing"));

			let match = this.findNote(info, notes, liveKeys);
			if (match.ambiguous) {
				say("log-ambiguous", { title: info.title, year: info.year, candidates: match.ambiguous });
				continue;
			}

			if (match.note) {
				let n = match.note;
				if (claimed.has(n.path)) {
					say("log-claimed-twice", { note: n.base, first: claimed.get(n.path), second: info.key });
					continue;
				}
				claimed.set(n.path, info.key);
				let raw = await io.read(n.path);
				let crlf = raw.includes("\r\n");
				let sp = this.splitNote(raw.replace(/\r\n/g, "\n"));
				let fm = sp.fm;
				fm = this.fillFm(fm, "authors", info.authors);
				fm = this.fillFm(fm, "year", info.year);
				fm = this.fillFm(fm, "venue", info.venue);
				fm = this.fillFm(fm, "citekey", info.citeKey);
				fm = this.fillFm(fm, "url", info.url);
				fm = n.key != info.key ? this.setFm(fm, "zotero", info.zotero) : this.fillFm(fm, "zotero", info.zotero);
				fm = this.fillFm(fm, "pdf", info.pdf, "zotero");
				// a pdf link whose file is gone (ZotMoov moved it to another folder) → the current path
				let link = /^\[\[([^\]|#]+\/[^\]|#]+)/.exec(this.getFm(fm, "pdf") || "");
				if (info.pdf && link && !(await io.exists(io.join(opts.vault, link[1])))) {
					fm = this.setFm(fm, "pdf", info.pdf);
				}
				// the paper's top-level collection changed → the note goes to that folder
				// (left alone: papers taken out of every collection, notes put deeper than <papers>/<folder>/)
				let moveTo = null;
				let folder = null;
				let oldDir = io.parent(n.path);
				if (opts.moveNotes && info.collection && (io.same(oldDir, opts.papers) || io.same(io.parent(oldDir), opts.papers))) {
					folder = io.join(opts.papers, this.safeFileName(info.collection));
					if (!io.same(oldDir, folder)) {
						let dest = io.join(folder, io.leaf(n.path));
						if (await io.exists(dest)) {
							say("log-move-blocked", { note: n.base, folder: this.safeFileName(info.collection) });
						}
						else {
							moveTo = dest;
							let oldField = io.same(oldDir, opts.papers) ? "" : io.leaf(oldDir);
							let curField = this.getFm(fm, "field") || "";
							if (["", "—", "-"].includes(curField) || curField.toLowerCase() == oldField.toLowerCase()) {
								fm = this.setFm(fm, "field", info.collection);
							}
						}
					}
				}
				let body = sp.body;
				if (p2html) body = this.updatePass2(body, pass2, opts.sections, toMd, say, n.base);
				let text = "---" + fm + body;
				let changed = text != raw.replace(/\r\n/g, "\n");
				if (changed) {
					say(n.key == info.key ? "log-updated" : "log-linked", { path: rel(n.path) });
					if (!opts.dryRun) await io.write(n.path, crlf ? text.replace(/\n/g, "\r\n") : text);
				}
				if (moveTo) {
					say("log-moved", { from: rel(n.path), to: rel(moveTo) });
					if (!opts.dryRun) {
						await io.mkdir(folder);
						await io.move(n.path, moveTo);
					}
					claimed.delete(n.path);
					claimed.set(moveTo, info.key);
					n.path = moveTo;
				}
				if (changed || moveTo) updated++;
			}
			else {
				let folder = info.collection ? io.join(opts.papers, this.safeFileName(info.collection)) : opts.papers;
				let base = this.safeFileName(info.year ? `${info.short} (${info.year})` : info.short);
				let path = io.join(folder, base + ".md");
				if (await io.exists(path)) {
					say("log-name-taken", { file: base + ".md", title: info.title });
					continue;
				}
				let sp = this.splitNote(tpl.replaceAll("{{date}}", opts.today).replaceAll("{{title}}", base));
				let fm = sp.fm;
				fm = this.fillFm(fm, "title", info.short);
				fm = this.fillFm(fm, "authors", info.authors);
				fm = this.fillFm(fm, "year", info.year);
				fm = this.fillFm(fm, "venue", info.venue);
				fm = this.fillFm(fm, "citekey", info.citeKey);
				fm = this.fillFm(fm, "url", info.url);
				fm = this.fillFm(fm, "zotero", info.zotero);
				fm = this.fillFm(fm, "pdf", info.pdf, "zotero");
				if (info.collection) fm = this.fillFm(fm, "field", info.collection);
				let body = sp.body;
				if (p2html) body = this.updatePass2(body, pass2, opts.sections, toMd, say, base);
				say("log-created", { path: rel(path) });
				if (!opts.dryRun) {
					await io.mkdir(folder);
					await io.write(path, "---" + fm + body);
				}
				notes.push({ path, base, key: info.key, name: info.short, title: info.short, year: info.year });
				claimed.set(path, info.key);
				created++;
			}
			if (pass2.other.length) say("log-other-sections", { paper: info.short, sections: pass2.other.join(" / ") });
		}
		return { created, updated };
	},
};
