package com.yuzuki.mai_notification.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// webui のテーマカラー（#B11E7C）に合わせる
val MaiPrimary = Color(0xFFB11E7C)
val MaiPrimaryDark = Color(0xFF8A145F)
val MaiOnPrimary = Color(0xFFFFFFFF)
val MaiSecondary = Color(0xFFF4A7CE)
val MaiBackgroundLight = Color(0xFFFFF7FB)
val MaiBackgroundDark = Color(0xFF140A10)

private val LightColors = lightColorScheme(
    primary = MaiPrimary,
    onPrimary = MaiOnPrimary,
    primaryContainer = Color(0xFFFFD9EC),
    onPrimaryContainer = Color(0xFF3E0021),
    secondary = Color(0xFF74566C),
    secondaryContainer = Color(0xFFFED7EF),
    background = MaiBackgroundLight,
    surface = Color(0xFFFFFBFF),
    surfaceVariant = Color(0xFFF2DDE6),
    error = Color(0xFFBA1A1A)
)

private val DarkColors = darkColorScheme(
    primary = MaiSecondary,
    onPrimary = Color(0xFF5B0131),
    primaryContainer = MaiPrimaryDark,
    onPrimaryContainer = Color(0xFFFFD9EC),
    secondary = Color(0xFFE2BDD6),
    secondaryContainer = Color(0xFF5B4156),
    background = MaiBackgroundDark,
    surface = Color(0xFF1B1017),
    surfaceVariant = Color(0xFF52434C),
    error = Color(0xFFFFB4AB)
)

@Composable
fun MaiTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content
    )
}
