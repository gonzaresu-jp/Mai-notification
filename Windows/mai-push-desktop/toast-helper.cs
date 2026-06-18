using System;
using System.IO;
using System.Threading;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

class ToastHelper {
    static string EscapeXml(string s) {
        return s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&apos;");
    }

    static string ToFileUri(string path) {
        if (string.IsNullOrEmpty(path)) return "";
        if (path.StartsWith("https://") || path.StartsWith("http://") || path.StartsWith("file://"))
            return path;
        return new Uri(path.Replace('\\', '/')).AbsoluteUri;
    }

    static void WriteLog(string msg) {
        string f = Path.Combine(Path.GetTempPath(), "mai-push-debug.log");
        try { File.AppendAllText(f, DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + "\n"); } catch {}
    }

    static int Main(string[] args) {
        WriteLog("Started args=" + args.Length + ": " + string.Join("|", args));

        if (args.Length < 4) {
            WriteLog("Not enough args");
            return -1;
        }

        string title  = args[0];
        string body   = args[1];
        string image  = ToFileUri(args.Length > 2 ? args[2] : "");
        string aumid  = args[3];
        string url    = args.Length > 4 ? args[4] : "";
        string icon   = ToFileUri(args.Length > 5 ? args[5] : "");

        string xml = "<?xml version='1.0' encoding='utf-8'?>"
            + "<toast launch='" + EscapeXml(url) + "'>"
            + "<visual><binding template='ToastGeneric'>"
            + "<text>" + EscapeXml(title) + "</text>"
            + "<text>" + EscapeXml(body) + "</text>";
        if (!string.IsNullOrEmpty(image))
            xml += "<image placement='hero' src='" + EscapeXml(image) + "'/>";
        if (!string.IsNullOrEmpty(icon))
            xml += "<image placement='appLogoOverride' src='" + EscapeXml(icon) + "'/>";
        xml += "</binding></visual></toast>";

        WriteLog("XML=" + xml);

        var doc = new XmlDocument();
        doc.LoadXml(xml);
        var toast = new ToastNotification(doc);
        var notifier = ToastNotificationManager.CreateToastNotifier(aumid);

        // 終了コード: 1=クリックされた(Activated) / 0=消去・タイムアウト(Dismissed) / 2=失敗(Failed)
        // クリック時のみ 1 を返し、main.js 側がそのときだけリンクを開く（通知が出ただけ・消えただけでは開かない）
        int exitCode = 0;
        using (var ev = new ManualResetEvent(false))
        {
            toast.Activated += (s, e) => {
                WriteLog("Activated");
                exitCode = 1;
                ev.Set();
            };
            toast.Dismissed += (s, e) => {
                WriteLog("Dismissed reason=" + e.Reason);
                exitCode = 0;
                ev.Set();
            };
            toast.Failed += (s, e) => {
                WriteLog("Failed error=" + e.ErrorCode);
                exitCode = 2;
                ev.Set();
            };

            notifier.Show(toast);
            WriteLog("Show OK");
            Console.Error.WriteLine("Show OK");

            ev.WaitOne();
            WriteLog("Event fired, returning code " + exitCode);
        }

        return exitCode;
    }
}
