package com.xiaodeng.xuexi

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager

/**
 * 建课要跑几分钟：挂一个前台服务（通知栏一条「正在建课」），切到后台、锁屏时进程不被系统冻结或杀掉。
 * 建完就停。另外两个频道：建好了、建课停了的提醒。
 */
class KeepService : Service() {
    private var lock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        channels(this)
        val text = intent?.getStringExtra("text") ?: "正在建课"
        startForeground(1, Notification.Builder(this, CH_KEEP)
            .setSmallIcon(R.drawable.ic_stat).setContentTitle(text).setContentText("建好了会通知你")
            .setOngoing(true).setContentIntent(openApp(this)).build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        if (lock == null) lock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "xuexi:build").apply { acquire(30 * 60_000L) }
        return START_NOT_STICKY
    }

    // 从最近任务里划掉 App：页面里的建课已经停了，服务也跟着停，别留一条没用的通知
    override fun onTaskRemoved(rootIntent: Intent?) { stopSelf() }

    override fun onDestroy() {
        lock?.let { if (it.isHeld) it.release() }
        lock = null
        super.onDestroy()
    }

    companion object {
        const val CH_KEEP = "keep"
        const val CH_DONE = "done"

        fun channels(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CH_KEEP, "正在建课", NotificationManager.IMPORTANCE_LOW))
            nm.createNotificationChannel(NotificationChannel(CH_DONE, "建课完成", NotificationManager.IMPORTANCE_DEFAULT))
        }

        fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)

        fun notify(ctx: Context, title: String, text: String) {
            channels(ctx)
            ctx.getSystemService(NotificationManager::class.java).notify(2, Notification.Builder(ctx, CH_DONE)
                .setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(text)
                .setAutoCancel(true).setContentIntent(openApp(ctx)).build())
        }
    }
}
