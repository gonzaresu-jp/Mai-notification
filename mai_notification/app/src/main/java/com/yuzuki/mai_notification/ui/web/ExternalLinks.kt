package com.yuzuki.mai_notification.ui.web

import android.content.Context
import android.content.Intent
import android.net.Uri

/** 自サイト（*.honna-yuzuki.com / *.koinoyamai.love）は WebView 内のまま */
fun isOwnSite(uri: Uri): Boolean {
    val host = uri.host?.lowercase() ?: return false
    return host == "honna-yuzuki.com" || host.endsWith(".honna-yuzuki.com") ||
        host == "koinoyamai.love" || host.endsWith(".koinoyamai.love")
}

/** OAuth（Google / Discord）はアプリ内ブラウザのまま完結させる */
fun isAuthHost(host: String?): Boolean {
    val h = host?.lowercase() ?: return false
    return h == "accounts.google.com" || h == "discord.com" || h == "login.discord.com"
}

/** 外部は専用アプリ→ブラウザの順に委譲。開けなければ false（= 読み込みを中断せず WebView に任せる） */
fun openExternal(context: android.content.Context, uri: Uri): Boolean {
    val url = uri.toString()
    val isWeb = uri.scheme.equals("http", true) || uri.scheme.equals("https", true)
    val intent = try {
        if (url.startsWith("intent:", ignoreCase = true)) {
            Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
        } else {
            Intent(Intent.ACTION_VIEW, uri)
        }
    } catch (e: Exception) {
        return false
    }

    if (isWeb) {
        // まず専用アプリ（YouTube 等）で開く。ブラウザしか無い URL は例外になる
        try {
            context.startActivity(Intent(intent).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                flags = flags or Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER
            })
            return true
        } catch (_: Exception) {
        }
    }

    // ブラウザ（または選択ダイアログ）で開く
    return try {
        context.startActivity(intent)
        true
    } catch (e: Exception) {
        false
    }
}
