using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Forms;

namespace PdTelemetry {
  // Counts and running moments only. No characters, scan codes or event history are retained.
  public sealed class Counts {
    public int Input, Backspace, Bursts, Pauses;
    public double Mean, M2;
    private long last = -1;
    private int run;
    public void Observe(bool backspace, long now) {
      long gap = last < 0 ? -1 : now - last;
      if (gap >= 1000 && gap <= 60000) {
        Pauses++;
        double delta = gap - Mean;
        Mean += delta / Pauses;
        M2 += delta * (gap - Mean);
      }
      if (backspace) {
        Backspace++;
        run = gap >= 0 && gap <= 1000 ? run + 1 : 1;
        if (run == 2) Bursts++;
      } else { Input++; run = 0; }
      last = now;
    }
    public string Drain() {
      string result = new JavaScriptSerializer().Serialize(new { input = new {
        inputCount = Input, backspaceCount = Backspace, backspaceBursts = Bursts,
        pauses = Pauses, pauseMeanMs = Mean, pauseM2 = Math.Max(0, M2)
      }});
      Input = Backspace = Bursts = Pauses = 0;
      Mean = M2 = 0;
      return result;
    }
  }

  public static class Observer {
    private static readonly object sync = new object();
    private static readonly Stopwatch clock = Stopwatch.StartNew();
    private static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16384, RecursionLimit = 8 };
    private static readonly Regex privateTitle = new Regex(@"\b(incognito|inprivate|private browsing)\b|инкогнито|приватн(ый|ое) (просмотр|окно)", RegexOptions.IgnoreCase);
    private static long leaseUntil, allowedSince = -1, lastDrain;
    private static string[] privateWords = new string[0], excludedApps = new string[0];
    private static double idleMs;
    private static Counts counts = new Counts();
    private static AutomationElement previousField;
    private static IntPtr hook;
    private static readonly HookProc callback = OnKey;
    private static volatile bool ended;
    private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] private static extern IntPtr SetWindowsHookEx(int kind, HookProc proc, IntPtr module, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr handle);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr handle, int code, IntPtr message, IntPtr data);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr window);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [StructLayout(LayoutKind.Sequential)] private struct LastInput { public uint Size, Time; }
    [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LastInput input);

    // Testable policy: missing/unsupported properties are NOT equivalent to false.
    public static bool SafeField(string process, object password, object focused, object enabled,
      object offscreen, bool editable) {
      return process == "devenv" && password is bool && !(bool)password &&
        focused is bool && (bool)focused && enabled is bool && (bool)enabled &&
        offscreen is bool && !(bool)offscreen && editable;
    }

    private static void Clear() {
      counts = new Counts();
      previousField = null;
      allowedSince = -1;
    }

    private static bool Allowed(out IntPtr window, out uint pid, out string process) {
      window = GetForegroundWindow(); pid = 0; process = null;
      try {
        if (ended || clock.ElapsedMilliseconds > leaseUntil || idleMs <= 0 || window == IntPtr.Zero) return false;
        var last = new LastInput { Size = (uint)Marshal.SizeOf(typeof(LastInput)) };
        if (!GetLastInputInfo(ref last) || unchecked((uint)Environment.TickCount - last.Time) >= idleMs) return false;
        GetWindowThreadProcessId(window, out pid);
        using (var p = Process.GetProcessById((int)pid)) { process = p.ProcessName.ToLowerInvariant(); }
        foreach (string excluded in excludedApps) if (String.Equals(excluded, process, StringComparison.OrdinalIgnoreCase)) return false;
        int length = GetWindowTextLength(window);
        if (length <= 0 || length > 4096) return false;
        var title = new StringBuilder(length + 1);
        if (GetWindowText(window, title, title.Capacity) != length) return false;
        string text = title.ToString();
        if (privateTitle.IsMatch(text)) return false;
        foreach (string word in privateWords) if (text.IndexOf(word, StringComparison.OrdinalIgnoreCase) >= 0) return false;
        if (GetForegroundWindow() != window) return false;
        if (allowedSince < 0) allowedSince = clock.ElapsedMilliseconds;
        return true;
      } catch { return false; }
    }

    private static bool Field(IntPtr window, uint pid, string process, out AutomationElement element) {
      element = null;
      if (process != "devenv") return false;
      try {
        long start = clock.ElapsedMilliseconds;
        element = AutomationElement.FocusedElement;
        if (element == null || element.Current.ProcessId != pid) return false;
        object pattern;
        bool editable = false;
        ControlType type = element.Current.ControlType;
        if (type == ControlType.Edit && element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
          object readOnly = element.GetCurrentPropertyValue(ValuePattern.IsReadOnlyProperty, true);
          editable = readOnly is bool && !(bool)readOnly;
        }
        else if (type == ControlType.Document && element.Current.ClassName == "WpfTextView" &&
                 element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
          // Metadata only: never Value, Name, GetText or selection contents.
          object readOnly = ((TextPattern)pattern).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);
          editable = readOnly is bool && !(bool)readOnly;
        }
        if (!SafeField(process,
          element.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty, true),
          element.GetCurrentPropertyValue(AutomationElement.HasKeyboardFocusProperty, true),
          element.GetCurrentPropertyValue(AutomationElement.IsEnabledProperty, true),
          element.GetCurrentPropertyValue(AutomationElement.IsOffscreenProperty, true), editable)) return false;
        return GetForegroundWindow() == window && Automation.Compare(element, AutomationElement.FocusedElement) &&
          clock.ElapsedMilliseconds - start <= 50;
      } catch { return false; }
    }

    public static bool Classify(IntPtr data, bool modified, out bool backspace) {
      // KBDLLHOOKSTRUCT: vkCode at 0, scanCode at 4 (not read), flags at 8, time at 12 (not read).
      int key = Marshal.ReadInt32(data);
      int flags = Marshal.ReadInt32(data, 8);
      backspace = key == 8;
      return (flags & 0x12) == 0 && !modified && (backspace || key == 32 ||
        (key >= 0x30 && key <= 0x5A) || (key >= 0x60 && key <= 0x6F) ||
        (key >= 0xBA && key <= 0xC0) || (key >= 0xDB && key <= 0xDF));
    }

    private static IntPtr OnKey(int code, IntPtr message, IntPtr data) {
      if (code >= 0 && message == (IntPtr)0x100) {
        lock (sync) {
          try {
            IntPtr window; uint pid; string process; AutomationElement field;
            if (!Allowed(out window, out pid, out process)) { Clear(); }
            else if (!Field(window, pid, process, out field)) { counts = new Counts(); previousField = null; }
            else {
              if (previousField != null && !Automation.Compare(previousField, field)) counts = new Counts();
              previousField = field;
              // Classify transiently; no translation to characters, scan-code reads or raw-key buffering.
              bool modified = (GetAsyncKeyState(0x11) & 0x8000) != 0 || (GetAsyncKeyState(0x12) & 0x8000) != 0 ||
                (GetAsyncKeyState(0x5B) & 0x8000) != 0 || (GetAsyncKeyState(0x5C) & 0x8000) != 0;
              bool backspace;
              if (clock.ElapsedMilliseconds <= leaseUntil && Classify(data, modified, out backspace))
                counts.Observe(backspace, clock.ElapsedMilliseconds);
            }
          } catch { Clear(); }
        }
      }
      return CallNextHookEx(hook, code, message, data);
    }

    public static PipeSecurity UserPipeSecurity() {
      var security = new PipeSecurity();
      security.SetAccessRuleProtection(true, false);
      security.SetOwner(WindowsIdentity.GetCurrent().User);
      security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null),
        PipeAccessRights.FullControl, AccessControlType.Deny));
      security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User,
        PipeAccessRights.FullControl, AccessControlType.Allow));
      return security;
    }

    public static string TerminalJson(string payload) {
      try {
        var report = json.Deserialize<Dictionary<string, object>>(payload);
        if (report == null || report.Count != 3 || !report.ContainsKey("durationMs") ||
            !report.ContainsKey("exitCode") || !report.ContainsKey("category")) return null;
        if (!(report["exitCode"] is int) || !(report["category"] is string)) return null;
        object raw = report["durationMs"];
        if (!(raw is int) && !(raw is long) && !(raw is decimal) && !(raw is double)) return null;
        double duration = Convert.ToDouble(raw, CultureInfo.InvariantCulture);
        string category = (string)report["category"];
        if (Double.IsNaN(duration) || Double.IsInfinity(duration) || duration < 0 || duration > 300000 ||
            (category != "build" && category != "test" && category != "commit" && category != "general")) return null;
        return json.Serialize(new { terminal = new { durationMs = duration, exitCode = (int)report["exitCode"], category = category }});
      } catch { return null; }
    }

    private static void PipeLoop(string name) {
      while (!ended) {
        try {
          using (var pipe = new NamedPipeServerStream(name, PipeDirection.In, 1, PipeTransmissionMode.Message,
            PipeOptions.Asynchronous, 512, 512, UserPipeSecurity())) {
            pipe.WaitForConnection();
            byte[] buffer = new byte[513];
            var read = pipe.BeginRead(buffer, 0, buffer.Length, null, null);
            bool ready = read.AsyncWaitHandle.WaitOne(500);
            read.AsyncWaitHandle.Close();
            if (!ready) continue;
            int length = pipe.EndRead(read);
            if (length == 0 || length > 512 || !pipe.IsMessageComplete) continue;
            lock (sync) {
              // Validate/whitelist BEFORE forwarding even to the parent process.
              string result = TerminalJson(Encoding.UTF8.GetString(buffer, 0, length));
              IntPtr window; uint pid; string process;
              if (result == null) continue;
              if (!Allowed(out window, out pid, out process)) { Clear(); continue; }
              var report = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(buffer, 0, length));
              if (Convert.ToDouble(report["durationMs"]) > clock.ElapsedMilliseconds - allowedSince) continue;
              Console.WriteLine(result);
            }
          }
        } catch { if (!ended) Thread.Sleep(250); }
      }
    }

    private static void ReadLease() {
      try {
        string line;
        while ((line = Console.ReadLine()) != null) {
          lock (sync) {
            try {
              if (clock.ElapsedMilliseconds > leaseUntil) Clear();
              var lease = json.Deserialize<Dictionary<string, object>>(line);
              privateWords = json.ConvertToType<string[]>(lease["privateWords"]);
              excludedApps = json.ConvertToType<string[]>(lease["excludedApps"]);
              idleMs = Convert.ToDouble(lease["idleMs"]);
              if (privateWords == null || excludedApps == null || idleMs <= 0 || Double.IsNaN(idleMs) || Double.IsInfinity(idleMs)) throw new InvalidDataException();
              leaseUntil = clock.ElapsedMilliseconds + 2500;
            } catch { leaseUntil = 0; idleMs = 0; Clear(); }
          }
        }
      } finally { ended = true; }
    }

    public static void Run(string pipeName) {
      if (String.IsNullOrEmpty(pipeName) || !Regex.IsMatch(pipeName, @"^pd-telemetry-[a-f0-9]{24}$")) return;
      new Thread(ReadLease) { IsBackground = true }.Start();
      new Thread(() => PipeLoop(pipeName)) { IsBackground = true }.Start();
      hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
      var timer = new System.Windows.Forms.Timer { Interval = 100 };
      timer.Tick += (sender, args) => {
        lock (sync) {
          if (ended) { Application.ExitThread(); return; }
          IntPtr window; uint pid; string process; AutomationElement field;
          if (!Allowed(out window, out pid, out process)) Clear();
          if (clock.ElapsedMilliseconds - lastDrain >= 1000) {
            if (hook != IntPtr.Zero && Field(window, pid, process, out field)) {
              if (counts.Input + counts.Backspace > 0) Console.WriteLine(counts.Drain());
            } else { counts = new Counts(); previousField = null; }
            lastDrain = clock.ElapsedMilliseconds;
          }
        }
      };
      try { timer.Start(); Application.Run(); }
      finally { ended = true; timer.Dispose(); if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook); Clear(); }
    }
  }
}