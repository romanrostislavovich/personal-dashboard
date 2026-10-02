# Prints the window the user works in, one JSON line every $IntervalSeconds — read by the desktop
# shell (activity/window-watcher.ts). Windows only: it asks the system through user32.dll, so no
# native Node module has to be built or shipped.
param([int]$IntervalSeconds = 5)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class ActiveWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO {
    public int Size;
    public RECT Monitor;
    public RECT Work;
    public uint Flags;
  }

  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);

  public static IntPtr Handle() { return GetForegroundWindow(); }

  public static string Title(IntPtr window) {
    var text = new StringBuilder(512);
    GetWindowText(window, text, text.Capacity);
    return text.ToString();
  }

  public static uint ProcessId(IntPtr window) {
    uint id;
    GetWindowThreadProcessId(window, out id);
    return id;
  }

  // The window covers its whole monitor: a video or a game, where no input is not "away".
  public static bool Fullscreen(IntPtr window) {
    RECT rect;
    if (!GetWindowRect(window, out rect)) { return false; }
    var info = new MONITORINFO();
    info.Size = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref info)) { return false; }
    return rect.Left <= info.Monitor.Left && rect.Top <= info.Monitor.Top
      && rect.Right >= info.Monitor.Right && rect.Bottom >= info.Monitor.Bottom;
  }
}
'@

# The name of a program does not change while it runs: asked once per process.
$names = @{}

while ($true) {
  $window = [ActiveWindow]::Handle()
  $sample = $null
  if ($window -ne [IntPtr]::Zero) {
    $processId = [ActiveWindow]::ProcessId($window)
    $process = Get-Process -Id $processId
    if ($process) {
      if (-not $names.ContainsKey($processId)) {
        # The file description is the name people know ("Google Chrome"); a process of another
        # user or of the system does not let it be read — then the process name has to do.
        $names[$processId] = $process.MainModule.FileVersionInfo.FileDescription
      }
      $sample = @{
        app = $process.ProcessName
        name = $names[$processId]
        title = [ActiveWindow]::Title($window)
        fullscreen = [ActiveWindow]::Fullscreen($window)
      }
    }
  }
  if ($sample) { $sample | ConvertTo-Json -Compress } else { '{}' }
  Start-Sleep -Seconds $IntervalSeconds
}
