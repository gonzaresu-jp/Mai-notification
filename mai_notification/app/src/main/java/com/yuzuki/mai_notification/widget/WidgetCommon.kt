package com.yuzuki.mai_notification.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.yuzuki.mai_notification.MainActivity
import java.time.LocalDate
import java.time.ZoneId

object WidgetCommon {
    const val ACTION_MIDNIGHT = "com.yuzuki.mai_notification.widget.MIDNIGHT"
    const val ACTION_REFRESH = "com.yuzuki.mai_notification.widget.REFRESH"

    /** タップでアプリを開く（url 指定時はそのページを開く） */
    fun openAppIntent(context: Context, requestCode: Int, url: String? = null): PendingIntent {
        val i = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            if (url != null) putExtra("targetUrl", url)
        }
        return PendingIntent.getActivity(context, requestCode, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** 配信URL などを外部アプリ（YouTube アプリ等）で開く */
    fun viewUrlIntent(context: Context, requestCode: Int, url: String): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(context, requestCode, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** provider に APPWIDGET_UPDATE を送って配置済みの全ウィジェットを更新 */
    fun requestUpdate(context: Context, provider: Class<*>) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, provider))
        if (ids.isEmpty()) return
        context.sendBroadcast(Intent(context, provider).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        })
    }

    private fun midnightIntent(context: Context, provider: Class<*>): PendingIntent =
        PendingIntent.getBroadcast(context, provider.name.hashCode(),
            Intent(context, provider).setAction(ACTION_MIDNIGHT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** 日付が変わった直後(0:01頃)に更新。正確なアラーム権限が不要な set() を使う */
    fun scheduleMidnight(context: Context, provider: Class<*>) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val next = LocalDate.now().plusDays(1).atTime(0, 1)
            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        am.set(AlarmManager.RTC, next, midnightIntent(context, provider))
    }

    fun cancelMidnight(context: Context, provider: Class<*>) {
        context.getSystemService(AlarmManager::class.java)?.cancel(midnightIntent(context, provider))
    }
}
