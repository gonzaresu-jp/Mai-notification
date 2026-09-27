package com.yuzuki.mai_notification

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.appcompat.app.AlertDialog
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * アプリの更新確認（Windows 版の desktop.json と同じ方式）。
 *
 * サーバーの dl/android.json:
 *   { "versionCode": 2, "versionName": "1.1", "url": "https://.../mai-notification.apk", "notes": "..." }
 *
 * - 起動時に確認（6時間に1回まで）。新しい versionCode があればダイアログで案内する
 * - 「ダウンロード」はブラウザで APK の URL を開く（インストールは Android 標準の画面に任せる）
 * - 通信・解析に失敗しても何もしない（アプリの動作には影響させない）
 */
object UpdateChecker {
    private const val TAG = "MaiUpdate"
    private const val FEED_URL = "https://mai.honna-yuzuki.com/dl/android.json"
    private const val PREFS = "mai_update"
    private const val KEY_LAST_CHECK = "last_check_ms"
    private const val MIN_INTERVAL_MS = 6 * 60 * 60 * 1000L

    fun currentVersionCode(context: Context): Long {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
        else @Suppress("DEPRECATION") info.versionCode.toLong()
    }

    fun currentVersionName(context: Context): String =
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""

    fun checkOnLaunch(activity: Activity) {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(KEY_LAST_CHECK, 0L) < MIN_INTERVAL_MS) return
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()

        Thread {
            try {
                val conn = (URL("$FEED_URL?t=$now").openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 10_000
                    setRequestProperty("Cache-Control", "no-cache")
                }
                val body = try {
                    if (conn.responseCode != 200) return@Thread
                    conn.inputStream.bufferedReader().use { it.readText() }
                } finally {
                    conn.disconnect()
                }
                val feed = JSONObject(body)
                val latestCode = feed.optLong("versionCode", 0L)
                val latestName = feed.optString("versionName", "")
                val url = feed.optString("url", "")
                val notes = feed.optString("notes", "")
                val current = currentVersionCode(activity)
                Log.d(TAG, "current=$current latest=$latestCode")
                if (latestCode <= current || !url.startsWith("https://")) return@Thread

                activity.runOnUiThread {
                    if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                    val msg = buildString {
                        append("新しいバージョン v$latestName が利用できます（現在 v${currentVersionName(activity)}）。")
                        if (notes.isNotBlank()) append("\n\n").append(notes)
                    }
                    AlertDialog.Builder(activity)
                        .setTitle("アップデートがあります")
                        .setMessage(msg)
                        .setPositiveButton("ダウンロード") { _, _ ->
                            try {
                                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            } catch (e: Exception) {
                                Log.w(TAG, "open url failed", e)
                            }
                        }
                        .setNegativeButton("後で", null)
                        .show()
                }
            } catch (e: Exception) {
                Log.w(TAG, "update check failed", e)
            }
        }.start()
    }
}
