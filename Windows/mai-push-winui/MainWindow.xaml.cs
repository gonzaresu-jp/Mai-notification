using H.NotifyIcon;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Windows.AppNotifications;
using Windows.Graphics;
using Windows.UI;

namespace MaiPushWinUI;

public sealed partial class MainWindow : Window
{
    private const string AppUrl = "https://koinoyamai.love";

    private const string ChromeUA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    private readonly AppWindow _appWindow;
    private TaskbarIcon? _trayIcon;

    // V2: タブ → WebView2（1対1）
    private readonly Dictionary<TabViewItem, WebView2> _tabWebViews = new();

    public MainWindow()
    {
        InitializeComponent();

        _appWindow = this.GetAppWindow();
        _appWindow.Resize(new SizeInt32(960, 580));
        _appWindow.Title = "";
        if (File.Exists("Assets\\app-icon.ico"))
            _appWindow.SetIcon("Assets\\app-icon.ico");

        ExtendsContentIntoTitleBar = true;
        StyleCaptionButtons();
        _appWindow.Changed += (_, _) => UpdateCaptionPadding();

        _appWindow.Closing += (_, e) =>
        {
            e.Cancel = true;
            HideToTray();
        };

        SetupTrayIcon();
        _ = Task.Delay(3000).ContinueWith(_ => UpdateChecker.CheckAsync());
    }

    // ---- タイトルバー ----

    private void StyleCaptionButtons()
    {
        if (_appWindow.TitleBar is not { } tb) return;
        tb.ButtonBackgroundColor = Colors.Transparent;
        tb.ButtonInactiveBackgroundColor = Colors.Transparent;
        tb.ButtonHoverBackgroundColor = Color.FromArgb(0x26, 0xFF, 0xFF, 0xFF);
        tb.ButtonPressedBackgroundColor = Color.FromArgb(0x4D, 0xFF, 0xFF, 0xFF);
        tb.ButtonForegroundColor = Colors.White;
        tb.ButtonInactiveForegroundColor = Color.FromArgb(0x80, 0xFF, 0xFF, 0xFF);
        tb.ButtonHoverForegroundColor = Colors.White;
        tb.ButtonPressedForegroundColor = Colors.White;
    }

    private void UpdateCaptionPadding()
    {
        var inset = _appWindow.TitleBar?.RightInset ?? 138;
        DispatcherQueue.TryEnqueue(() => CaptionPadding.Width = inset);
    }

    // ---- Tabs.Loaded ----

    private void Tabs_Loaded(object sender, RoutedEventArgs e)
    {
        SetTitleBar(Tabs);
        UpdateCaptionPadding();
        AddNewTab(AppUrl);
    }

    // ---- V2: タブごとの WebView2 初期化 ----

    private async Task InitWebViewAsync(TabViewItem tab, WebView2 wv, string url)
    {
        try { await wv.EnsureCoreWebView2Async(); }
        catch { return; }

        var core = wv.CoreWebView2;
        core.Settings.UserAgent = ChromeUA;
        core.Settings.AreDevToolsEnabled = true;

        await core.AddScriptToExecuteOnDocumentCreatedAsync("""
            document.addEventListener('DOMContentLoaded', () => {
                const s = document.createElement('style');
                s.textContent = '::-webkit-scrollbar { display: none; width: 0; height: 0 }';
                document.head.appendChild(s);
            });
            """);

        await core.AddScriptToExecuteOnDocumentCreatedAsync(PushOverrideScript);

        await core.AddScriptToExecuteOnDocumentCreatedAsync(
            "Object.defineProperty(window,'__WEBVIEW2_HOST__',{value:true,writable:false});");

        core.NotificationReceived += (_, e2) =>
        {
            e2.Handled = true;
            var n = e2.Notification;
            var img = string.IsNullOrEmpty(n.BodyImageUri) ? n.IconUri : n.BodyImageUri;
            DispatcherQueue.TryEnqueue(() => NotificationHelper.ShowToast(n.Title, n.Body, img));
        };

        core.DocumentTitleChanged += (_, _) =>
        {
            DispatcherQueue.TryEnqueue(() =>
                tab.Header = string.IsNullOrEmpty(core.DocumentTitle)
                    ? "新しいタブ" : core.DocumentTitle);
        };

        core.FaviconChanged += (_, _) =>
        {
            if (Uri.TryCreate(core.FaviconUri, UriKind.Absolute, out var uri))
                DispatcherQueue.TryEnqueue(() =>
                    tab.IconSource = new BitmapIconSource { UriSource = uri, ShowAsMonochrome = false });
        };

        core.NewWindowRequested += (_, e2) =>
        {
            e2.Handled = true;
            DispatcherQueue.TryEnqueue(() => AddNewTab(e2.Uri));
        };

        await core.AddScriptToExecuteOnDocumentCreatedAsync("""
            document.addEventListener('keydown', e => {
                if (!e.ctrlKey) return;
                if (e.key === 't') { e.preventDefault(); window.chrome.webview.postMessage('shortcut:new-tab'); }
                if (e.key === 'w') { e.preventDefault(); window.chrome.webview.postMessage('shortcut:close-tab'); }
            }, true);
            """);

        core.WebMessageReceived += (_, e2) =>
        {
            switch (e2.TryGetWebMessageAsString())
            {
                case "shortcut:new-tab":
                    DispatcherQueue.TryEnqueue(() => AddNewTab(AppUrl));
                    break;
                case "shortcut:close-tab":
                    DispatcherQueue.TryEnqueue(() =>
                    {
                        if (Tabs.SelectedItem is TabViewItem t) CloseTab(t);
                    });
                    break;
            }
        };

        core.Navigate(url);
    }

