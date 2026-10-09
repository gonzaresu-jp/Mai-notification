using Microsoft.UI.Xaml;
using Microsoft.Windows.AppNotifications;

namespace MaiPushWinUI;

public partial class App : Application
{
    private MainWindow? _window;

    public App()
    {
        InitializeComponent();

        // アンパッケージアプリは AUMID を明示的に設定してからトースト登録
        try
        {
            AppNotificationManager.Default.NotificationInvoked += OnNotificationInvoked;
            AppNotificationManager.Default.Register();
        }
        catch
        {
            // 通知登録失敗は非致命的（WebView2 通知自体は引き続き動く）
        }
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();

        // --hidden 引数がある場合はトレイに格納したまま起動
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
