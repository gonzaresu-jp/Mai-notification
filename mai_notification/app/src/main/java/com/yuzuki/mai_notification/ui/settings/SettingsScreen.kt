package com.yuzuki.mai_notification.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.yuzuki.mai_notification.data.ApiClient
import com.yuzuki.mai_notification.data.model.UserProfile
import com.yuzuki.mai_notification.ui.home.BoxLoading
import com.yuzuki.mai_notification.ui.home.formatSchedule
import com.yuzuki.mai_notification.ui.schedule.NeedLoginView
import retrofit2.HttpException

/**
 * 設定: アカウント情報（/api/user/me・要ログイン）。
 * Phase 1 では表示のみ。通知設定のトグル等は Phase 2。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onOpenLogin: () -> Unit) {
    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
    var profile by remember { mutableStateOf<UserProfile?>(null) }
    var needLogin by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }

    LaunchedEffect(reload) {
        profile = null
        error = null
        needLogin = false
        runCatching { ApiClient.service.me() }
            .onSuccess { profile = it }
            .onFailure { e ->
                if (e is HttpException && e.code() == 401) needLogin = true
                else error = e.message ?: e.javaClass.simpleName
            }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("設定") }) }
    ) { padding ->
        val mod = Modifier.padding(padding)
        when {
            needLogin -> NeedLoginView(mod, onOpenLogin)
            profile == null && error == null -> BoxLoading(mod)
            error != null -> BoxMessageSimple(error!!, mod)
            else -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Card(Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(1.dp)) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.AccountCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(
                                profile!!.name ?: profile!!.email ?: "（未設定）",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            profile!!.email?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                Card(Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("推し始めた日", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            when {
                                profile!!.oshiDays != null ->
                                    "${formatSchedule(profile!!.oshiSince, null)}（${profile!!.oshiDays}日目）"
                                else -> "未設定（Web の設定から登録できます）"
                            },
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                Card(Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("通知設定", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "通知のオン／オフや通知先の登録は、Web の設定画面から行えます。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        TextButton(onClick = { uriHandler.openUri("https://koinoyamai.love/") }) {
                            Text("設定画面を開く")
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun BoxMessageSimple(text: String, modifier: Modifier = Modifier) {
    androidx.compose.foundation.layout.Box(
        modifier = modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center
    ) { Text(text) }
}
