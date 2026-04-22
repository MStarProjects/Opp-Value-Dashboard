Dim shell, fso, repoPath

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

repoPath = fso.GetParentFolderName(WScript.ScriptFullName)

shell.Run Chr(34) & repoPath & "\Open Opp Value Dashboard.cmd" & Chr(34), 0, False
