package com.yuzuki.mai_notification

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * アプリの更新確認とアプリ内ダウンロード（Windows 版の desktop.json と同じ方式）。
 *
 * サーバーの dl/android.json:
 *   { "versionCode": 6, "versionName": "1.5", "url": "https://.../mai-notification.apk", "notes": "..." }
 *
 * - 起動時に確認（6時間に1回まで）。新しい versionCode があればダイアログで案内する
 * - 「インストール」でアプリ内に APK をダウンロードし、そのまま標準インストーラを起動する
 *   （Android のセキュリティ仕様により、最後の確認画面はユーザー操作が必須）
 * - Android 8.0+ は初回だけ「このアプリからの不明なアプリのインストール許可」が必要。
 *   未許可なら設定画面へ誘導し、確認間隔をリセットして復帰後に再案内する
 * - ダウンロードに失敗した時はブラウザで開く従来方式へフォールバック
 * - 通信・解析に失敗しても何もしない（アプリの動作には影響させない）
 */
object UpdateChecker {
    private const val TAG = "MaiUpdate"
    private const val FEED_URL = "https://koinoyamai.love/dl/android.json"
    private const val PREFS = "mai_update"
    private const val KEY_LAST_CHECK = "last_check_ms"
    private const val MIN_INTERVAL_MS = 6 * 60 * 60 * 1000L
    private const val FILE_PROVIDER_SUFFIX = ".fileprovider"
    private const val APK_NAME = "mai-notification.apk"
    private const val MIN_APK_BYTES = 100_000L

    @Volatile
    private var downloading = false

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
                    if (downloading) return@runOnUiThread
                    val msg = buildString {
                        append("新しいバージョン v$latestName が利用できます（現在 v${currentVersionName(activity)}）。")
                        if (notes.isNotBlank()) append("\n\n").append(notes)
                    }
                    var dialog: AlertDialog? = null
                    dialog = AlertDialog.Builder(activity)
                        .setTitle("アップデートがあります")
                        .setMessage(msg)
                        .setPositiveButton("インストール") { _, _ ->
                            onInstallClicked(activity, url, dialog)
                        }
                        .setNegativeButton("後で", null)
                        .show()
                }
            } catch (e: Exception) {
                Log.w(TAG, "update check failed", e)
            }
        }.start()
    }

    // ---------------------------------------------------------------- install

    private fun onInstallClicked(activity: Activity, url: String, dialog: AlertDialog?) {
        if (activity.isFinishing || activity.isDestroyed || downloading) return

        // Android 8.0+ : このアプリ単位での「不明なアプリのインストール許可」
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            // 設定から戻った直後にすぐ再案内できるよう確認間隔をリセット
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().remove(KEY_LAST_CHECK).apply()
            try { dialog?.dismiss() } catch (_: Exception) {}
            try {
                activity.startActivity(Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}")
                ))
                AlertDialog.Builder(activity)
                    .setTitle("許可が必要です")
                    .setMessage("「このアプリ」のスイッチをオンにしてから、アプリに戻ってください。戻るともう一度アップデート案内が出ます。")
                    .setPositiveButton("OK", null)
                    .show()
            } catch (e: Exception) {
                Log.w(TAG, "open install permission settings failed", e)
            }
            return
        }

        try { dialog?.dismiss() } catch (_: Exception) {}
        startDownload(activity, url)
    }

    private fun startDownload(activity: Activity, url: String) {
        if (downloading) return
        downloading = true

        val progress = AlertDialog.Builder(activity)
            .setTitle("アップデート")
            .setMessage("ダウンロード中…")
            .setCancelable(false)
            .show()

        Thread {
            var file: File? = null
            var error: String? = null
            try {
                file = downloadApk(activity, url)
                if (file == null) error = "ダウンロードに失敗しました。"
            } catch (e: Exception) {
                Log.w(TAG, "download failed", e)
                error = "通信エラーが発生しました。"
            }
            activity.runOnUiThread {
                downloading = false
                try { progress.dismiss() } catch (_: Exception) {}
                if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                if (file != null) installApk(activity, file, url)
                else fallbackToBrowser(activity, url, error)
            }
        }.start()
    }

    /** アプリ専用領域へダウンロード（ストレージ権限は不要） */
    private fun downloadApk(context: Context, url: String): File? {
        val dir = context.getExternalFilesDir("updates") ?: File(context.filesDir, "updates")
        if (!dir.exists() && !dir.mkdirs()) return null
        val dest = File(dir, APK_NAME)
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            setRequestProperty("Cache-Control", "no-cache")
        }
        return try {
            if (conn.responseCode != 200) return null
            conn.inputStream.use { ins ->
                FileOutputStream(dest).use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                    }
                    out.fd.sync()
                }
            }
            if (dest.length() < MIN_APK_BYTES) { dest.delete(); null } else dest
        } finally {
            conn.disconnect()
        }
    }

    private fun installApk(activity: Activity, file: File, url: String) {
        try {
            val uri = FileProvider.getUriForFile(
                activity, activity.packageName + FILE_PROVIDER_SUFFIX, file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "installer launch failed", e)
            fallbackToBrowser(activity, url, "インストール画面を開けませんでした。")
        }
    }

    private fun fallbackToBrowser(activity: Activity, url: String, reason: String?) {
        if (activity.isFinishing || activity.isDestroyed) return
        AlertDialog.Builder(activity)
            .setTitle("アップデート")
            .setMessage((reason?.let { "$it\n\n" } ?: "") +
                "ブラウザでダウンロードします。ダウンロードが終わったら、通知またはファイル一覧から開いてください。")
            .setPositiveButton("ブラウザで開く") { _, _ ->
                try { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                catch (e: Exception) { Log.w(TAG, "open url failed", e) }
            }
            .setNegativeButton("キャンセル", null)
            .show()
    }
}
