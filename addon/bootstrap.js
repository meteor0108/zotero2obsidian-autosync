var Zotero2Obsidian;
var Z2OCore;

function install() {}

async function startup({ id, version, rootURI }) {
	Services.scriptloader.loadSubScript(rootURI + "src/core.js");
	Services.scriptloader.loadSubScript(rootURI + "src/zotero2obsidian.js");

	Zotero2Obsidian.init({ id, version, rootURI });
	// The preferences pane calls the plugin through Zotero
	Zotero.Zotero2Obsidian = Zotero2Obsidian;
	for (let win of Zotero.getMainWindows()) {
		Zotero2Obsidian.addToWindow(win);
	}
	await Zotero2Obsidian.register();
}

function onMainWindowLoad({ window }) {
	Zotero2Obsidian.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	Zotero2Obsidian.removeFromWindow(window);
}

function shutdown() {
	Zotero2Obsidian.unregister();
	for (let win of Zotero.getMainWindows()) {
		Zotero2Obsidian.removeFromWindow(win);
	}
	delete Zotero.Zotero2Obsidian;
	Zotero2Obsidian = undefined;
	Z2OCore = undefined;
}

function uninstall() {}
