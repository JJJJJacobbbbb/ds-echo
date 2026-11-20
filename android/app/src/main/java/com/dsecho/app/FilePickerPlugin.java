package com.dsecho.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 选文件：走系统文档界面（SAF）。
 *
 * 为什么不用网页的 `<input type="file">`：Capacitor 内部用 `ACTION_GET_CONTENT`，
 * 国产 ROM（vivo/小米等）会把它劫持到自家「文件管理」，界面和用户平时在浏览器里
 * 见到的「最近 / 下载 / 文档」三栏不一样。`ACTION_OPEN_DOCUMENT` 才是标准 SAF 界面。
 *
 * 返回文件内容（base64）而不是 uri：上传走 attachments.ts 的统一管线，
 * 需要真正的 File 对象（扩展名、MIME、大小都要参与校验）。
 */
@CapacitorPlugin(name = "FilePicker")
public class FilePickerPlugin extends Plugin {

    private static final int MAX_FILE_BYTES = 30 * 1024 * 1024;
    private static final int MAX_FILES = 20;

    /** 系统标准文档界面的包名（AOSP DocumentsUI）。 */
    private static final String DOCUMENTS_UI = "com.android.documentsui";

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        /*
         * 系统里通常有多个 App 能处理 OPEN_DOCUMENT（vivo 自带文件管理器、ZArchiver 等），
         * 默认点确认时会被这些第三方接管，界面和用户平时在浏览器里见到的不同。
         * 这里优先锁定 AOSP 的 DocumentsUI（就是 Chrome 用的那个「最近/下载」界面），
         * 设备上没有它时再交还给系统决定。
         */
        intent.setPackage(DOCUMENTS_UI);
        try {
            startActivityForResult(call, intent, "handlePick");
        } catch (Exception e) {
            // 设备上没有 DocumentsUI（或被裁剪）：退回系统默认选择器
            Intent fallback = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            fallback.addCategory(Intent.CATEGORY_OPENABLE);
            fallback.setType("*/*");
            fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            startActivityForResult(call, fallback, "handlePick");
        }
    }

    @ActivityCallback
    public void handlePick(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            // 用户取消：返回空数组，界面据此什么都不做
            JSObject empty = new JSObject();
            empty.put("files", new JSArray());
            call.resolve(empty);
            return;
        }

        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            int count = Math.min(data.getClipData().getItemCount(), MAX_FILES);
            for (int i = 0; i < count; i++) {
                uris.add(data.getClipData().getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        JSArray files = new JSArray();
        for (Uri uri : uris) {
            try {
                JSObject item = readUri(uri);
                if (item != null) {
                    files.put(item);
                }
            } catch (Exception e) {
                // 单个文件读失败不影响其余文件
            }
        }
        JSObject response = new JSObject();
        response.put("files", files);
        call.resolve(response);
    }

    private JSObject readUri(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        String name = null;
        long size = -1;
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0) {
                    name = cursor.getString(nameIndex);
                }
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                    size = cursor.getLong(sizeIndex);
                }
            }
        }
        if (size > MAX_FILE_BYTES) {
            return null;
        }

        String mimeType = resolver.getType(uri);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            byte[] chunk = new byte[64 * 1024];
            int read;
            int total = 0;
            while ((read = in.read(chunk)) > 0) {
                total += read;
                if (total > MAX_FILE_BYTES) {
                    return null;
                }
                buffer.write(chunk, 0, read);
            }
        }

        JSObject item = new JSObject();
        item.put("name", name == null ? "file" : name);
        item.put("mimeType", mimeType == null ? "application/octet-stream" : mimeType);
        item.put("base64", android.util.Base64.encodeToString(buffer.toByteArray(), android.util.Base64.NO_WRAP));
        return item;
    }
}
