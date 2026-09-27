package com.yuzuki.mai_notification

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface

class MaiWebBridge(
    private val context: Context,
    private val onMenuOpenChanged: ((Boolean) -> Unit)? = null
) {

    // ハンバーガーメニューの開閉をネイティブへ通知（pull-to-refresh制御に使用）
    @JavascriptInterface
    fun setMenuOpen(open: Boolean) {
        Log.d("MaiWebBridge", "setMenuOpen: $open")
        onMenuOpenChanged?.invoke(open)
    }

    // アプリのバージョン（Web 側で旧バージョンの利用者に入れ直しを案内するのに使う。v1.1 で追加）
    @JavascriptInterface
    fun getAppVersion(): String {
        return try {
            "{\"versionName\":\"${UpdateChecker.currentVersionName(context)}\",\"versionCode\":${UpdateChecker.currentVersionCode(context)}}"
        } catch (e: Exception) {
            "{}"
        }
    }

    // Web の「推し始めた日」(YYYY-MM-DD / 空文字で解除) をホーム画面ウィジェット用に保存（v1.2）
    @JavascriptInterface
    fun setOshiDate(ymd: String?) {
        if (com.yuzuki.mai_notification.widget.MaiDates.setOshiStart(context, ymd)) {
            com.yuzuki.mai_notification.widget.WidgetCommon.requestUpdate(
                context, com.yuzuki.mai_notification.widget.CountWidgetProvider::class.java)
        }
    }

    // ホーム画面にウィジェットを追加するダイアログを出す（kind: "count" / "schedule"）。
    // ランチャーが対応していない場合は false（その時は Web 側で手動追加の手順を案内する）
    @JavascriptInterface
    fun requestPinWidget(kind: String): Boolean {
        val mgr = android.appwidget.AppWidgetManager.getInstance(context)
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O || !mgr.isRequestPinAppWidgetSupported) return false
        val cls = when (kind) {
            "schedule" -> com.yuzuki.mai_notification.widget.ScheduleWidgetProvider::class.java
            else -> com.yuzuki.mai_notification.widget.CountWidgetProvider::class.java
        }
        return mgr.requestPinAppWidget(android.content.ComponentName(context, cls), null, null)
    }

    @JavascriptInterface
    fun isAndroidApp(): Boolean {
        Log.d("MaiWebBridge", "isAndroidApp")
        return true
    }

    @JavascriptInterface
    fun getAndroidClientId(): String {
        val clientId = FcmRegistrar.getClientId(context)
        Log.d("MaiWebBridge", "getAndroidClientId: $clientId")
        return clientId
    }

    @JavascriptInterface
    fun isNotificationsEnabled(): Boolean {
        Log.d("MaiWebBridge", "isNotificationsEnabled")
        return FcmRegistrar.isNotificationsEnabled(context)
    }

    @JavascriptInterface
    fun setNotificationsEnabled(enabled: Boolean) {
        Log.d("MaiWebBridge", "setNotificationsEnabled: $enabled")
        FcmRegistrar.updateAllSettings(context, enabled)
    }

    @JavascriptInterface
    fun updateSettings(settingsJson: String) {
        Log.d("MaiWebBridge", "updateSettings")
        FcmRegistrar.updateSettings(context, settingsJson)
    }

    @JavascriptInterface
    fun sendTestNotification() {
        Log.d("MaiWebBridge", "sendTestNotification")
        FcmRegistrar.sendTest(context)
    }
}
