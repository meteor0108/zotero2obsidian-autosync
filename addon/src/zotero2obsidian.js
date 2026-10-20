/* global Zotero, Z2OCore, IOUtils, PathUtils, Localization, ChromeUtils */

// Timers aren't guaranteed to be globals in a plugin's scope
var { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

Zotero2Obsidian = {
	id: null,
	version: null,
	rootURI: null,

	PREF_PREFIX: "extensions.zotero2obsidian.",
	PREF_PANE_ID: "zotero2obsidian-prefpane",
	FTL: "zotero2obsidian.ftl",
	LOG_FILE: "zotero2obsidian.log",
	LOG_MAX_LINES: 500,

	// Wait this long after the last change before acting, so a burst (typing in a note,
	// dragging a paper to another collection) is handled once
	SYNC_DELAY: 3000,
	STARTUP_SYNC_DELAY: 5000,
	PDF_MOVE_DELAY: 2000,
	PASS2_DELAY: 2000,

	_notifierID: null,
	_timers: {},
	_syncQueue: Promise.resolve(),
	_pdfItemIDs: new Set(),
	// item ID → whether it is an opened file (its parent gets the note) rather than a new paper
	_pass2ItemIDs: new Map(),
	_l10n: null,

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
	},

	debug(msg) {
		Zotero.debug("Zotero2Obsidian: " + msg);
	},

	getPref(key) {
		return Zotero.Prefs.get(this.PREF_PREFIX + key, true);
	},

	getSections() {
		return String(this.getPref("sections") || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
	},

	/**
	 * Localized text. Fluent wraps arguments in Unicode isolation marks, which only clutter a log.
	 */
	t(id, args) {
		if (!this._l10n) {
			let L = typeof Localization != "undefined" ? Localization : Zotero.getMainWindow()?.Localization;
			if (L) this._l10n = new L([this.FTL], true);
		}
		let text = this._l10n?.formatValueSync(id, args);
		return (text || id).replace(/[\u2068\u2069]/g, "");
	},

	// ------------------------------------------------------------ lifecycle

	async register() {
		await Zotero.PreferencePanes.register({
			pluginID: this.id,
			id: this.PREF_PANE_ID,
			src: this.rootURI + "preferences.xhtml",
			image: this.rootURI + "icons/icon.svg",
			scripts: [this.rootURI + "preferences.js"],
		});
		this._notifierID = Zotero.Notifier.registerObserver(this, ["item", "collection-item", "collection", "file"], "zotero2obsidian");
		this.registerPass2Template();
		Zotero.uiReadyPromise.then(() => {
			if (this.getPref("autoSync")) this._schedule("sync", this.STARTUP_SYNC_DELAY, () => this.sync());
		});
	},

	unregister() {
		if (this._notifierID) Zotero.Notifier.unregisterObserver(this._notifierID);
		for (let timer of Object.values(this._timers)) clearTimeout(timer);
		this._timers = {};
	},

	addToWindow(win) {
		let doc = win.document;
		win.MozXULElement.insertFTLIfNeeded(this.FTL);
		let popup = doc.getElementById("menu_ToolsPopup");
		if (popup && !doc.getElementById("zotero2obsidian-sync")) {
			let item = doc.createXULElement("menuitem");
			item.id = "zotero2obsidian-sync";
			item.setAttribute("data-l10n-id", "zotero2obsidian-menu-sync");
			item.addEventListener("command", () => this.syncFromMenu(win));
			popup.appendChild(item);
		}
	},

	removeFromWindow(win) {
		let doc = win.document;
		doc.getElementById("zotero2obsidian-sync")?.remove();
		doc.querySelector(`[href="${this.FTL}"]`)?.remove();
	},

	_schedule(name, delay, fn) {
		clearTimeout(this._timers[name]);
		this._timers[name] = setTimeout(() => {
			delete this._timers[name];
			fn().catch(e => Zotero.logError(e));
		}, delay);
	},

	// ------------------------------------------------------------ Zotero events

	notify(event, type, ids, extraData) {
		if (["item", "collection-item", "collection"].includes(type) && !["refresh", "redraw"].includes(event)) {
			if (this.getPref("autoSync")) this._schedule("sync", this.SYNC_DELAY, () => this.sync());
		}
		// A paper added to Zotero, or a PDF opened (for papers added before this plugin)
		if (this.getPref("autoPass2") && ((type == "item" && event == "add") || (type == "file" && event == "open"))) {
			for (let id of ids) this._pass2ItemIDs.set(id, type == "file");
			this._schedule("pass2", this.PASS2_DELAY, () => this.createPass2Notes());
		}
		if (this.getPref("movePdfs") && type == "collection-item" && (event == "add" || event == "remove")) {
			// ids are "<collectionID>-<itemID>"
			for (let id of ids) this._pdfItemIDs.add(Number(String(id).split("-")[1]));
			this._schedule("pdf", this.PDF_MOVE_DELAY, () => this.movePdfs());
		}
	},

	// ------------------------------------------------------------ sync

	/**
	 * Runs one sync after any that is already running.
	 * @return {Promise<{ lines: String[], created: Number, updated: Number } | null>}
	 */
	sync({ dryRun = false } = {}) {
		let run = this._syncQueue.then(() => this._sync(dryRun));
		this._syncQueue = run.catch(() => {});
		return run;
	},

	async _sync(dryRun) {
		let lines = [];
		let say = (id, args) => lines.push(this.t(id, args));
		try {
			return await this._syncVault(dryRun, lines, say);
		}
		catch (e) {
			Zotero.logError(e);
			say("log-error", { message: e.message });
			if (!dryRun) await this._writeLog(lines);
			return { lines, created: 0, updated: 0 };
		}
	},

	async _syncVault(dryRun, lines, say) {
		let vault = String(this.getPref("vaultPath") || "").trim().replace(/^"|"$/g, "");
		if (!vault) {
			say("log-no-vault");
			return { lines, created: 0, updated: 0 };
		}
		vault = PathUtils.normalize(vault).replace(/[\\/]+$/, "");
		if (!(await IOUtils.exists(vault))) {
			say("log-vault-missing", { path: vault });
			await this._writeLog(lines);
			return { lines, created: 0, updated: 0 };
		}
		let io = this._io();
		let papers = io.join(vault, this.getPref("papersFolder") || "Papers");
		let templatePath = io.join(vault, this.getPref("templatePath") || "Templates/paper-note.md");
		let templateText;
		if (await IOUtils.exists(templatePath)) {
			templateText = await io.read(templatePath);
		}
		else {
			templateText = await Zotero.File.getResourceAsync(this.rootURI + "templates/paper-note.md");
			say(dryRun ? "log-template-would-copy" : "log-template-copied", { path: templatePath });
			if (!dryRun) {
				await io.mkdir(PathUtils.parent(templatePath));
				await io.write(templatePath, templateText);
			}
		}
		if (!Z2OCore.splitNote(templateText.replace(/\r\n/g, "\n"))) {
			say("log-template-invalid", { path: templatePath });
			await this._writeLog(lines);
			return { lines, created: 0, updated: 0 };
		}
		let imgDir = io.join(vault, this.getPref("imageFolder") || (await this._defaultImageFolder(vault)));

		let { items, children, collections } = await this._collect();
		let result = await Z2OCore.sync({
			vault, papers, imgDir, templateText, dryRun,
			sections: this.getSections(),
			moveNotes: this.getPref("moveNotes"),
			today: new Date().toLocaleDateString("sv-SE"),
			items, children, collections,
		}, io, say, id => this.t(id));

		say(dryRun ? "log-summary-dry" : "log-summary", { created: result.created, updated: result.updated, papers: items.length });
		if (!dryRun && lines.length > 1) await this._writeLog(lines);
		this.debug(lines.join("\n"));
		return { lines, ...result };
	},

	/**
	 * The vault's own attachment folder (Obsidian settings → Files and links) + /zotero
	 */
	async _defaultImageFolder(vault) {
		try {
			let app = await IOUtils.readJSON(PathUtils.join(vault, ".obsidian", "app.json"));
			let p = String(app.attachmentFolderPath || "");
			if (p && p != "/" && !p.startsWith(".")) return p.replace(/^\/+|\/+$/g, "") + "/zotero";
		}
		catch (e) {}
		return "Attachments/zotero";
	},

	/**
	 * The user library in the shape of the Zotero web API, which is what Z2OCore reads
	 */
	async _collect() {
		let libraryID = Zotero.Libraries.userLibraryID;
		await Zotero.Libraries.get(libraryID).waitForDataLoad("item");
		let items = [];
		let children = [];
		for (let item of await Zotero.Items.getAll(libraryID, false, false)) {
			if (item.deleted || item.isAnnotation()) continue;
			if (item.isNote()) {
				if (item.parentItemKey) {
					children.push({
						key: item.key, itemType: "note", parentItem: item.parentItemKey,
						note: item.getNote(), dateModified: item.dateModified,
					});
				}
				continue;
			}
			if (item.isAttachment()) {
				if (item.parentItemKey) {
					let filePath = item.getFilePath() || null;
					children.push({
						key: item.key, itemType: "attachment", parentItem: item.parentItemKey,
						contentType: item.attachmentContentType, filename: item.attachmentFilename,
						path: item.isLinkedFileAttachment() ? filePath : null, filePath,
					});
				}
				continue;
			}
			if (!item.isRegularItem()) continue;
			let json = item.toResponseJSON();
			if (json.data.title) items.push(json);
		}
		items.sort((a, b) => (a.data.dateModified < b.data.dateModified ? 1 : a.data.dateModified > b.data.dateModified ? -1 : 0));
		let collections = Zotero.Collections.getByLibrary(libraryID, true)
			.filter(c => !c.deleted)
			.map(c => ({ key: c.key, name: c.name, parentCollection: c.parentKey || null }));
		return { items, children, collections };
	},

	_io() {
		let sep = Zotero.isWin ? "\\" : "/";
		let caseless = Zotero.isWin || Zotero.isMac;
		let listMarkdown = async (dir) => {
			let out = [];
			if (!(await IOUtils.exists(dir))) return out;
			let subdirs = [];
			for (let path of (await IOUtils.getChildren(dir)).sort()) {
				let name = PathUtils.filename(path);
				if (name.startsWith(".")) continue;
				let info = await IOUtils.stat(path);
				if (info.type == "directory") subdirs.push(path);
				else if (/\.md$/i.test(name)) out.push(path);
			}
			for (let sub of subdirs) out.push(...(await listMarkdown(sub)));
			return out;
		};
		return {
			sep,
			join: (base, rel) => PathUtils.join(base, ...String(rel).split(/[\\/]+/).filter(Boolean)),
			parent: p => PathUtils.parent(p),
			leaf: p => PathUtils.filename(p),
			same: (a, b) => (caseless ? a.toLowerCase() == b.toLowerCase() : a == b),
			listMarkdown,
			read: async p => (await IOUtils.readUTF8(p)).replace(/^\uFEFF/, ""),
			write: (p, text) => IOUtils.writeUTF8(p, text),
			exists: p => IOUtils.exists(p),
			size: async p => (await IOUtils.stat(p)).size,
			mkdir: p => IOUtils.makeDirectory(p, { createAncestors: true, ignoreExisting: true }),
			copy: (a, b) => IOUtils.copy(a, b),
			move: (a, b) => IOUtils.move(a, b, { noOverwrite: true }),
		};
	},

	get logPath() {
		return PathUtils.join(Zotero.DataDirectory.dir, this.LOG_FILE);
	},

	async _writeLog(lines) {
		let stamp = new Date().toLocaleString("sv-SE").slice(0, 16);
		let old = [];
		try {
			old = (await IOUtils.readUTF8(this.logPath)).split("\n").filter(Boolean);
		}
		catch (e) {}
		let all = old.concat(lines.map(l => `[${stamp}] ${l}`)).slice(-this.LOG_MAX_LINES);
		await IOUtils.writeUTF8(this.logPath, all.join("\n") + "\n");
	},

	async readLog() {
		try {
			return await IOUtils.readUTF8(this.logPath);
		}
		catch (e) {
			return "";
		}
	},

	async syncFromMenu(win) {
		let progress = new Zotero.ProgressWindow({ window: win });
		progress.changeHeadline("Zotero → Obsidian");
		try {
			let { lines } = await this.sync();
			let shown = lines.slice(-4);
			for (let line of shown) progress.addDescription(line);
		}
		catch (e) {
			Zotero.logError(e);
			progress.addDescription(this.t("log-error", { message: e.message }));
		}
		progress.show();
		progress.startCloseTimer(6000);
	},

	// ------------------------------------------------------------ Pass 2 notes (Better Notes)

	_betterNotes() {
		let api = Zotero.BetterNotes?.api;
		return api?.template?.getTemplateText && api.note?.insert ? api : null;
	},

	/**
	 * Add the Pass 2 note template to Better Notes if it isn't there yet.
	 * Better Notes may start after this plugin, so wait for it for a while.
	 */
	async registerPass2Template() {
		for (let i = 0; i < 30; i++) {
			let bn = this._betterNotes();
			if (bn && bn.template.getTemplateKeys().length) {
				let name = this.getPref("pass2Template");
				if (!bn.template.getTemplateText(name)) {
					let text = await Zotero.File.getResourceAsync(this.rootURI + "templates/pass2-note.html");
					bn.template.setTemplate({ name, text: text.trim() });
					this.debug(`Added Better Notes template "${name}"`);
				}
				return;
			}
			await Zotero.Promise.delay(2000);
		}
		this.debug("Better Notes not found; Pass 2 notes won't be created automatically");
	},

	async createPass2Notes() {
		let pending = [...this._pass2ItemIDs];
		this._pass2ItemIDs.clear();
		let bn = this._betterNotes();
		let name = this.getPref("pass2Template");
		if (!bn || !bn.template.getTemplateText(name)) return;
		let sections = this.getSections();
		let papers = new Map();
		for (let [id, opened] of pending) {
			let item = Zotero.Items.get(id);
			// Notes and attachments added to a paper don't count as adding the paper
			let paper = opened ? item?.parentItem : item;
			if (paper && paper.isRegularItem() && !paper.deleted) papers.set(paper.id, paper);
		}
		for (let paper of papers.values()) {
			if (Zotero.Items.get(paper.getNotes()).some(n => Z2OCore.isPass2Note(n.getNote(), sections))) continue;
			let note = new Zotero.Item("note");
			note.libraryID = paper.libraryID;
			note.parentID = paper.id;
			await note.saveTx();
			let html = await bn.template.runItemTemplate(name, { itemIds: [paper.id], targetNoteId: note.id });
			await bn.note.insert(note, html, -1);
			this.debug(`Created a Pass 2 note for ${paper.key}`);
		}
	},

	// ------------------------------------------------------------ PDFs (ZotMoov)

	/**
	 * After a paper changes collection, have ZotMoov move its linked files into the new
	 * collection's folder. Only files ZotMoov already manages (inside its folder) are touched,
	 * and only when ZotMoov sorts files into collection subfolders.
	 */
	async movePdfs() {
		let ids = [...this._pdfItemIDs];
		this._pdfItemIDs.clear();
		let zotmoov = Zotero.ZotMoov;
		if (!zotmoov || typeof zotmoov.move != "function") return;
		let dst = Zotero.Prefs.get("extensions.zotmoov.dst_dir", true);
		if (!dst
				|| !Zotero.Prefs.get("extensions.zotmoov.enable_subdir_move", true)
				|| Zotero.Prefs.get("extensions.zotmoov.file_behavior", true) != "move") {
			return;
		}
		let prefix = PathUtils.join(dst, "x").slice(0, -1);
		let io = this._io();
		let attachments = [];
		for (let item of Zotero.Items.get(ids)) {
			if (!item || item.deleted || !item.isRegularItem()) continue;
			for (let att of Zotero.Items.get(item.getAttachments())) {
				let path = att.isLinkedFileAttachment() && att.getFilePath();
				if (path && io.same(path.slice(0, prefix.length), prefix)) attachments.push(att);
			}
		}
		if (!attachments.length) return;
		this.debug(`Moving ${attachments.length} file(s) with ZotMoov`);
		await zotmoov.move(attachments, dst, zotmoov.getBasePrefs());
	},
};
