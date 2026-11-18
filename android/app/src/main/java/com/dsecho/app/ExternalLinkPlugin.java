package com.dsecho.app;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 用系统默认浏览器打开链接。
 *
 * 为什么需要：Capacitor 的 Browser.open 走的是 Custom Tabs，**必须有支持 Custom Tabs
 * 的浏览器**（通常是 Chrome）。用户把 Chrome 删了之后，点"前往创建密钥"会直接失败，
 * 但系统里明明还有别的浏览器。
 *
 * 这里改用最普通的 Intent(ACTION_VIEW)，由系统自己挑默认浏览器，
 * 不依赖任何特定浏览器。
 */
@CapacitorPlugin(name = "ExternalLink")
public class ExternalLinkPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少 url");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }
}
