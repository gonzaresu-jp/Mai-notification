package com.yuzuki.mai_notification.ui.schedule

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
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
import com.yuzuki.mai_notification.data.model.UserSchedule
import com.yuzuki.mai_notification.ui.home.BoxLoading
import com.yuzuki.mai_notification.ui.home.BoxMessage
import com.yuzuki.mai_notification.ui.home.formatSchedule
import retrofit2.HttpException

private const val SITE_URL = "https://koinoyamai.love/"

/** 私の予定（/api/user/schedules・要ログイン）。未ログインなら Web のログインフローへ。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(onOpenLogin: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    var schedules by remember { mutableStateOf<List<UserSchedule>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var needLogin by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }

    LaunchedEffect(reload) {
        schedules = null
        error = null
        needLogin = false
        runCatching { ApiClient.service.schedules() }
            .onSuccess { schedules = it }
            .onFailure { e ->
                if (e is HttpException && e.code() == 401) {
                    needLogin = true
                } else {
                    error = e.message ?: e.javaClass.simpleName
                }
            }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("私の予定") }) }
    ) { padding ->
        val mod = Modifier.padding(padding)
        when {
            needLogin -> NeedLoginView(mod, onOpenLogin)
            schedules == null && error == null -> BoxLoading(mod)
            error != null -> BoxMessage(error!!, mod)
            schedules!!.isEmpty() -> BoxMessage("登録された予定はありません", mod)
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(schedules!!) { sc ->
                    Card(
                        Modifier
                            .fillMaxWidth()
                            .clickable {
                                (sc.eventUrl ?: sc.url)?.takeIf { it.startsWith("http") }
                                    ?.let { uriHandler.openUri(it) }
                            },
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CalendarMonth,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    sc.title ?: sc.eventTitle ?: "(無題)",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    formatSchedule(sc.startTime ?: sc.scheduledAt, null),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                sc.note?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        it,
                                        style = MaterialTheme.typography.bodySmall,
                                        maxLines = 3
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun NeedLoginView(modifier: Modifier = Modifier, onOpenLogin: () -> Unit) {
    androidx.compose.foundation.layout.Box(
        modifier = modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("この機能はログインが必要です", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                "アプリ内ブラウザでログインすると\nこちらに予定が表示されます",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            TextButton(onClick = onOpenLogin) { Text("ブラウザでログインする") }
        }
    }
}
