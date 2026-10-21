# Dot-source explicitly in a terminal. Never installs a profile or inspects shell history.
function Invoke-PdCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][ValidateSet('build', 'test', 'commit', 'general')][string]$Category,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @()
  )

  # One native executable only: success is its real exit status, not a scriptblock's last statement.
  $executable = Get-Command -Name $FilePath -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $code = -1
  $global:LASTEXITCODE = $null
  try {
    & $executable.Source @ArgumentList
  } finally {
    if ($null -ne $global:LASTEXITCODE) { $code = $global:LASTEXITCODE }
    $clock.Stop()
    if ($null -ne $code -and $clock.ElapsedMilliseconds -le 300000 -and $script:PdTelemetryPipe) {
      $pipe = $null
      try {
        $pipe = New-Object IO.Pipes.NamedPipeClientStream('.', $script:PdTelemetryPipe, [IO.Pipes.PipeDirection]::Out)
        $pipe.Connect(150)
        $payload = [Text.Encoding]::UTF8.GetBytes((@{
          durationMs = $clock.ElapsedMilliseconds
          exitCode = [int]$code
          category = $Category.ToLowerInvariant()
        } | ConvertTo-Json -Compress))
        $write = $pipe.BeginWrite($payload, 0, $payload.Length, $null, $null)
        if ($write.AsyncWaitHandle.WaitOne(150)) { $pipe.EndWrite($write) }
        $write.AsyncWaitHandle.Close()
      } catch {
        # Telemetry is optional. No command, arguments, output or exception is logged or sent.
      } finally {
        if ($pipe) { $pipe.Dispose() }
      }
    }
    $global:LASTEXITCODE = $code
  }
}