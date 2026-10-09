using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;

namespace MaiPushWinUI;

internal static class NotificationHelper
{
    /// <summary>
    /// 画像付き Windows トースト通知を表示する。
    /// imageUrl が null でも本文のみで表示できる。
    /// </summary>
    public static void ShowToast(string title, string body, string? imageUrl = null)
    {
        var builder = new AppNotificationBuilder()
            .AddText(title)
            .AddText(body);

        if (!string.IsNullOrEmpty(imageUrl) && Uri.TryCreate(imageUrl, UriKind.Absolute, out var imgUri))
        {
            // ヒーロー画像（通知上部に大きく表示）
            builder.SetHeroImage(imgUri);
        }

        AppNotificationManager.Default.Show(builder.BuildNotification());
    }
}
