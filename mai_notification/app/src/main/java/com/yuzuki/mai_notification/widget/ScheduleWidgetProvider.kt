package com.yuzuki.mai_notification.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver.PendingResult
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import com.yuzuki.mai_notification.R
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * ホーム画面の「スケジュール」ウィジェット（週/月カレンダー）。
 *
 * - 週ビュー（デフォルト）: 今週 7 日を縦に並べ、各日の予定を文字 + サムネイルで最大2件表示。
 * - 月ビュー: 6週×7日のカレンダーを表示。予定のある日にドット、セルタップで下部にその日の予定。
 * - データ: /api/events/weekly（週単位）。月は含まれる週を列挙して取得。
 * - 取得失敗時は前回キャッシュを表示。更新: 1時間ごと・日付変更時・通知受信時・更新ボタン・手動ナビ。
 *
 * RemoteViews 制約のため、レイアウトは静的定義（7行 / 42セル）を差分更新する。
 */
class ScheduleWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "MaiWidget"
        private const val BASE = "https://koinoyamai.love"
        private const val PREFS = "mai_widget"
        private const val KEY_CACHE = "schedule_cache_v2"
        private const val KEY_MODE = "schedule_mode"
        private const val KEY_ANCHOR = "schedule_anchor"
        private const val KEY_SELECTED = "schedule_selected"

        const val ACTION_TOGGLE = "com.yuzuki.mai_notification.widget.SCHEDULE_TOGGLE"
        const val ACTION_NAV = "com.yuzuki.mai_notification.widget.SCHEDULE_NAV"
        const val ACTION_PICK = "com.yuzuki.mai_notification.widget.SCHEDULE_PICK"
        const val ACTION_OPEN_DAY = "com.yuzuki.mai_notification.widget.SCHEDULE_OPEN_DAY"
        private const val EXTRA_DELTA = "delta"
        private const val EXTRA_DATE = "date"

        private const val MODE_WEEK = "week"
        private const val MODE_MONTH = "month"

        private const val REQ_HEADER = 199
        private const val REQ_REFRESH = 198
        private const val REQ_PREV = 197
        private const val REQ_NEXT = 196
        private const val REQ_MODE = 195
        private const val REQ_CELL0 = 300
        private const val REQ_ROW0 = 400

        private const val MAX_MONTH_ROWS = 4
        private const val MAX_WEEK_EVENTS = 2
        private const val THUMB_W = 120
        private const val THUMB_H = 76

        private val DOW_JP = arrayOf("日", "月", "火", "水", "木", "金", "土")
        private val PERIOD_LABELS = mapOf(
            "MORNING" to "朝", "NOON" to "昼", "EVENING" to "夕方", "NIGHT" to "夜", "LATE_NIGHT" to "深夜"
        )

        private val idCache = HashMap<String, Int>()

        fun requestUpdate(context: Context) =
            WidgetCommon.requestUpdate(context, ScheduleWidgetProvider::class.java)
    }

    private data class Ev(
        val start: LocalDateTime,
        val title: String,
        val url: String?,
        val period: String?,
        val thumb: String?
    )

    // ---------------------------------------------------------------- lifecycle

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        val pending = goAsync()
        apply(context, pending, fetch = true)
        WidgetCommon.scheduleMidnight(context, ScheduleWidgetProvider::class.java)
    }

    override fun onReceive(context: Context, intent: Intent) {
        val act = intent.action
        super.onReceive(context, intent)
        when (act) {
            ACTION_TOGGLE -> { toggleMode(context); apply(context, goAsync(), fetch = true) }
            ACTION_NAV -> {
                nav(context, intent.getIntExtra(EXTRA_DELTA, 0))
                apply(context, goAsync(), fetch = true)
            }
            ACTION_PICK -> {
                intent.getStringExtra(EXTRA_DATE)?.let { setSelected(context, it) }
                apply(context, null, fetch = false)
            }
            ACTION_OPEN_DAY -> openDay(context, intent.getStringExtra(EXTRA_DATE))
            WidgetCommon.ACTION_REFRESH, WidgetCommon.ACTION_MIDNIGHT,
            Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> {
                refreshAnchorIfNeeded(context)
                apply(context, goAsync(), fetch = true)
            }
        }
    }

    override fun onDisabled(context: Context) {
        WidgetCommon.cancelMidnight(context, ScheduleWidgetProvider::class.java)
    }

    // ---------------------------------------------------------------- state

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun mode(context: Context): String =
        prefs(context).getString(KEY_MODE, null) ?: MODE_WEEK

    private fun anchor(context: Context): LocalDate {
        prefs(context).getString(KEY_ANCHOR, null)?.let { raw ->
            try { return LocalDate.parse(raw) } catch (_: Exception) {}
        }
        val today = LocalDate.now()
        return if (mode(context) == MODE_WEEK) today.with(DayOfWeek.SUNDAY)
        else today.withDayOfMonth(1)
    }

    private fun selected(context: Context): LocalDate {
        prefs(context).getString(KEY_SELECTED, null)?.let { raw ->
            try { return LocalDate.parse(raw) } catch (_: Exception) {}
        }
        return LocalDate.now()
    }

    private fun save(context: Context, mode: String, anchor: LocalDate, selected: LocalDate) {
        prefs(context).edit()
            .putString(KEY_MODE, mode)
            .putString(KEY_ANCHOR, anchor.toString())
            .putString(KEY_SELECTED, selected.toString())
            .apply()
    }

    private fun toggleMode(context: Context) {
        val m = mode(context)
        val a = anchor(context)
        if (mode(context) == MODE_WEEK) {
            val monthStart = a.withDayOfMonth(1)
            save(context, MODE_MONTH, monthStart, coerceSelected(context, MODE_MONTH, monthStart))
        } else {
            val weekStart = a.with(DayOfWeek.SUNDAY)
            save(context, MODE_WEEK, weekStart, coerceSelected(context, MODE_WEEK, weekStart))
        }
    }

    private fun nav(context: Context, delta: Int) {
        if (delta == 0) return
        val m = mode(context)
        val a = anchor(context)
        val next = if (m == MODE_WEEK) a.plusWeeks(delta.toLong())
        else a.plusMonths(delta.toLong()).withDayOfMonth(1)
        save(context, m, next, coerceSelected(context, m, next))
    }

    /** 選択日が表示範囲から外れたら範囲内に収める */
    private fun coerceSelected(context: Context, m: String, a: LocalDate): LocalDate {
        val s = selected(context)
        val ok = if (m == MODE_WEEK) !s.isBefore(a) && !s.isAfter(a.plusDays(6))
        else s.year == a.year && s.month == a.month
        if (ok) return s
        val today = LocalDate.now()
        return if (m == MODE_WEEK) today.coerceIn(a, a.plusDays(6))
        else if (today.year == a.year && today.month == a.month) today
        else a
    }

    private fun setSelected(context: Context, raw: String) {
        val d = try { LocalDate.parse(raw) } catch (_: Exception) { return }
        val m = mode(context)
        var a = anchor(context)
        val visible = if (m == MODE_WEEK) !d.isBefore(a) && !d.isAfter(a.plusDays(6))
        else d.year == a.year && d.month == a.month
        if (!visible) a = if (m == MODE_WEEK) d.with(DayOfWeek.SUNDAY) else d.withDayOfMonth(1)
        save(context, m, a, d)
    }

    /** 日付変更時に表示範囲が今日を外れたら今日基準へ戻す */
    private fun refreshAnchorIfNeeded(context: Context) {
        val today = LocalDate.now()
        val m = mode(context)
        val a = anchor(context)
        val ok = if (m == MODE_WEEK) !today.isBefore(a) && !today.isAfter(a.plusDays(6))
        else today.year == a.year && today.month == a.month
        if (!ok) save(context, m,
            if (m == MODE_WEEK) today.with(DayOfWeek.SUNDAY) else today.withDayOfMonth(1),
            today)
    }

    /** 週行タップ: その日の最初の予定URLを開く（無ければアプリ） */
    private fun openDay(context: Context, raw: String?) {
        val url = raw?.let { dateStr ->
            loadCache(context).first.firstOrNull {
                it.start.toLocalDate().toString() == dateStr && !it.url.isNullOrBlank()
            }?.url
        }
        val pi = if (url != null && url.startsWith("https://"))
            WidgetCommon.viewUrlIntent(context, 500, url)
        else WidgetCommon.openAppIntent(context, 500)
        try { pi.send() } catch (e: Exception) { Log.w(TAG, "open day failed", e) }
    }

    // ---------------------------------------------------------------- apply / render

    private fun apply(context: Context, pending: PendingResult?, fetch: Boolean) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, ScheduleWidgetProvider::class.java))
        if (ids.isEmpty()) { pending?.finish(); return }
        val cache = loadCache(context)
        render(context, mgr, ids, usable(context, cache), loading = cache.first.isEmpty())
        if (!fetch || pending == null) { pending?.finish(); return }
        Thread {
            try {
                val evs = fetchAll(context, anchor(context), mode(context))
                if (evs != null) {
                    prefetchThumbs(context, evs)
                    saveCache(context, evs)
                }
            } catch (e: Exception) {
                Log.w(TAG, "schedule fetch failed", e)
            } finally {
                try {
                    val c = loadCache(context)
                    render(context, mgr, ids, usable(context, c), loading = false)
                } catch (_: Exception) {}
                pending.finish()
            }
        }.start()
    }

    /** キャッシュの取得時 anchor が現在の表示期間と一致する時だけ使う */
    private fun usable(context: Context, cache: Pair<List<Ev>, String?>): List<Ev> {
        val (events, anchorRaw) = cache
        if (events.isEmpty()) return events
        if (anchorRaw == null) return events
        return if (anchorRaw == anchor(context).toString()) events else emptyList()
    }

    private fun render(
        context: Context,
        mgr: AppWidgetManager,
        ids: IntArray,
        events: List<Ev>,
        loading: Boolean
    ) {
        val m = mode(context)
        val v = if (m == MODE_MONTH) {
            renderMonth(context, events, anchor(context), selected(context))
        } else {
            renderWeek(context, events, anchor(context))
        }
        v.setOnClickPendingIntent(R.id.ws_header, WidgetCommon.openAppIntent(context, REQ_HEADER))
        v.setOnClickPendingIntent(R.id.ws_refresh, PendingIntent.getBroadcast(context, REQ_REFRESH,
            Intent(context, ScheduleWidgetProvider::class.java).setAction(WidgetCommon.ACTION_REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        if (loading && events.isEmpty()) {
            v.setViewVisibility(R.id.ws_empty, View.VISIBLE)
            v.setTextViewText(R.id.ws_empty, "読み込み中…")
        }
        ids.forEach { mgr.updateAppWidget(it, v) }
    }

    // ---------------------------------------------------------------- week view

    private fun renderWeek(context: Context, all: List<Ev>, anchor: LocalDate): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_schedule_week)
        val label = "${anchor.format(DT_MD)}〜${anchor.plusDays(6).format(DT_MD)}"
        v.setTextViewText(R.id.ww_label, label)
        v.setViewVisibility(R.id.ws_empty, View.GONE)

        bindNav(context, v, R.id.ww_prev, R.id.ww_next, R.id.ww_mode, "月")

        var total = 0
        for (d in 0 until 7) {
            val date = anchor.plusDays(d.toLong())
            val day = all.filter { it.start.toLocalDate() == date }.sortedBy { it.start }
            total += day.size

            val rowId = rid(context, "ww_row$d")
            v.setTextViewText(rid(context, "ww_dow$d"), DOW_JP[date.dayOfWeek.value % 7])
            v.setTextViewText(rid(context, "ww_date$d"), date.format(DT_MD))
            val isToday = date == LocalDate.now()
            v.setInt(rowId, "setBackgroundColor", if (isToday) 0xFFF6EEF3.toInt() else Color.TRANSPARENT)
            v.setOnClickPendingIntent(rowId, dayTapIntent(context, REQ_ROW0 + d, date))

            for (n in 0 until MAX_WEEK_EVENTS) {
                val ev = day.getOrNull(n)
                val evId = rid(context, "ww_ev${d}_$n")
                if (ev == null) {
                    v.setViewVisibility(evId, View.GONE)
                    continue
                }
                v.setViewVisibility(evId, View.VISIBLE)
                v.setTextViewText(rid(context, "ww_time${d}_$n"), timeLabel(ev))
                v.setTextViewText(rid(context, "ww_title${d}_$n"), ev.title)

                val thumbId = rid(context, "ww_thumb${d}_$n")
                val bmp = ev.thumb?.let { ThumbCache.peek(context, it, THUMB_W, THUMB_H) }
                if (bmp != null) {
                    v.setViewVisibility(thumbId, View.VISIBLE)
                    v.setImageViewBitmap(thumbId, bmp)
                } else {
                    v.setViewVisibility(thumbId, View.GONE)
                }
                val target = ev.url?.takeIf { it.startsWith("https://") }
                v.setOnClickPendingIntent(evId,
                    if (target != null) WidgetCommon.viewUrlIntent(context, 600 + d * 2 + n, target)
                    else dayTapIntent(context, 700 + d, date))
            }
            val noneId = rid(context, "ww_none$d")
            v.setViewVisibility(noneId, if (day.isEmpty()) View.VISIBLE else View.GONE)
        }

        if (total == 0) {
            v.setViewVisibility(R.id.ws_empty, View.VISIBLE)
            v.setTextViewText(R.id.ws_empty, "この週の予定はありません")
        }
        return v
    }

    private fun dayTapIntent(context: Context, req: Int, date: LocalDate): PendingIntent =
        PendingIntent.getBroadcast(context, req,
            Intent(context, ScheduleWidgetProvider::class.java)
                .setAction(ACTION_OPEN_DAY).putExtra(EXTRA_DATE, date.toString()),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    // ---------------------------------------------------------------- month view

    private fun renderMonth(
        context: Context,
        all: List<Ev>,
        anchor: LocalDate,
        selected: LocalDate
    ): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_schedule_month)
        v.setTextViewText(R.id.mw_label, "${anchor.year}年${anchor.monthValue}月")
        v.setViewVisibility(R.id.ws_empty, View.GONE)
        bindNav(context, v, R.id.mw_prev, R.id.mw_next, R.id.mw_mode, "週")

        val first = anchor.withDayOfMonth(1)
        val gridStart = first.with(DayOfWeek.SUNDAY)
        val today = LocalDate.now()

        var monthEvents = 0
        for (i in 0 until 42) {
            val date = gridStart.plusDays(i.toLong())
            val inMonth = date.year == anchor.year && date.month == anchor.month
            val day = all.filter { it.start.toLocalDate() == date }
            if (inMonth) monthEvents += day.size

            val cellId = rid(context, "mw_cell$i")
            val numId = rid(context, "mw_num$i")
            val dotId = rid(context, "mw_dot$i")

            v.setTextViewText(numId, date.dayOfMonth.toString())

            val numColor = when {
                date == today -> Color.WHITE
                !inMonth -> 0xFFCFC6CD.toInt()
                date.dayOfWeek == DayOfWeek.SUNDAY -> 0xFFD14D6B.toInt()
                date.dayOfWeek == DayOfWeek.SATURDAY -> 0xFF4E7BD1.toInt()
                else -> 0xFF2B2B33.toInt()
            }
            v.setTextColor(numId, numColor)

            val bg = when {
                date == today -> 0xFFB11E7C.toInt()
                date == selected -> 0xFFF0E2EB.toInt()
                else -> Color.TRANSPARENT
            }
            v.setInt(cellId, "setBackgroundColor", bg)

            val has = day.isNotEmpty()
            v.setViewVisibility(dotId, if (has) View.VISIBLE else View.GONE)

            if (inMonth) {
                v.setOnClickPendingIntent(cellId, PendingIntent.getBroadcast(context, REQ_CELL0 + i,
                    Intent(context, ScheduleWidgetProvider::class.java)
                        .setAction(ACTION_PICK).putExtra(EXTRA_DATE, date.toString()),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            } else {
                v.setOnClickPendingIntent(cellId, null)
            }
        }

        // 選択日の予定
        val selDay = all.filter { it.start.toLocalDate() == selected }.sortedBy { it.start }
        if (selDay.isEmpty()) {
            v.setViewVisibility(R.id.mw_sel_label, View.GONE)
            v.setViewVisibility(R.id.mw_divider, View.GONE)
            for (i in 0 until MAX_MONTH_ROWS) v.setViewVisibility(rid(context, "mw_row$i"), View.GONE)
        } else {
            v.setViewVisibility(R.id.mw_divider, View.VISIBLE)
            v.setViewVisibility(R.id.mw_sel_label, View.VISIBLE)
            v.setTextViewText(R.id.mw_sel_label,
                "${selected.format(DT_MD)}(${DOW_JP[selected.dayOfWeek.value % 7]}) の予定")
            for (i in 0 until MAX_MONTH_ROWS) {
                val rowId = rid(context, "mw_row$i")
                val ev = selDay.getOrNull(i)
                if (ev == null) {
                    v.setViewVisibility(rowId, View.GONE)
                    continue
                }
                v.setViewVisibility(rowId, View.VISIBLE)
                v.setTextViewText(rid(context, "mw_time$i"), timeLabel(ev))
                v.setTextViewText(rid(context, "mw_title$i"), ev.title)
                val target = ev.url?.takeIf { it.startsWith("https://") }
                v.setOnClickPendingIntent(rowId,
                    if (target != null) WidgetCommon.viewUrlIntent(context, 800 + i, target)
                    else WidgetCommon.openAppIntent(context, 800 + i))
            }
        }

        if (monthEvents == 0) {
            v.setViewVisibility(R.id.ws_empty, View.VISIBLE)
            v.setTextViewText(R.id.ws_empty, "この月の予定はありません")
            v.setViewVisibility(R.id.mw_divider, View.GONE)
            v.setViewVisibility(R.id.mw_sel_label, View.GONE)
        }
        return v
    }

    private fun bindNav(
        context: Context,
        v: RemoteViews,
        prevId: Int,
        nextId: Int,
        modeId: Int,
        toggleLabel: String
    ) {
        v.setTextViewText(modeId, toggleLabel)
        v.setOnClickPendingIntent(modeId, navIntent(context, REQ_MODE, ACTION_TOGGLE, 0))
        v.setOnClickPendingIntent(prevId, navIntent(context, REQ_PREV, ACTION_NAV, -1))
        v.setOnClickPendingIntent(nextId, navIntent(context, REQ_NEXT, ACTION_NAV, +1))
    }

    private fun navIntent(context: Context, req: Int, action: String, delta: Int): PendingIntent =
        PendingIntent.getBroadcast(context, req,
            Intent(context, ScheduleWidgetProvider::class.java)
                .setAction(action).putExtra(EXTRA_DELTA, delta),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun timeLabel(ev: Ev): String {
        val period = ev.period?.let { PERIOD_LABELS[it.uppercase()] }
        if (period != null) return "${period}ごろ"
        return "%d:%02d".format(ev.start.hour, ev.start.minute)
    }

    private fun rid(context: Context, name: String): Int =
        idCache.getOrPut(name) {
            context.resources.getIdentifier(name, "id", context.packageName).also {
                if (it == 0) Log.w(TAG, "widget id not found: $name")
            }
        }

    // ---------------------------------------------------------------- data

    private val DT_MD = DateTimeFormatter.ofPattern("M/d")

    /** 週 or 月に必要な週の anchor 一覧 */
    private fun weekAnchors(anchor: LocalDate, mode: String): List<LocalDate> =
        if (mode == MODE_WEEK) listOf(anchor)
        else {
            val firstSunday = anchor.withDayOfMonth(1).with(DayOfWeek.SUNDAY)
            val lastSunday = anchor.withDayOfMonth(anchor.lengthOfMonth()).with(DayOfWeek.SUNDAY)
            val list = mutableListOf<LocalDate>()
            var d = firstSunday
            while (!d.isAfter(lastSunday)) { list.add(d); d = d.plusWeeks(1) }
            list
        }

    /** 並列で週を取得。1件でも失敗したら null（前回キャッシュを維持） */
    private fun fetchAll(context: Context, anchor: LocalDate, mode: String): List<Ev>? {
        val weeks = weekAnchors(anchor, mode)
        val pool = Executors.newFixedThreadPool(minOf(3, weeks.size))
        return try {
            val futures = weeks.map { w ->
                pool.submit(Callable<JSONArray?> {
                    val body = httpGet("$BASE/api/events/weekly?date=$w") ?: return@Callable null
                    JSONObject(body).optJSONArray("week")
                })
            }
            val out = LinkedHashMap<String, Ev>()
            for (f in futures) {
                val week = f.get(12, TimeUnit.SECONDS) ?: return null
                for (i in 0 until week.length()) {
                    val evs = week.getJSONObject(i).optJSONArray("events") ?: continue
                    for (j in 0 until evs.length()) {
                        val e = evs.getJSONObject(j)
                        val ev = parseEv(e) ?: continue
                        out.putIfAbsent("${ev.start}|${ev.title}", ev)
                    }
                }
            }
            out.values.toList()
        } catch (e: Exception) {
            Log.w(TAG, "fetchAll failed", e)
            null
        } finally {
            pool.shutdown()
        }
    }

    private fun parseEv(e: JSONObject): Ev? {
        val raw = e.optString("start_time")
        if (raw.isBlank()) return null
        val start = try {
            if (raw.length >= 16) LocalDateTime.parse(raw.take(16))
            else LocalDate.parse(raw.take(10)).atStartOfDay()
        } catch (_: Exception) { return null }
        return Ev(
            start = start,
            title = e.optString("title"),
            url = e.optString("url").ifBlank { null },
            period = e.optString("time_period").ifBlank { null },
            thumb = toHttps(e.optString("thumbnail_url").ifBlank { null })
        )
    }

    private fun toHttps(u: String?): String? {
        if (u.isNullOrBlank()) return null
        val s = if (u.startsWith("http://")) "https://" + u.substring(7) else u
        return if (s.startsWith("https://")) s else null
    }

    private fun httpGet(url: String): String? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8_000; readTimeout = 8_000
            setRequestProperty("User-Agent", "MaiApp-Widget")
        }
        return try {
            if (conn.responseCode != 200) null else conn.inputStream.bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            Log.w(TAG, "httpGet failed: $url", e); null
        } finally { conn.disconnect() }
    }

    // ---------------------------------------------------------------- cache

    private fun saveCache(context: Context, evs: List<Ev>) {
        val arr = JSONArray()
        evs.forEach { ev ->
            arr.put(JSONObject().apply {
                put("start", ev.start.toString())
                put("title", ev.title)
                put("url", ev.url ?: "")
                put("period", ev.period ?: "")
                put("thumb", ev.thumb ?: "")
            })
        }
        val obj = JSONObject().apply {
            put("anchor", anchor(context).toString())
            put("events", arr)
        }
        prefs(context).edit().putString(KEY_CACHE, obj.toString()).apply()
    }

    /** @return (events, 取得時の anchor) */
    private fun loadCache(context: Context): Pair<List<Ev>, String?> {
        val s = prefs(context).getString(KEY_CACHE, null) ?: return emptyList<Ev>() to null
        val arr = try {
            val root = JSONObject(s)
            (root.optJSONArray("events") ?: JSONArray()) to (root.optString("anchor").ifBlank { null })
        } catch (_: Exception) {
            return emptyList<Ev>() to null
        }
        val list = mutableListOf<Ev>()
        for (i in 0 until arr.first.length()) {
            val o = arr.first.getJSONObject(i)
            val start = try {
                val raw = o.optString("start")
                if (raw.length >= 16) LocalDateTime.parse(raw.take(16))
                else LocalDate.parse(raw.take(10)).atStartOfDay()
            } catch (_: Exception) { continue }
            list.add(Ev(
                start = start,
                title = o.optString("title"),
                url = o.optString("url").ifBlank { null },
                period = o.optString("period").ifBlank { null },
                thumb = o.optString("thumb").ifBlank { null }
            ))
        }
        return list.sortedBy { it.start } to arr.second
    }

    // ---------------------------------------------------------------- thumbnails

    /** 表示に必要なサムネイルを先にダウンロード（描画はディスク読みのみに保つ） */
    private fun prefetchThumbs(context: Context, evs: List<Ev>) {
        val urls = evs.mapNotNull { it.thumb }.distinct().take(24)
        if (urls.isEmpty()) return
        val pool = Executors.newFixedThreadPool(4)
        try {
            val tasks = urls.map { u ->
                pool.submit(Callable {
                    ThumbCache.get(context, u, THUMB_W, THUMB_H)
                    true
                })
            }
            tasks.forEach { it.get(8, TimeUnit.SECONDS) }
        } catch (e: Exception) {
            Log.w(TAG, "thumb prefetch timeout", e)
        } finally {
            pool.shutdownNow()
        }
    }
}

