' TaskMesh silent launcher
' Starts TaskMesh services and opens the browser without showing a terminal window.
' Shortcuts and startup entries point here instead of start-taskmesh.bat directly.
Set oShell = CreateObject("WScript.Shell")
Dim scriptDir
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
oShell.Run """" & scriptDir & "start-taskmesh.bat""", 0, False