    // ---- タブ管理 ----

    private void AddNewTab(string url)
    {
        var tab = new TabViewItem
        {
            Header = "新しいタブ",
            IconSource = new FontIconSource { Glyph = "" },
            IsClosable = true,
        };

        // デフォルト Visible で追加し、Loaded後に SelectionChanged が表示制御する
        var wv = new WebView2();
        wv.Loaded += async (s, e) => await InitWebViewAsync(tab, wv, url);
        _tabWebViews[tab] = wv;
        ContentGrid.Children.Add(wv);

        Tabs.TabItems.Add(tab);
        Tabs.SelectedItem = tab;  // → SelectionChanged が wv を Visible にする
    }

    private void CloseTab(TabViewItem tab)
    {
        if (_tabWebViews.TryGetValue(tab, out var wv))
        {
            ContentGrid.Children.Remove(wv);
            _tabWebViews.Remove(tab);
        }
        Tabs.TabItems.Remove(tab);
        if (Tabs.TabItems.Count == 0)
            AddNewTab(AppUrl);
    }

    private void ReloadActive()
    {
        if (Tabs.SelectedItem is TabViewItem t && _tabWebViews.TryGetValue(t, out var wv))
            try { wv.CoreWebView2?.Reload(); } catch { }
    }

    // ---- TabView イベント ----

    private void Tabs_AddTabButtonClick(TabView sender, object args) => AddNewTab(AppUrl);

    private void Tabs_TabCloseRequested(TabView sender, TabViewTabCloseRequestedEventArgs args) =>
        CloseTab(args.Tab);

    private void Tabs_SelectionChanged(object sender, SelectionChangedEventArgs args)
    {
        foreach (var (_, webView) in _tabWebViews)
            webView.Visibility = Visibility.Collapsed;

        if (Tabs.SelectedItem is TabViewItem tab && _tabWebViews.TryGetValue(tab, out var active))
            active.Visibility = Visibility.Visible;
    }

    private void Tabs_KeyDown(object sender, Microsoft.UI.Xaml.Input.KeyRoutedEventArgs e) { }

    // ---- PushManager 偽装 ----

    private const string PushOverrideScript = """
        (function () {
            const KEY = '__wv2_push_sub__';
            class _FakePushMgr {
                async subscribe(opts) {
                    const cached = localStorage.getItem(KEY);
                    if (cached) return Object.assign(JSON.parse(cached), {
                        unsubscribe: async () => { localStorage.removeItem(KEY); return true; }
                    });
                    const fake = {
                        endpoint: 'webview2://push/' + Date.now(),
                        expirationTime: null,
                        keys: { p256dh: '', auth: '' },
                        toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: this.keys }; },
                        unsubscribe: async () => { localStorage.removeItem(KEY); return true; },
                    };
                    localStorage.setItem(KEY, JSON.stringify(fake.toJSON()));
                    return fake;
                }
                async getSubscription() {
                    const s = localStorage.getItem(KEY);
                    if (!s) return null;
                    return Object.assign(JSON.parse(s), {
                        unsubscribe: async () => { localStorage.removeItem(KEY); return true; }
                    });
                }
                async permissionState(opts) { return 'granted'; }
            }
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(reg => {
                    Object.defineProperty(reg, 'pushManager',
                        { get: () => new _FakePushMgr(), configurable: true });
                }).catch(() => {});
            }
        })();
        """;

    // ---- システムトレイ ----

    private void SetupTrayIcon()
    {
        try
        {
            _trayIcon = new TaskbarIcon { ToolTipText = "MaiPush" };
            var ico = Path.GetFullPath("Assets\\tray-icon.ico");
            if (File.Exists(ico))
                _trayIcon.Icon = new System.Drawing.Icon(ico);
            _trayIcon.DoubleClickCommand = new SimpleCommand(BringToFront);

            var menu = new MenuFlyout();
            void AddItem(string text, Action action)
            {
                var item = new MenuFlyoutItem { Text = text };
                item.Click += (_, _) => action();
                menu.Items.Add(item);
            }
            AddItem("開く", BringToFront);
            AddItem("再読み込み", () => ReloadActive());
            AddItem("新しいタブ", () => { BringToFront(); AddNewTab(AppUrl); });
            menu.Items.Add(new MenuFlyoutSeparator());
            AddItem("終了", ExitApp);
            _trayIcon.ContextFlyout = menu;
            _trayIcon.ForceCreate(enablesEfficiencyMode: false);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Tray] {ex.Message}");
        }
    }

    public void BringToFront()
    {
        _appWindow.Show();
        _appWindow.MoveInZOrderAtTop();
        if (_appWindow.Presenter is OverlappedPresenter p &&
            p.State == OverlappedPresenterState.Minimized)
            p.Restore();
    }

    public void HideToTray() => _appWindow.Hide();

    private void ExitApp()
    {
        _trayIcon?.Dispose();
        try { AppNotificationManager.Default.Unregister(); } catch { }
        Application.Current.Exit();
    }
}

internal sealed class SimpleCommand(Action execute) : System.Windows.Input.ICommand
{
    public event EventHandler? CanExecuteChanged { add { } remove { } }
    public bool CanExecute(object? p) => true;
    public void Execute(object? p) => execute();
}

internal static class WindowExtensions
{
    public static AppWindow GetAppWindow(this Window window)
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(window);
        var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
        return AppWindow.GetFromWindowId(wndId);
    }
}
