package com.xiaodeng.xuexi

import android.content.Context
import android.util.Base64
import org.json.JSONObject

/**
 * 分享版的体验额度：包里带一把试用 Key（打包时混淆过，包里没有明文），新用户不用填 Key 就能建 1 门课、和导师聊 10 次。
 * 次数由页面报上来；这里另外按实际用量封顶（token、搜索、生图），防止有人绕过页面一直调。
 * 用完以后这台手机就不再用这把 Key，在设置里填自己的。
 */
object Trial {
    const val MAX_BUILDS = 1
    const val MAX_TURNS = 10
    private const val MAX_TOKENS = 400_000L
    private const val MAX_SEARCH = 15L
    private const val MAX_IMAGE = 2L
    private val SALT = "xuexi-bianlitie-2026".toByteArray()

    data class Creds(val llmUrl: String, val llmModel: String, val llmKey: String, val dsKey: String)

    fun creds(ctx: Context): Creds? = runCatching {
        val t = JSONObject(ctx.assets.open("defaults.json").bufferedReader().use { it.readText() }).optString("t")
        if (t.isBlank()) return null
        val b = Base64.decode(t, Base64.DEFAULT)
        for (i in b.indices) b[i] = (b[i].toInt() xor SALT[i % SALT.size].toInt()).toByte()
        val o = JSONObject(String(b, Charsets.UTF_8))
        Creds(o.optString("u"), o.optString("m"), o.optString("k"), o.optString("d"))
    }.getOrNull()

    private fun sp(ctx: Context) = ctx.getSharedPreferences("trial", Context.MODE_PRIVATE)
    private fun n(ctx: Context, k: String) = sp(ctx).getLong(k, 0)

    fun spent(ctx: Context): Boolean =
        n(ctx, "tokens") >= MAX_TOKENS || n(ctx, "search") >= MAX_SEARCH || n(ctx, "image") >= MAX_IMAGE ||
            (n(ctx, "builds") >= MAX_BUILDS && n(ctx, "turns") >= MAX_TURNS)

    @Synchronized fun add(ctx: Context, k: String, by: Long) { sp(ctx).edit().putLong(k, n(ctx, k) + by).apply() }

    fun info(ctx: Context): String = JSONObject()
        .put("has", creds(ctx) != null)
        .put("builds", n(ctx, "builds")).put("turns", n(ctx, "turns"))
        .put("maxBuilds", MAX_BUILDS).put("maxTurns", MAX_TURNS)
        .put("spent", spent(ctx)).toString()
}
