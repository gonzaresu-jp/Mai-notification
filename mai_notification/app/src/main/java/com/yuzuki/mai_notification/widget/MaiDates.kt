package com.yuzuki.mai_notification.widget

import android.content.Context
import java.time.LocalDate
import java.time.Period
import java.time.temporal.ChronoUnit

/** Web の count-days.js と同じ記念日（端末のローカル日付で計算） */
object MaiDates {
    val DEBUT: LocalDate = LocalDate.of(2021, 3, 21)
    const val BIRTHDAY_M = 1; const val BIRTHDAY_D = 7
    const val ANNIV_M = 3; const val ANNIV_D = 21
    const val LOVE_M = 8; const val LOVE_D = 17

    private const val PREFS = "mai_widget"
    private const val KEY_OSHI = "oshi_start_date"

    fun today(): LocalDate = LocalDate.now()

    fun daysSince(from: LocalDate, now: LocalDate = today()): Long =
        maxOf(0L, ChronoUnit.DAYS.between(from, now))

    fun yearsMonths(from: LocalDate, now: LocalDate = today()): String {
        if (now.isBefore(from)) return "0年0ヶ月"
        val p = Period.between(from, now)
        return "${p.years}年${p.months}ヶ月"
    }

    /** 次の month/day までの日数（当日は 0） */
    fun daysUntil(month: Int, day: Int, now: LocalDate = today()): Long {
        var next = LocalDate.of(now.year, month, day)
        if (next.isBefore(now)) next = next.plusYears(1)
        return ChronoUnit.DAYS.between(now, next)
    }

    /** Web の「推し始めた日」（localStorage maistart_date）をブリッジ経由で保存したもの */
    fun oshiStart(context: Context): LocalDate? {
        val s = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_OSHI, null) ?: return null
        return try { LocalDate.parse(s) } catch (e: Exception) { null }
    }

    /** 値が変わった時だけ true */
    fun setOshiStart(context: Context, ymd: String?): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val v = ymd?.trim()?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) }
        if (prefs.getString(KEY_OSHI, null) == v) return false
        prefs.edit().apply { if (v == null) remove(KEY_OSHI) else putString(KEY_OSHI, v) }.apply()
        return true
    }
}
