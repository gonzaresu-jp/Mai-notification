using Microsoft.UI.Xaml;
using Microsoft.Windows.AppNotifications;

namespace MaiPushWinUI;

public partial class App : Application
{
    private MainWindow? _window;

    public App()
    {
        InitializeComponent();

        // トースト通知クリック時のハンドラを登録
        AppNotificationManager.Default.NotificationInvoked += OnNotificationInvoked;
        AppNotificationManager.Default.Register();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();

        // --hidden 引数がある場合はトレイに格納したまま起動
        var cmdArgs = Environment.GetCommandLineArgs();
        if (cmdArgs.Contains("--hidden"))
        {
            _window.HideToTray();
        }
        else
        {
            _window.Activate();
        }
    }

    private void OnNotificationInvoked(AppNotificationManager sender, AppNotificationActivatedEventArgs args)
    {
        // トースト通知クリック → ウィンドウを前面に出す
        _window?.DispatcherQueue.TryEnqueue(() =>
        {
            _window?.BringToFront();
        });
    }

    public static MainWindow? CurrentWindow =>
        ((App)Current)._window;
}
