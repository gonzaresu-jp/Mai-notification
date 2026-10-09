using H.NotifyIcon;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Windows.AppNotifications;
using Windows.Graphics;

namespace MaiPushWinUI;

public sealed partial class MainWindow : Window
{
    private const string AppUrl = "https://koinoyamai.love";

    private AppWindow _appWindow;
    private TaskbarIcon? _trayIcon;

    public MainWindow()
    {
        InitializeComponent();

        _appWindow = this.GetAppWindow();
        _appWindow.Resize(new SizeInt32(420, 780));
        _appWindow.Title = "MaiPush";
        if (File.Exists("Assets\\app-icon.ico"))
            _appWindow.SetIcon("Assets\\app-icon.ico");

        // × ボタンはトレイ格納（終了しない）
        _appWindow.Closing += (_, e) =>
        {
            e.Cancel = true;
            HideToTray();
        };

        SetupTrayIcon();
        InitWebView();

        // 起動 3 秒後にアップデートチェック
        _ = Task.Delay(3000).ContinueWith(_ => UpdateChecker.CheckAsync());
    }

    // ---- システムトレイ ----

    private void SetupTrayIcon()
    {
        _trayIcon = new TaskbarIcon();
        _trayIcon.ToolTipText = "MaiPush";

        // アイコンファイルが存在すれば設定
        var icoPath = Path.GetFullPath("Assets\\tray-icon.ico");
        if (File.Exists(icoPath))
        {
            // H.NotifyIcon の UpdateIcon は System.Drawing.Icon を受け取る
            // （System.Drawing は Windows App SDK でも利用可能）
            _trayIcon.Icon = new System.Drawing.Icon(icoPath);
        }

        // ダブルクリックでウィンドウを前面に出す（ICommand 経由）
        _trayIcon.DoubleClickCommand = new SimpleCommand(BringToFront);

        // 右クリックメニュー
        var menu = new MenuFlyout();
        var openItem = new MenuFlyoutItem { Text = "開く" };
        openItem.Click += (_, _) => BringToFront();
        var exitItem = new MenuFlyoutItem { Text = "終了" };
        exitItem.Click += (_, _) => ExitApp();
        menu.Items.Add(openItem);
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(exitItem);
        _trayIcon.ContextFlyout = menu;

        _trayIcon.ForceCreate(enablesEfficiencyMode: false);
    }

    // ---- WebView2 ----

    private async void InitWebView()
    {
        await WebView.EnsureCoreWebView2Async();
        var wv = WebView.CoreWebView2;

        // Edge の組み込み通知ポップアップを横取り → Windows トーストに変換
        wv.NotificationReceived += OnNotificationReceived;

        // ポップアップは本 WebView 内で開く
        wv.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            wv.Navigate(e.Uri);
        };

        // WebView2 ホストフラグを注入（SW からの判定用）
        await wv.AddScriptToExecuteOnDocumentCreatedAsync(
            "Object.defineProperty(window,'__WEBVIEW2_HOST__',{value:true,writable:false});");

        wv.Navigate(AppUrl);
    }

    private void OnNotificationReceived(CoreWebView2 sender, CoreWebView2NotificationReceivedEventArgs e)
    {
        e.Handled = true;
        var n = e.Notification;
        // BodyImageUri（大画像）が空なら IconUri（アイコン）を使用
        var imageUrl = string.IsNullOrEmpty(n.BodyImageUri) ? n.IconUri : n.BodyImageUri;

        DispatcherQueue.TryEnqueue(() =>
            NotificationHelper.ShowToast(n.Title, n.Body, imageUrl));
    }

    // ---- ウィンドウ表示制御 ----

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
        AppNotificationManager.Default.Unregister();
        Application.Current.Exit();
    }
}

// シンプルな ICommand 実装（MVVM ライブラリ不要）
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
