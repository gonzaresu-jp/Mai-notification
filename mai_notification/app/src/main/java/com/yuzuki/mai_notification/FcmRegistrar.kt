package com.yuzuki.mai_notification

import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object FcmRegistrar {
    private const val TAG = "FCM"
    private const val REGISTER_URL = "https://koinoyamai.love/api/android/register"
    private const val SETTINGS_URL = "https://koinoyamai.love/api/android/settings"
    private const val TEST_URL = "https://koinoyamai.love/api/android/send-test"
    private const val PREFS = "fcm_prefs"
    private const val KEY_TOKEN = "fcm_token"
    private const val KEY_ENABLED = "notifications_enabled"

    private fun prefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    fun getClientId(context: Context): String {
        val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        val safeId = deviceId ?: "unknown"
        return "android-$safeId"
    }

    fun isNotificationsEnabled(context: Context): Boolean {
        return prefs(context).getBoolean(KEY_ENABLED, true)
    }

    fun setNotificationsEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun registerToken(context: Context, token: String) {
        prefs(context).edit().putString(KEY_TOKEN, token).apply()

        val clientId = getClientId(context)
        val deviceName = android.os.Build.MODEL ?: "Android"

        val payload = JSONObject().apply {
            put("clientId", clientId)
            put("fcmToken", token)
            put("deviceName", deviceName)
        }

        Thread {
            try {
                val conn = (URL(REGISTER_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 10000
                    readTimeout = 10000
                    doOutput = true
                }

                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                }

                val code = conn.responseCode
                Log.d(TAG, "register response=$code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "register failed", e)
            }
        }.start()
    }

    fun updateAllSettings(context: Context, enabled: Boolean) {
        setNotificationsEnabled(context, enabled)

        val token = prefs(context).getString(KEY_TOKEN, null)
        if (token == null) {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    Log.w(TAG, "token fetch failed", task.exception)
                    return@addOnCompleteListener
                }
                val newToken = task.result
                registerToken(context, newToken)
                sendSettings(newToken, buildSettings(enabled))
            }
            return
        }

        sendSettings(token, buildSettings(enabled))
    }

    fun updateSettings(context: Context, settingsJson: String) {
        val token = prefs(context).getString(KEY_TOKEN, null)
        if (token == null) {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    Log.w(TAG, "token fetch failed", task.exception)
                    return@addOnCompleteListener
                }
                val newToken = task.result
                registerToken(context, newToken)
                sendSettings(newToken, safeParseSettings(settingsJson))
            }
            return
        }

        sendSettings(token, safeParseSettings(settingsJson))
    }

    fun sendTest(context: Context) {
        val token = prefs(context).getString(KEY_TOKEN, null)
        if (token == null) {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    Log.w(TAG, "token fetch failed", task.exception)
                    return@addOnCompleteListener
                }
                val newToken = task.result
                registerToken(context, newToken)
                sendTestRequest(newToken)
            }
            return
        }

        sendTestRequest(token)
    }

    private fun safeParseSettings(settingsJson: String): JSONObject {
        return try {
            JSONObject(settingsJson)
        } catch (e: Exception) {
            Log.w(TAG, "settings parse failed", e)
            JSONObject()
        }
    }

    private fun buildSettings(enabled: Boolean): JSONObject {
        return JSONObject().apply {
            put("twitcasting", enabled)
            put("youtube", enabled)
            put("youtubeCommunity", enabled)
            put("fanbox", enabled)
            put("twitterMain", enabled)
            put("twitterSub", enabled)
            put("milestone", enabled)
            put("schedule", enabled)
            put("gipt", enabled)
            put("twitch", enabled)
            put("bilibili", enabled)
        }
    }

    private fun sendSettings(token: String, settings: JSONObject) {
        val payload = JSONObject().apply {
            put("fcmToken", token)
            put("settings", settings)
        }

        Thread {
            try {
                val conn = (URL(SETTINGS_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "PATCH"
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 10000
                    readTimeout = 10000
                    doOutput = true
                }

                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                }

                val code = conn.responseCode
                Log.d(TAG, "settings response=$code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "settings update failed", e)
            }
        }.start()
    }

    private fun sendTestRequest(token: String) {
        val payload = JSONObject().apply {
            put("fcmToken", token)
        }

        Thread {
            try {
                val conn = (URL(TEST_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 10000
                    readTimeout = 10000
                    doOutput = true
                }

                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                }

                val code = conn.responseCode
                Log.d(TAG, "test response=$code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "test send failed", e)
            }
        }.start()
    }
}
