using Microsoft.UI.Xaml;
using Microsoft.Windows.AppNotifications;

namespace MaiPushWinUI;

public partial class App : Application
{
    private static Mutex? _mutex;
    private MainWindow? _window;

    public App()
    {
        // シングルインスタンスガード（Electron の app.requestSingleInstanceLock() 相当）
        _mutex = new Mutex(true, "MaiPushWinUI_v2_Instance", out bool createdNew);
        if (!createdNew)
        {
            // 既に起動中 → そのまま終了（既存プロセスはトレイに残っている）
            _mutex.Dispose();
            Environment.Exit(0);
        }

        InitializeComponent();

        try
        {
            AppNotificationManager.Default.NotificationInvoked += OnNotificationInvoked;
            AppNotificationManager.Default.Register();
        }
        catch
        {
            // アンパッケージアプリで AUMID 未設定の場合は非致命的
        }
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();

        // --hidden 引数があればトレイに格納したまま起動（自動起動時など）
        if (Environment.GetCommandLineArgs().Contains("--hidden"))
            _window.HideToTray();
        else
            _window.Activate();
    }

    private void OnNotificationInvoked(AppNotificationManager sender, AppNotificationActivatedEventArgs args)
    {
        _window?.DispatcherQueue.TryEnqueue(() => _window?.BringToFront());
    }

    public static MainWindow? CurrentWindow => ((App)Current)._window;
}
