package com.xiaodeng.xuexi

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.JsResult
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 外壳：页面在 assets/www（web/ 那一套），这里只做网页做不了的事——
 * 调模型、联网搜、存东西、通知、建课时保活、打开链接。
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var store: Store
    private val io = Executors.newFixedThreadPool(4)
    private var top = 0f
    private var bottom = 0f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        window.setDecorFitsSystemWindows(false)
        web = WebView(this)
        web.setBackgroundColor(0xFFFFFFFF.toInt())
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            textZoom = 100
        }
        web.addJavascriptInterface(Bridge(), "AndroidBridge")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) = pushInsets()
            override fun shouldOverrideUrlLoading(view: WebView, req: android.webkit.WebResourceRequest): Boolean {
                if (req.url.scheme?.startsWith("http") == true) { open(req.url.toString()); return true }
                return false
            }
            // 页面进程被系统回收（建课切后台时容易发生）：重建页面，建课进度每步都存了，会接着建
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean { recreate(); return true }
        }
        // 页面里的「确认」弹窗：WebView 默认不弹，直接当取消
        web.webChromeClient = object : WebChromeClient() {
            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton("确定") { _, _ -> result.confirm() }
                    .setNegativeButton("取消") { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }
            override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message).setPositiveButton("好") { _, _ -> result.confirm() }.setOnCancelListener { result.confirm() }.show()
                return true
            }
        }
        web.setOnApplyWindowInsetsListener { v, insets ->
            val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            val d = resources.displayMetrics.density
            top = b.top / d
            bottom = maxOf(b.bottom, ime.bottom) / d
            pushInsets()
            v.onApplyWindowInsets(insets)
        }
        setContentView(web)
        web.loadUrl("file:///android_asset/www/index.html")
        if (Build.VERSION.SDK_INT >= 33) onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
    }

    private fun pushInsets() = js("window.__insets && __insets($top, $bottom)")
    private fun js(code: String) = runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(code, null) }
    private fun reply(id: String, ok: Boolean, payload: String) = js("__native(${JSONObject.quote(id)}, $ok, ${JSONObject.quote(payload)})")
    private fun goBack() = web.evaluateJavascript("window.__back ? window.__back() : false") { if (it != "true") moveTaskToBack(true) }
    private fun open(u: String) = runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) }

    @Deprecated("没有新返回手势的系统走这里")
    override fun onBackPressed() = goBack()

    inner class Bridge {
        @JavascriptInterface fun llm(id: String, body: String) = io.execute {
            try {
                val cfg = Cfg.load(this@MainActivity)
                reply(id, true, Net.llm(cfg, JSONObject(body), null) { n -> if (cfg.trial) Trial.add(this@MainActivity, "tokens", n) })
            } catch (e: Exception) { reply(id, false, e.message ?: "出错了") }
        }
        @JavascriptInterface fun llmStream(id: String, body: String) = io.execute {
            var last = 0L
            try {
                val cfg = Cfg.load(this@MainActivity)
                val out = Net.llm(cfg, JSONObject(body), { all ->
                    val now = System.currentTimeMillis()
                    if (now - last > 150) { last = now; js("__native_delta(${JSONObject.quote(id)}, ${JSONObject.quote(all)})") }
                }) { n -> if (cfg.trial) Trial.add(this@MainActivity, "tokens", n) }
                reply(id, true, out)
            } catch (e: Exception) { reply(id, false, e.message ?: "出错了") }
        }
        @JavascriptInterface fun search(id: String, q: String) = io.execute {
            try {
                val cfg = Cfg.load(this@MainActivity)
                if (cfg.trial) Trial.add(this@MainActivity, "search", 1)
                reply(id, true, Net.search(cfg, q))
            } catch (e: Exception) { reply(id, false, e.message ?: "出错了") }
        }
        @JavascriptInterface fun image(id: String, prompt: String, neg: String) = io.execute {
            try {
                val cfg = Cfg.load(this@MainActivity)
                if (cfg.trial) Trial.add(this@MainActivity, "image", 1)
                reply(id, true, Net.image(cfg, prompt, neg))
            } catch (e: Exception) { reply(id, false, e.message ?: "出错了") }
        }
        @JavascriptInterface fun widget(json: String) = io.execute { runCatching { Widgets.save(this@MainActivity, json) } }
        @JavascriptInterface fun get(k: String): String? = store.get(k)
        @JavascriptInterface fun set(k: String, v: String) = store.set(k, v)
        @JavascriptInterface fun del(k: String) = store.del(k)
        @JavascriptInterface fun cfgGet(): String = Cfg.own(this@MainActivity).json()
        /** 体验额度：还剩几次、用完没有；trialUse 由页面在开始建课、导师每说一轮时报一次 */
        @JavascriptInterface fun trialInfo(): String = Trial.info(this@MainActivity)
        @JavascriptInterface fun trialUse(kind: String): String {
            if (Cfg.load(this@MainActivity).trial) Trial.add(this@MainActivity, if (kind == "build") "builds" else "turns", 1)
            return Trial.info(this@MainActivity)
        }
        @JavascriptInterface fun cfgSet(json: String) = Cfg.save(this@MainActivity, JSONObject(json))
        @JavascriptInterface fun openUrl(u: String) { runOnUiThread { open(u) } }
        @JavascriptInterface fun notify(title: String, text: String) = KeepService.notify(this@MainActivity, title, text)
        @JavascriptInterface fun keepAlive(on: Boolean, text: String) = runOnUiThread {
            if (on) {
                if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
                startForegroundService(Intent(this@MainActivity, KeepService::class.java).putExtra("text", text))
            } else stopService(Intent(this@MainActivity, KeepService::class.java))
        }
        /** vivo 切到后台几秒就冻住进程，前台服务也拦不住；用户在「后台耗电管理」设成允许后台耗电后会进这张白名单 */
        @JavascriptInterface fun bgAllowed(): Boolean =
            getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        /** vivo 的「后台耗电管理」列表页不让外部直接打开，先到「电池」页；别家手机弹系统的「允许在后台运行」 */
        @JavascriptInterface fun openBg() = runOnUiThread {
            val pkg = Uri.parse("package:$packageName")
            val tries = buildList {
                if (Build.MANUFACTURER.equals("vivo", true)) add(Intent(Intent.ACTION_POWER_USAGE_SUMMARY))
                add(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg))
                add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
            }
            tries.firstOrNull { runCatching { startActivity(it) }.isSuccess }
        }
        @JavascriptInterface fun vibrate(ms: Int) {
            getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createOneShot(ms.toLong(), 60))
        }
    }
}
