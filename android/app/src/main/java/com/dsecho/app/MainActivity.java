package com.dsecho.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

/**
 * 主 Activity：edge-to-edge + 把系统栏高度注入 WebView。
 *
 * 为什么要在原生侧注入，而不是只用 CSS 的 env(safe-area-inset-*)：
 * 真机上（vivo V2309A / Android 16 / WebView 157）env(safe-area-inset-top) 实测只报 19px，
 * 而状态栏实际是 36px —— 弹窗会压到状态栏、底部被手势条盖住。
 * 系统栏的真实 inset 只有原生拿得到，所以这里读 WindowInsets 再写成 CSS 变量：
 *
 *   --dsecho-safe-top    状态栏高度（px）
 *   --dsecho-safe-bottom 导航栏/手势条高度（px）
 *
 * CSS 侧仍是 env() 作为兜底（iOS/浏览器），两者同时存在时以本类注入的内联样式为准。
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 让页面铺到状态栏/导航栏下方，inset 由本类负责转成 CSS 变量
        // 应用内更新用：下载 APK 并拉起系统安装器
        registerPlugin(ApkInstallerPlugin.class);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applyInsetsToWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        // 页面重载会丢掉内联样式；回到前台时重新请求一次 inset，触发下面的监听器
        WebView webView = webView();
        if (webView != null) {
            webView.requestApplyInsets();
        }
    }

    private WebView webView() {
        return getBridge() != null ? getBridge().getWebView() : null;
    }

    private void applyInsetsToWebView() {
        WebView webView = webView();
        if (webView == null) {
            return;
        }
        final float density = getResources().getDisplayMetrics().density;
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            // 除以 density 换算成 CSS px，与前端使用的单位一致
            String top = String.format(Locale.US, "%.1f", bars.top / density);
            String bottom = String.format(Locale.US, "%.1f", bars.bottom / density);
            String script = "(function(){var r=document.documentElement;"
                    + "r.style.setProperty('--dsecho-safe-top','" + top + "px');"
                    + "r.style.setProperty('--dsecho-safe-bottom','" + bottom + "px');})()";
            webView.evaluateJavascript(script, null);
            return windowInsets;
        });
        webView.requestApplyInsets();
    }
}