/** リモートビュー用サムネイルのディスクキャッシュ（RemoteViews は URL 直接指定不可） */
internal object ThumbCache {
    private const val DIR = "widget_thumbs"
    private const val MAX_BYTES = 3_000_000

    /** ディスクキャッシュのみを見る。描画パスはネットワークを呼ばない（UI スレッド保護） */
    fun peek(context: Context, url: String, w: Int, h: Int): Bitmap? {
        if (url.isBlank()) return null
        val file = File(File(context.cacheDir, DIR), fileKey(url))
        if (!file.exists() || file.length() == 0L) return null
        return try {
            decode(file.readBytes(), w, h)
        } catch (e: Exception) { null }
    }

    /** ディスクが無ければダウンロードする（事前取得用） */
    fun get(context: Context, url: String, w: Int, h: Int): Bitmap? {
        if (url.isBlank()) return null
        val file = File(File(context.cacheDir, DIR), fileKey(url))
        try {
            if (file.exists() && file.length() > 0) {
                decode(file.readBytes(), w, h)?.let { return it }
                file.delete()
            }
            val bytes = download(url) ?: return null
            file.parentFile?.mkdirs()
            file.writeBytes(bytes)
            return decode(bytes, w, h)
        } catch (e: Exception) {
            return null
        }
    }

