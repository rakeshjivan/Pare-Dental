' Double-click to start Pare Dental (no console window).
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dir
shell.Run """" & dir & "\bun.exe"" """ & dir & "\launch.mjs""", 0, False
