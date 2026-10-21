param([string]$PipeName, [switch]$CompileOnly)

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -Path (Join-Path $PSScriptRoot 'telemetry-native.cs') -ReferencedAssemblies @(
  'System.Windows.Forms', 'UIAutomationClient', 'UIAutomationTypes', 'WindowsBase', 'System.Web.Extensions'
)
if (-not $CompileOnly) { [PdTelemetry.Observer]::Run($PipeName) }