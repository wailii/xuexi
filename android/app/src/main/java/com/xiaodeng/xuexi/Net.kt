package com.xiaodeng.xuexi

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** 调模型（OpenAI 兼容的 /chat/completions）和联网搜（百炼千问带搜索）。都在后台线程里调。 */
object Net {
    class NetError(msg: String) : IOException(msg)

    private fun open(url: String, key: String, timeout: Int): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20_000
            readTimeout = timeout
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (key.isNotBlank()) setRequestProperty("Authorization", "Bearer ${key.trim()}")
        }

    private fun HttpURLConnection.fail(): Nothing {
        val code = responseCode
        val s = errorStream?.bufferedReader()?.use { it.readText() } ?: ""
        val msg = runCatching { JSONObject(s).let { it.optJSONObject("error")?.optString("message")?.ifBlank { null } ?: it.optString("message") } }.getOrNull()?.ifBlank { null } ?: s.take(160)
        throw NetError(
            when (code) {
                401, 403 -> "Key 不对或没权限（$code）：$msg"
                404 -> "地址或模型名不对（404）：$msg"
                429 -> "请求太多或额度用完了（429）：$msg"
                else -> "接口报错（$code）：$msg"
            }
        )
    }

    private fun <T> net(block: () -> T): T = try {
        block()
    } catch (e: NetError) {
        throw e
    } catch (e: java.net.SocketTimeoutException) {
        throw NetError("等太久没回应，检查网络后重试")
    } catch (e: java.net.UnknownHostException) {
        throw NetError("连不上网络，检查一下手机网络")
    } catch (e: IOException) {
        throw NetError("连不上：${e.message ?: "网络错误"}")
    }

    /**
     * 流式接收，攒成整段返回。明着给输出上限（有的网关默认很小，长 JSON 会写一半断掉），关掉思考（快很多）。
     * 接口不认这些参数（400）就去掉再试一次。
     */
    fun llm(cfg: Cfg, req: JSONObject, onDelta: ((String) -> Unit)? = null, onUsage: ((Long) -> Unit)? = null): String = net {
        if (cfg.llmUrl.isBlank() || cfg.llmModel.isBlank()) throw NetError("还没配模型：到设置里填")
        try { llmRaw(cfg, req, false, onDelta, onUsage) } catch (e: NetError) {
            if (e.message?.contains("（400）") == true) llmRaw(cfg, req, true, onDelta, onUsage) else throw e
        } catch (e: java.net.SocketTimeoutException) { llmRaw(cfg, req, false, onDelta, onUsage) }
    }

    private fun llmRaw(cfg: Cfg, req: JSONObject, plain: Boolean, onDelta: ((String) -> Unit)?, onUsage: ((Long) -> Unit)?): String {
        val url = cfg.llmUrl.trim().trimEnd('/').removeSuffix("/chat/completions") + "/chat/completions"
        val c = open(url, cfg.llmKey, 240_000)
        c.setRequestProperty("Accept", "text/event-stream")
        c.setRequestProperty("Accept-Encoding", "identity")
        val body = JSONObject().put("model", cfg.llmModel.trim()).put("stream", true).put("messages", req.getJSONArray("messages"))
        if (!plain) {
            body.put("max_tokens", req.optInt("maxTokens", 8000))
            body.put("thinking", JSONObject().put("type", "disabled"))
            body.put("chat_template_kwargs", JSONObject().put("enable_thinking", false))
            if (req.optBoolean("json")) body.put("response_format", JSONObject().put("type", "json_object"))
            body.put("stream_options", JSONObject().put("include_usage", true))
        }
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        if (c.responseCode !in 200..299) c.fail()
        val sb = StringBuilder()
        if (c.contentType?.contains("event-stream") != true) {
            val o = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
            o.optJSONObject("usage")?.let { onUsage?.invoke(it.optLong("total_tokens")) }
            return o.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content") ?: ""
        }
        c.inputStream.bufferedReader().useLines { lines ->
            for (raw in lines) {
                val line = raw.trim()
                if (!line.startsWith("data:")) continue
                val data = line.removePrefix("data:").trim()
                if (data == "[DONE]") break
                val o = runCatching { JSONObject(data) }.getOrNull() ?: continue
                o.optJSONObject("error")?.let { throw NetError("模型报错：${it.optString("message")}") }
                o.optJSONObject("usage")?.let { onUsage?.invoke(it.optLong("total_tokens")) }
                val d = o.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("delta") ?: continue
                if (!d.isNull("content")) { sb.append(d.optString("content")); onDelta?.invoke(sb.toString()) }
            }
        }
        val out = sb.toString().replace(Regex("(?s)<think>.*?(</think>|$)"), "").trim()
        if (out.isBlank()) throw NetError("模型没返回内容")
        return out
    }

    /** 百炼千问强制联网搜一次：返回它的总结和搜到的网页（标题、链接、网站） */
    fun search(cfg: Cfg, q: String): String = net {
        if (cfg.dsKey.isBlank()) throw NetError("还没配百炼 Key：到设置里填，联网搜索要用")
        val body = JSONObject()
            .put("model", "qwen-plus")
            .put("input", JSONObject().put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", q))))
            .put("parameters", JSONObject().put("result_format", "message").put("enable_search", true).put("max_tokens", 1200)
                .put("search_options", JSONObject().put("forced_search", true).put("enable_source", true).put("search_strategy", "pro")))
        val c = open("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", cfg.dsKey, 120_000)
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        if (c.responseCode !in 200..299) c.fail()
        val o = JSONObject(c.inputStream.bufferedReader().use { it.readText() }).optJSONObject("output") ?: JSONObject()
        val res = JSONArray()
        o.optJSONObject("search_info")?.optJSONArray("search_results")?.let { a ->
            for (i in 0 until a.length()) {
                val r = a.optJSONObject(i) ?: continue
                res.put(JSONObject().put("title", r.optString("title")).put("url", r.optString("url")).put("site", r.optString("site_name")))
            }
        }
        val text = o.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content") ?: ""
        JSONObject().put("text", text).put("results", res).toString()
    }

    /** 百炼生一张课程封面：qwen-image-3.0，下载后缩成 900 宽的 JPEG，回 data URL（页面直接存、直接显示） */
    fun image(cfg: Cfg, prompt: String, neg: String): String = net {
        if (cfg.dsKey.isBlank()) throw NetError("还没配百炼 Key")
        val body = JSONObject()
            .put("model", "qwen-image-3.0")
            .put("input", JSONObject().put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", JSONArray().put(JSONObject().put("text", prompt))))))
            .put("parameters", JSONObject().put("negative_prompt", neg).put("size", "1472*1140").put("watermark", false).put("prompt_extend", false))
        val c = open("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", cfg.dsKey, 180_000)
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        if (c.responseCode !in 200..299) c.fail()
        val o = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
        val url = o.optJSONObject("output")?.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")
            ?.optJSONArray("content")?.optJSONObject(0)?.optString("image")?.ifBlank { null } ?: throw NetError("没生成出图")
        val bytes = (URL(url).openConnection() as HttpURLConnection).apply { connectTimeout = 20_000; readTimeout = 60_000 }.inputStream.use { it.readBytes() }
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: throw NetError("图片坏了")
        val small = Bitmap.createScaledBitmap(bmp, 900, bmp.height * 900 / bmp.width, true)
        val out = ByteArrayOutputStream()
        small.compress(Bitmap.CompressFormat.JPEG, 82, out)
        "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
}
