package com.dsecho.app;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.List;

/**
 * 应用内下载 APK 并拉起系统安装器。
 *
 * 为什么需要原生：WebView 里的 <a download> 只能把文件丢给浏览器/下载管理器，
 * 无法发起安装；安装必须由 App 用 Intent(ACTION_VIEW, apk) 触发，且文件要通过
 * FileProvider 授权给安装器（不能直接给 file:// 路径）。
 *
 * 限制（必须让用户知道）：Android 侧载安装一定会弹系统安装器，
 * 真正的"零点击静默安装"只有设备所有者/root 才能做到。
 *
 * 安全：下载完成后**校验 sha256**，不一致就删除并报错——镜像站是第三方，
 * 不能无条件信任它给的字节。
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    /** 镜像/直链按顺序尝试；任意一个成功即停止 */
    @PluginMethod
    public void install(PluginCall call) {
        String expected = call.getString("sha256", "").trim().toLowerCase();
        List<Object> urls;
        try {
            JSArray array = call.getArray("urls");
            urls = array == null ? List.of() : array.toList();
        } catch (Exception e) {
            call.reject("下载地址格式不正确");
            return;
        }
        if (urls.isEmpty() || expected.isEmpty()) {
            call.reject("缺少下载地址或校验值");
            return;
        }

        // 下载可能超过几秒，放到后台线程；结果通过 resolve/reject 回传
        new Thread(() -> {
            String lastError = "没有可用的下载地址";
            for (Object candidate : urls) {
                String url = String.valueOf(candidate);
                try {
                    File apk = download(url, expected);
                    if (apk != null) {
                        promptInstall(apk);
                        JSObject result = new JSObject();
                        result.put("installed", true);
                        call.resolve(result);
                        return;
                    }
                } catch (Exception e) {
                    lastError = e.getMessage() == null ? e.toString() : e.getMessage();
                }
            }
            call.reject(lastError);
        }).start();
    }

    /** 下载到缓存目录；sha256 不匹配返回 null（继续尝试下一个镜像） */
    private File download(String url, String expectedSha) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setInstanceFollowRedirects(true);
        connection.connect();
        if (connection.getResponseCode() / 100 != 2) {
            throw new Exception("HTTP " + connection.getResponseCode());
        }
        File target = new File(getContext().getCacheDir(), "dsecho-update.apk");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = connection.getInputStream();
             FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
                out.write(buffer, 0, read);
            }
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) {
            hex.append(String.format("%02x", b));
        }
        if (!hex.toString().equals(expectedSha)) {
            // 镜像不可信就丢弃，别让用户装上被替换的包
            target.delete();
            throw new Exception("校验失败（下载内容与公布的不一致）");
        }
        return target;
    }

    private void promptInstall(File apk) {
        Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
