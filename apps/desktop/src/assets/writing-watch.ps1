# The text field the user types in, in any program — read by the desktop shell
# (writing/writing-watch.ts) to underline the mistakes over it. Windows UI Automation, the
# accessibility layer every program gives to screen readers: no native Node module is built.
#
# Out (one JSON line each):
#   {"type":"field","app":"notepad","text":"...","box":[x,y,w,h]}  a field got the focus / its text changed
#   {"type":"none"}                                                no field to check in front
#   {"type":"caret","at":12}                                       where the caret is in the text
#   {"type":"rects","id":3,"rects":[[[x,y,w,h],...],...]}          an answer to "rects"
#   {"type":"done","id":4,"ok":true}                               an answer to "replace"
# In (one JSON line each):
#   {"cmd":"rects","id":3,"ranges":[[start,length],...]}           where stretches of the text are
#   {"cmd":"replace","id":4,"start":5,"length":4,"text":"..."}     types a fix over a stretch
# Screen coordinates are physical pixels.
param([int]$PollMilliseconds = 400)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Web.Extensions, WindowsBase @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Web.Script.Serialization;

public static class WritingField {
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1 << 24 };
  static AutomationElement current;
  static string lastText;
  static int lastCaret = -1;
  static string lastApp;
  static readonly System.Collections.Concurrent.ConcurrentQueue<string> Commands =
    new System.Collections.Concurrent.ConcurrentQueue<string>();

  /** Commands come on stdin, read on a thread of their own so the polling goes on meanwhile. */
  public static void StartReading() {
    var thread = new System.Threading.Thread(() => {
      while (true) {
        var line = Console.In.ReadLine();
        if (line == null) Environment.Exit(0);
        Commands.Enqueue(line);
      }
    });
    thread.IsBackground = true;
    thread.Start();
  }

  /** The commands that came since the last turn. */
  public static void HandleCommands() {
    string line;
    while (Commands.TryDequeue(out line)) {
      try { Handle(line); } catch { }
    }
  }

  public static void Say(object value) {
    Console.Out.WriteLine(Json.Serialize(value));
    Console.Out.Flush();
  }

  /** The element with the keyboard focus, if it is a field one writes in (never a password). */
  static AutomationElement Focused() {
    AutomationElement element;
    try { element = AutomationElement.FocusedElement; } catch { return null; }
    return FieldOf(element);
  }

  /** How far up from a focused viewport its field is looked for. */
  const int ViewportLevels = 2;

  /**
   * The field of the focused element: the element itself, or — when the focus is on a plain
   * container inside a field, as in Qt programs (Telegram Desktop gives it to the QWidget that
   * is the viewport of its input) — the field around it.
   */
  public static AutomationElement FieldOf(AutomationElement element) {
    for (var level = 0; element != null && level <= ViewportLevels; level++) {
      var field = AsField(element);
      if (field != null) return field;
      ControlType type;
      try { type = element.Current.ControlType; } catch { return null; }
      // Only a container is climbed out of: a button inside a document is not the document.
      if (type != ControlType.Group && type != ControlType.Pane && type != ControlType.Custom) return null;
      try { element = TreeWalker.RawViewWalker.GetParent(element); } catch { return null; }
    }
    return null;
  }

  static AutomationElement AsField(AutomationElement element) {
    try {
      var info = element.Current;
      if (info.IsPassword || !info.IsEnabled) return null;
      object pattern;
      if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) return element;
      if (info.ControlType == ControlType.Edit && element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
        return ((ValuePattern)pattern).Current.IsReadOnly ? null : element;
      }
    } catch { }
    return null;
  }

  static string TextOf(AutomationElement element) {
    object pattern;
    if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
      return ((TextPattern)pattern).DocumentRange.GetText(100000);
    }
    if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
      return ((ValuePattern)pattern).Current.Value;
    }
    return null;
  }

  static string AppOf(AutomationElement element) {
    try { return Process.GetProcessById(element.Current.ProcessId).ProcessName.ToLowerInvariant(); }
    catch { return ""; }
  }

  /** What is in front now: told when the field, its text or the caret changed. */
  public static void Poll() {
    var element = Focused();
    if (element == null) {
      if (current != null || lastText != null) Say(new { type = "none" });
      current = null; lastText = null; lastCaret = -1;
      return;
    }
    string text;
    try { text = TextOf(element); } catch { text = null; }
    if (text == null) return;
    var same = current != null && Automation.Compare(current, element);
    if (!same || text != lastText) {
      current = element;
      lastText = text;
      lastApp = AppOf(element);
      var box = element.Current.BoundingRectangle;
      Say(new {
        type = "field", app = lastApp, text = text,
        box = new[] { box.X, box.Y, box.Width, box.Height }
      });
    }
    var caret = Caret(element);
    if (caret != lastCaret) {
      lastCaret = caret;
      Say(new { type = "caret", at = caret });
    }
  }

  /** The caret's place in the text; -1 — not known (a field without the text pattern). */
  static int Caret(AutomationElement element) {
    try {
      object pattern;
      if (!element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) return -1;
      var text = (TextPattern)pattern;
      var selection = text.GetSelection();
      if (selection.Length == 0) return -1;
      var before = text.DocumentRange.Clone();
      before.MoveEndpointByRange(TextPatternRangeEndpoint.End, selection[0], TextPatternRangeEndpoint.Start);
      return before.GetText(100000).Length;
    } catch { return -1; }
  }

  /** A stretch of the text as a range: moved there character by character from the start. */
  static TextPatternRange RangeOf(TextPattern text, int start, int length) {
    // The start moved on the whole text, then the end brought to it and moved on: moving an
    // empty range is not done by every program.
    var range = text.DocumentRange.Clone();
    range.MoveEndpointByUnit(TextPatternRangeEndpoint.Start, TextUnit.Character, start);
    range.MoveEndpointByRange(TextPatternRangeEndpoint.End, range, TextPatternRangeEndpoint.Start);
    range.MoveEndpointByUnit(TextPatternRangeEndpoint.End, TextUnit.Character, length);
    return range;
  }

  public static void Handle(string line) {
    var command = Json.Deserialize<Dictionary<string, object>>(line);
    var cmd = command["cmd"] as string;
    var id = command.ContainsKey("id") ? command["id"] : null;
    if (cmd == "rects") {
      var answer = new List<object>();
      object pattern = null;
      var has = current != null && current.TryGetCurrentPattern(TextPattern.Pattern, out pattern);
      foreach (var item in (System.Collections.IEnumerable)command["ranges"]) {
        var pair = (System.Collections.IList)item;
        var boxes = new List<double[]>();
        if (has) {
          try {
            var range = RangeOf((TextPattern)pattern, Convert.ToInt32(pair[0]), Convert.ToInt32(pair[1]));
            var raw = range.GetBoundingRectangles();
            foreach (var rect in raw) boxes.Add(new[] { rect.X, rect.Y, rect.Width, rect.Height });
          } catch { }
        }
        answer.Add(boxes);
      }
      Say(new { type = "rects", id = id, rects = answer });
    } else if (cmd == "replace") {
      Say(new { type = "done", id = id, ok = Replace(
        Convert.ToInt32(command["start"]), Convert.ToInt32(command["length"]),
        (string)command["text"], command.ContainsKey("expect") ? (string)command["expect"] : null) });
    }
  }

  /**
   * The fix typed over the stretch, as the person would: selected, then the keys. `expect` —
   * what the stretch must say: anything else (the text moved meanwhile) is left alone.
   */
  static bool Replace(int start, int length, string replacement, string expect) {
    if (current == null) return false;
    try {
      object pattern;
      if (current.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
        var range = RangeOf((TextPattern)pattern, start, length);
        if (expect != null && range.GetText(length + 1) != expect) return false;
        range.Select();
        System.Windows.Forms.SendKeys.SendWait(Escape(replacement.Length == 0 ? "{BACKSPACE}" : replacement, replacement.Length == 0));
        return true;
      }
      if (current.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
        var value = ((ValuePattern)pattern).Current.Value;
        if (start + length > value.Length) return false;
        if (expect != null && value.Substring(start, length) != expect) return false;
        ((ValuePattern)pattern).SetValue(value.Substring(0, start) + replacement + value.Substring(start + length));
        return true;
      }
    } catch { }
    return false;
  }

  /** SendKeys reads + ^ % ~ ( ) { } [ ] as keys: in a fix they are just characters. */
  static string Escape(string text, bool raw) {
    if (raw) return text;
    var result = new StringBuilder();
    foreach (var c in text) {
      if ("+^%~(){}[]".IndexOf(c) >= 0) result.Append('{').Append(c).Append('}');
      else if (c == '\n') result.Append("+{ENTER}");
      else if (c != '\r') result.Append(c);
    }
    return result.ToString();
  }
}
'@

[WritingField]::StartReading()
while ($true) {
  [WritingField]::HandleCommands()
  try { [WritingField]::Poll() } catch { }
  Start-Sleep -Milliseconds $PollMilliseconds
}
