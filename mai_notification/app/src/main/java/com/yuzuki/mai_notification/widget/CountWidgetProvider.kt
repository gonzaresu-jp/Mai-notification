package com.yuzuki.mai_notification.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import com.yuzuki.mai_notification.R

/** ホーム画面の「カウント」ウィジェット。通信なし（端末の日付だけで計算） */
class CountWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        val views = build(context)
        ids.forEach { mgr.updateAppWidget(it, views) }
        WidgetCommon.scheduleMidnight(context, CountWidgetProvider::class.java)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            WidgetCommon.ACTION_MIDNIGHT, Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED ->
                WidgetCommon.requestUpdate(context, CountWidgetProvider::class.java)
        }
    }

    override fun onDisabled(context: Context) {
        WidgetCommon.cancelMidnight(context, CountWidgetProvider::class.java)
    }

    private fun build(context: Context): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_count)
        val d = MaiDates
        v.setTextViewText(R.id.wc_debut, "${d.daysSince(d.DEBUT)}日")
        v.setTextViewText(R.id.wc_debut_sub, d.yearsMonths(d.DEBUT))
        v.setTextViewText(R.id.wc_birthday, dayText(d.daysUntil(d.BIRTHDAY_M, d.BIRTHDAY_D)))
        v.setTextViewText(R.id.wc_anniv, dayText(d.daysUntil(d.ANNIV_M, d.ANNIV_D)))
        v.setTextViewText(R.id.wc_love, dayText(d.daysUntil(d.LOVE_M, d.LOVE_D)))

        val oshi = d.oshiStart(context)
        if (oshi != null) {
            v.setViewVisibility(R.id.wc_oshi_box, View.VISIBLE)
            v.setTextViewText(R.id.wc_oshi, "${d.daysSince(oshi)}日")
        } else {
            v.setViewVisibility(R.id.wc_oshi_box, View.GONE)
        }
        v.setOnClickPendingIntent(R.id.wc_root, WidgetCommon.openAppIntent(context, 101))
        return v
    }

    private fun dayText(n: Long) = if (n == 0L) "今日！" else "${n}日"
}
