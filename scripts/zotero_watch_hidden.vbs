' For Task Scheduler: runs zotero_watch.ps1 (stays running) without a console window.
Dim here : here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\zotero_watch.ps1""", 0, True