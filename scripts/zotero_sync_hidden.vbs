' For Task Scheduler: runs zotero_sync.ps1 without a console window.
Dim here : here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\zotero_sync.ps1""", 0, True
