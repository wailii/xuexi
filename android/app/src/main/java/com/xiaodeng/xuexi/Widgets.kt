package com.xiaodeng.xuexi

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.util.Base64
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

/**
 * 桌面小组件：样子由页面画好（PNG，和首页同一套便利贴），这里只负责存下来、贴到桌面上。
 * 页面每次刷新首页都会送来四张：小的、宽的，各自再一张「新的一天」。过了零点还没打开 App，就换成「新的一天」，不显示昨天的数。
 */
object Widgets {
    private fun dir(ctx: Context) = File(ctx.filesDir, "widget").apply { mkdirs() }

    fun save(ctx: Context, json: String) {
        val o = JSONObject(json)
        for (k in listOf("small", "wide", "smallNew", "wideNew")) {
            val b64 = o.optString(k).substringAfter("base64,", "")
            if (b64.isNotEmpty()) File(dir(ctx), "$k.png").writeBytes(Base64.decode(b64, Base64.DEFAULT))
        }
        File(dir(ctx), "date").writeText(o.optString("date"))
        update(ctx)
    }

    fun update(ctx: Context) {
        val fresh = runCatching { File(dir(ctx), "date").readText() }.getOrNull() == LocalDate.now().toString()
        val m = AppWidgetManager.getInstance(ctx)
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        for ((cls, name, preview) in listOf(
            Triple(WidgetSmall::class.java, "small", R.drawable.widget_preview_small),
            Triple(WidgetWide::class.java, "wide", R.drawable.widget_preview_wide),
        )) {
            val ids = m.getAppWidgetIds(ComponentName(ctx, cls))
            if (ids.isEmpty()) continue
            val rv = RemoteViews(ctx.packageName, R.layout.widget)
            val bmp = BitmapFactory.decodeFile(File(dir(ctx), if (fresh) "$name.png" else "${name}New.png").path)
            if (bmp != null) rv.setImageViewBitmap(R.id.img, bmp) else rv.setImageViewResource(R.id.img, preview)
            rv.setOnClickPendingIntent(R.id.img, open)
            m.updateAppWidget(ids, rv)
        }
    }
}

class WidgetSmall : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) = Widgets.update(c)
}

class WidgetWide : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) = Widgets.update(c)
}
