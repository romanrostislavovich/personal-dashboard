$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\src\assets\telemetry-watch.ps1') -CompileOnly
. (Join-Path $PSScriptRoot '..\src\assets\terminal-telemetry.ps1')

function Assert($condition, [string]$message) {
  if (-not $condition) { throw $message }
}

Assert ([PdTelemetry.Observer]::SafeField('devenv', $false, $true, $true, $false, $true)) 'Known editable field rejected'
foreach ($password in @($null, $true, 'false', [Windows.Automation.AutomationElement]::NotSupported)) {
  Assert (-not [PdTelemetry.Observer]::SafeField('devenv', $password, $true, $true, $false, $true)) 'Unknown/password field accepted'
}
Assert (-not [PdTelemetry.Observer]::SafeField('other', $false, $true, $true, $false, $true)) 'Non-IDE accepted'
Assert (-not [PdTelemetry.Observer]::SafeField('devenv', $false, $true, $true, $false, $false)) 'Read-only accepted'
Assert (-not [PdTelemetry.Observer]::SafeField('devenv', $false, $false, $true, $false, $true)) 'Unfocused field accepted'
Assert (-not [PdTelemetry.Observer]::SafeField('devenv', $false, $true, $false, $false, $true)) 'Disabled field accepted'
Assert (-not [PdTelemetry.Observer]::SafeField('devenv', $false, $true, $true, $true, $true)) 'Offscreen field accepted'

$data = [Runtime.InteropServices.Marshal]::AllocHGlobal(24)
try {
  $backspace = $false
  [Runtime.InteropServices.Marshal]::WriteInt32($data, 0, 65)
  [Runtime.InteropServices.Marshal]::WriteInt32($data, 8, 0)
  [Runtime.InteropServices.Marshal]::WriteInt32($data, 12, 18)
  Assert ([PdTelemetry.Observer]::Classify($data, $false, [ref]$backspace)) 'Timestamp was interpreted as injection flags'
  Assert (-not $backspace) 'Typing key classified as backspace'
  Assert (-not [PdTelemetry.Observer]::Classify($data, $true, [ref]$backspace)) 'Shortcut counted'
  foreach ($flags in @(2, 16, 18)) {
    [Runtime.InteropServices.Marshal]::WriteInt32($data, 8, $flags)
    Assert (-not [PdTelemetry.Observer]::Classify($data, $false, [ref]$backspace)) 'Injected key counted'
  }
  [Runtime.InteropServices.Marshal]::WriteInt32($data, 8, 0)
  [Runtime.InteropServices.Marshal]::WriteInt32($data, 0, 8)
  Assert ([PdTelemetry.Observer]::Classify($data, $false, [ref]$backspace)) 'Backspace not counted'
  Assert $backspace 'Backspace classification lost'
  [Runtime.InteropServices.Marshal]::WriteInt32($data, 0, 112)
  Assert (-not [PdTelemetry.Observer]::Classify($data, $false, [ref]$backspace)) 'Function key counted as typing'
} finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($data) }

$counts = New-Object PdTelemetry.Counts
$counts.Observe($false, 0)
$counts.Observe($false, 1000)
$counts.Observe($true, 4000)
$counts.Observe($true, 4100)
$first = ($counts.Drain() | ConvertFrom-Json).input
Assert ($first.inputCount -eq 2 -and $first.backspaceCount -eq 2 -and $first.backspaceBursts -eq 1) 'Native counters incorrect'
Assert ($first.pauses -eq 2 -and $first.pauseMeanMs -eq 2000 -and $first.pauseM2 -eq 2000000) 'Native moments incorrect'
$counts.Observe($true, 4200)
$second = ($counts.Drain() | ConvertFrom-Json).input
Assert ($second.backspaceCount -eq 1 -and $second.backspaceBursts -eq 0) 'Burst counted twice across drains'

foreach ($payload in @(
  '{"durationMs":10,"exitCode":0,"category":"test","command":"secret"}',
  '{"durationMs":-1,"exitCode":0,"category":"test"}',
  '{"durationMs":300001,"exitCode":0,"category":"test"}',
  '{"durationMs":"10","exitCode":0,"category":"test"}',
  '{"durationMs":10,"exitCode":0.1,"category":"test"}',
  '{"durationMs":10,"exitCode":0,"category":"unknown"}', '{}', 'invalid'
)) { Assert ($null -eq [PdTelemetry.Observer]::TerminalJson($payload)) 'Invalid native terminal payload accepted' }

$security = [PdTelemetry.Observer]::UserPipeSecurity()
$rules = $security.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])
$user = [Security.Principal.WindowsIdentity]::GetCurrent().User
$allows = @($rules | Where-Object { $_.AccessControlType -eq 'Allow' })
Assert ($security.AreAccessRulesProtected -and $allows.Count -eq 1 -and $allows[0].IdentityReference -eq $user) 'Pipe ACL permits another user'
Assert (@($rules | Where-Object { $_.AccessControlType -eq 'Deny' -and $_.IdentityReference.Value -eq 'S-1-5-2' }).Count -eq 1) 'Remote access not denied'

# Real native pipe + real wrapper/executable, without installing a keyboard hook in the test session.
foreach ($expected in @(0, 7)) {
  $script:PdTelemetryPipe = 'pd-telemetry-' + [Guid]::NewGuid().ToString('N').Substring(0, 24)
  $server = New-Object IO.Pipes.NamedPipeServerStream($script:PdTelemetryPipe, [IO.Pipes.PipeDirection]::In, 1, [IO.Pipes.PipeTransmissionMode]::Message, [IO.Pipes.PipeOptions]::Asynchronous, 512, 512, $security)
  try {
    $connection = $server.BeginWaitForConnection($null, $null)
    Invoke-PdCommand -Category test -FilePath $env:ComSpec -ArgumentList @('/d', '/c', "exit $expected")
    Assert ($global:LASTEXITCODE -eq $expected) 'Wrapper changed native exit status'
    Assert ($connection.AsyncWaitHandle.WaitOne(2000)) 'Wrapper did not connect'
    $server.EndWaitForConnection($connection)
    $connection.AsyncWaitHandle.Close()
    $buffer = New-Object byte[] 513
    $read = $server.BeginRead($buffer, 0, $buffer.Length, $null, $null)
    Assert ($read.AsyncWaitHandle.WaitOne(2000)) 'Wrapper did not report'
    $length = $server.EndRead($read)
    $read.AsyncWaitHandle.Close()
    $result = [PdTelemetry.Observer]::TerminalJson([Text.Encoding]::UTF8.GetString($buffer, 0, $length)) | ConvertFrom-Json
    Assert ($result.terminal.exitCode -eq $expected -and $result.terminal.category -eq 'test') 'Wrapper report rejected/incorrect'
    Assert (@($result.terminal.PSObject.Properties).Count -eq 3) 'Wrapper transmitted extra fields'
  } finally { $server.Dispose() }
}
$script:PdTelemetryPipe = 'pd-telemetry-' + [Guid]::NewGuid().ToString('N').Substring(0, 24)
Invoke-PdCommand -Category general -FilePath $env:ComSpec -ArgumentList @('/d', '/c', 'exit 9')
Assert ($global:LASTEXITCODE -eq 9) 'Unavailable collector changed command status'
Write-Output 'Native telemetry: policy, aggregates, validation, pipe ACL and real wrapper tests passed.'