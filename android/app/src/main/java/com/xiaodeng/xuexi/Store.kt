package com.xiaodeng.xuexi

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** 页面要存的东西（课程、进度、对话）：一个键一个文件，放在 App 自己的目录里 */
class Store(ctx: Context) {
    private val dir = File(ctx.filesDir, "kv").apply { mkdirs() }
    private fun file(k: String): File {
        val safe = k.replace(Regex("[^A-Za-z0-9_.:-]"), "_")
        val name = if (safe.length <= 80) safe else safe.take(40) + "_" + MessageDigest.getInstance("MD5").digest(k.toByteArray()).joinToString("") { "%02x".format(it) }
        return File(dir, name.replace(':', '~') + ".json")
    }
    @Synchronized fun get(k: String): String? = file(k).takeIf { it.exists() }?.readText()
    @Synchronized fun set(k: String, v: String) { val f = file(k); val t = File(f.path + ".tmp"); t.writeText(v); t.renameTo(f) }
    @Synchronized fun del(k: String) { file(k).delete() }
}

/** 模型和搜索的配置。默认值打包时从听会的 secrets 里带过来（assets/defaults.json），设置页能改 */
data class Cfg(val llmUrl: String, val llmModel: String, val llmKey: String, val dsKey: String, val trial: Boolean = false) {
    fun json(): String = JSONObject().put("llmUrl", llmUrl).put("llmModel", llmModel).put("llmKey", llmKey).put("dsKey", dsKey).toString()

    companion object {
        /** 实际调接口用的：自己填了模型就用自己的；没填、体验额度还没用完就用包里的试用 Key */
        fun load(ctx: Context): Cfg {
            val o = own(ctx)
            if (o.llmUrl.isNotBlank() && o.llmModel.isNotBlank() && o.llmKey.isNotBlank()) return o
            val t = Trial.creds(ctx) ?: return o
            if (Trial.spent(ctx)) return o
            return Cfg(t.llmUrl, t.llmModel, t.llmKey, t.dsKey, trial = true)
        }
        /** 用户自己填的（设置页显示这个，试用 Key 不露出来） */
        fun own(ctx: Context): Cfg {
            val d = runCatching { JSONObject(ctx.assets.open("defaults.json").bufferedReader().use { it.readText() }) }.getOrDefault(JSONObject())
            val p = ctx.getSharedPreferences("cfg", Context.MODE_PRIVATE)
            fun v(k: String) = p.getString(k, null) ?: d.optString(k, "")
            return Cfg(v("llmUrl"), v("llmModel"), v("llmKey"), v("dsKey"))
        }
        fun save(ctx: Context, j: JSONObject) {
            ctx.getSharedPreferences("cfg", Context.MODE_PRIVATE).edit().apply {
                listOf("llmUrl", "llmModel", "llmKey", "dsKey").forEach { k -> if (j.has(k)) putString(k, j.optString(k).trim()) }
            }.apply()
        }
    }
}
