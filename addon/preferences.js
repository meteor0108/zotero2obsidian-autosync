/* global Zotero, ChromeUtils */

/**
 * Runs in the preferences window: folder picker, status of the plugins this one works with,
 * and the sync buttons
 */
var Zotero2ObsidianPrefs = {
	init() {
		document.getElementById("z2o-browse").addEventListener("command", () => this.browse());
		document.getElementById("z2o-preview").addEventListener("command", () => this.run(true));
		document.getElementById("z2o-sync").addEventListener("command", () => this.run(false));
		this.showStatus();
		this.showLog();
	},

	async browse() {
		let { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let fp = new FilePicker();
		let [title] = await document.l10n.formatValues(["z2o-pref-browse-title"]);
		fp.init(window, title, fp.modeGetFolder);
		let current = Zotero.Prefs.get("extensions.zotero2obsidian.vaultPath", true);
		if (current) {
			try {
				fp.displayDirectory = current;
			}
			catch (e) {}
		}
		if (await fp.show() == fp.returnOK) {
			Zotero.Prefs.set("extensions.zotero2obsidian.vaultPath", fp.file, true);
		}
	},

	showStatus() {
		let bn = document.getElementById("z2o-bn-status");
		document.l10n.setAttributes(bn, Zotero.BetterNotes?.api?.template ? "z2o-status-bn-found" : "z2o-status-bn-missing");
		let zm = document.getElementById("z2o-zotmoov-status");
		let id = "z2o-status-zotmoov-missing";
		if (Zotero.ZotMoov) {
			let subdirs = Zotero.Prefs.get("extensions.zotmoov.enable_subdir_move", true);
			let move = Zotero.Prefs.get("extensions.zotmoov.file_behavior", true) == "move";
			id = subdirs && move ? "z2o-status-zotmoov-ready" : "z2o-status-zotmoov-no-subdirs";
		}
		document.l10n.setAttributes(zm, id);
	},

	async showLog() {
		let text = await Zotero.Zotero2Obsidian.readLog();
		let output = document.getElementById("z2o-output");
		output.value = text.split("\n").filter(Boolean).slice(-100).join("\n");
		output.scrollTop = output.scrollHeight;
	},

	async run(dryRun) {
		let buttons = ["z2o-preview", "z2o-sync"].map(id => document.getElementById(id));
		for (let b of buttons) b.disabled = true;
		let output = document.getElementById("z2o-output");
		document.l10n.setAttributes(document.getElementById("z2o-output-label"), dryRun ? "z2o-pref-log-preview" : "z2o-pref-log-sync");
		try {
			let { lines } = await Zotero.Zotero2Obsidian.sync({ dryRun });
			output.value = lines.join("\n");
		}
		finally {
			for (let b of buttons) b.disabled = false;
		}
	},
};

// Pane scripts run in their own scope; the pane's inline handlers look the object up on the window
window.Zotero2ObsidianPrefs = Zotero2ObsidianPrefs;