    private fun fileKey(url: String) = Integer.toHexString(url.hashCode()) + ".jpg"

    private fun download(url: String): ByteArray? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 6_000; readTimeout = 6_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "MaiApp-Widget")
        }
        return try {
            if (conn.responseCode != 200) return null
            val bytes = conn.inputStream.use { it.readBytes() }
            if (bytes.isEmpty() || bytes.size > MAX_BYTES) null else bytes
        } finally { conn.disconnect() }
    }

    private fun decode(bytes: ByteArray, targetW: Int, targetH: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (bounds.outWidth / (sample * 2) >= targetW &&
            bounds.outHeight / (sample * 2) >= targetH) sample *= 2

        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val src = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null

        // 中心切り抜き 1:1 ではなく、target 比率へ合わせる
        val scale = maxOf(targetW.toFloat() / src.width, targetH.toFloat() / src.height)
        if (scale >= 1f && src.width <= targetW * 2 && src.height <= targetH * 2) return src
        val sw = maxOf(1, (src.width * scale).toInt())
        val sh = maxOf(1, (src.height * scale).toInt())
        val scaled = Bitmap.createScaledBitmap(src, sw, sh, true)
        val x = (sw - targetW).coerceAtLeast(0) / 2
        val y = (sh - targetH).coerceAtLeast(0) / 2
        val w = minOf(targetW, sw)
        val h = minOf(targetH, sh)
        return if (scaled === src && sw == w && sh == h) src
        else Bitmap.createBitmap(scaled, x, y, w, h)
    }
}
