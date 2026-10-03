# Prints what Windows tells a normal user about the computer, as one JSON line - read by the
# desktop shell (activity/system-info.ts) every few minutes. Every part is optional: what the
# system does not give is left out. Language-independent: CIM classes, not counter names.
param([switch]$BatteryReport)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$info = @{}

# Formatted performance data is a difference between two samples: the first read primes it.
$null = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process
$null = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
Start-Sleep -Milliseconds 1500

# Temperature: the ACPI thermal zones (a board sensor, not the processor's cores) and whether
# the system is cooling the processor down by slowing it (passive limit under 100%).
$zones = @(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation | ForEach-Object {
    @{
      name = ($_.Name -replace '^\\_TZ\.', '')
      celsius = [math]::Round($_.Temperature - 273.15, 1)
      throttling = ($_.PercentPassiveLimit -lt 100) -or ($_.ThrottleReasons -ne 0)
    }
  })
if ($zones.Count) { $info.thermal = $zones }

# Processor speed against its base: under 100% under load means it is held back.
$cpu = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
if ($cpu) { $info.cpuPerformance = [double]$cpu.PercentProcessorPerformance }

# Graphics load: the busiest 3D engine.
$engines = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine |
    Where-Object { $_.Name -like '*engtype_3D*' })
if ($engines.Count) {
  $info.gpuLoad = [math]::Min(100, [double](($engines | Measure-Object UtilizationPercentage -Sum).Sum))
}
$gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1
if ($gpu) { $info.gpuName = $gpu.Name }

$cell = Get-CimInstance Win32_Battery | Select-Object -First 1
if ($cell) {
  # BatteryStatus 2 = on mains power.
  $info.battery = @{ charge = [int]$cell.EstimatedChargeRemaining; onAc = ($cell.BatteryStatus -eq 2) }
  if ($BatteryReport) {
    # Capacity now against when new: the report of powercfg needs no administrator rights.
    $report = Join-Path $env:TEMP 'pd-battery-report.xml'
    powercfg /batteryreport /xml /output $report | Out-Null
    if (Test-Path $report) {
      [xml]$xml = Get-Content $report
      $first = @($xml.BatteryReport.Batteries.Battery)[0]
      if ($first) {
        $info.battery.designCapacity = [int]$first.DesignCapacity
        $info.battery.fullCapacity = [int]$first.FullChargeCapacity
      }
      Remove-Item $report -Force
    }
  }
}

# Wi-Fi: the labels of netsh follow the system language, so lines are matched by shape.
$wifi = netsh wlan show interfaces
if ($LASTEXITCODE -eq 0 -and $wifi) {
  $value = { param($pattern) ($wifi | Where-Object { $_ -match $pattern } | Select-Object -First 1) -replace '^[^:]+:\s*', '' }
  $ssid = & $value '^\s+SSID\s+:'
  if ($ssid) {
    $info.network = @{
      ssid = $ssid.Trim()
      # "Signal : 90%" whatever the word for signal is.
      signal = [int]((& $value '^\s+[^:]+:\s*\d+\s*%\s*$') -replace '[^\d]', '')
      # The first "... (Mbps) : 866.7" line is the receive rate.
      rateMbps = [double](((& $value '\([^)]+\)\s*:\s*[\d.,]+\s*$') -replace ',', '.') -replace '[^\d.]', '')
    }
  }
}

$info.physicalDisks = @(Get-PhysicalDisk | ForEach-Object {
    @{ name = $_.FriendlyName; media = "$($_.MediaType)"; health = "$($_.HealthStatus)" }
  })

$os = Get-CimInstance Win32_OperatingSystem
if ($os) {
  $info.os = @{ name = $os.Caption; build = $os.BuildNumber; bootedAt = $os.LastBootUpTime.ToUniversalTime().ToString('o') }
}

$defender = Get-MpComputerStatus
if ($defender) {
  $info.defender = @{
    enabled = [bool]$defender.AntivirusEnabled
    realtime = [bool]$defender.RealTimeProtectionEnabled
    signatureAgeDays = [int]$defender.AntivirusSignatureAge
  }
}

# The processes that take the most processor time and memory, by program name.
$processes = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
    Where-Object { $_.Name -notin @('_Total', 'Idle') } |
    Group-Object { $_.Name -replace '#\d+$', '' } |
    ForEach-Object {
      @{
        name = $_.Name
        cpu = [double](($_.Group | Measure-Object PercentProcessorTime -Sum).Sum)
        memory = [double](($_.Group | Measure-Object WorkingSetPrivate -Sum).Sum)
      }
    })
$cores = [Environment]::ProcessorCount
$info.topCpu = @($processes | Sort-Object { $_.cpu } -Descending | Select-Object -First 5 |
    ForEach-Object { @{ name = $_.name; percent = [math]::Round($_.cpu / $cores, 1) } })
$info.topMemory = @($processes | Sort-Object { $_.memory } -Descending | Select-Object -First 5 |
    ForEach-Object { @{ name = $_.name; bytes = [int64]$_.memory } })

$info | ConvertTo-Json -Compress -Depth 5
