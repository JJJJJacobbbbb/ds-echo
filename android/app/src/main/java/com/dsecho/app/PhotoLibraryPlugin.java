package com.dsecho.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 最近照片：给附件菜单提供「一排快捷照片」。
 *
 * 为什么要原生：网页拿不到相册列表（`<input type="file">` 只能让用户自己翻）。
 * 官方 App 的交互是先看到最近几张、点一下就能发，所以这里直接查 MediaStore。
 *
 * 权限：Android 13+ 用 READ_MEDIA_IMAGES，12 及以下用 READ_EXTERNAL_STORAGE。
 * 未授权时 `recentImages` 直接 reject("permission-denied")，界面据此显示「开启相册权限」，
 * 而不是静默返回空列表——用户会以为相册里没照片。
 */
@CapacitorPlugin(name = "PhotoLibrary")
public class PhotoLibraryPlugin extends Plugin {

    private static final int REQUEST_CODE = 7311;
    /** 一次性返回多少张缩略图（横向滚动，20 张约 1.6MB 内存） */
    private static final int RECENT_LIMIT = 20;
    private static final int THUMB_SIZE = 480;

    private PluginCall pendingPermissionCall;

    /** 当前系统版本该申请哪个权限 */
    private String requiredPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? Manifest.permission.READ_MEDIA_IMAGES
                : Manifest.permission.READ_EXTERNAL_STORAGE;
    }

    private boolean hasAccess() {
        return getContext().checkSelfPermission(requiredPermission()) == PackageManager.PERMISSION_GRANTED;
    }

    /** 查询权限状态；不弹窗 */
    @PluginMethod
    public void checkAccess(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasAccess());
        call.resolve(result);
    }

    /** 请求权限：已授权直接返回，否则拉起系统弹窗，结果在 handleRequestPermissionsResult 里回传 */
    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (hasAccess()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (pendingPermissionCall != null) {
            pendingPermissionCall.reject("permission-busy");
        }
        pendingPermissionCall = call;
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{requiredPermission()},
                REQUEST_CODE
        );
    }

    @Override
    public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_CODE || pendingPermissionCall == null) {
            return;
        }
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        pendingPermissionCall.resolve(result);
        pendingPermissionCall = null;
    }

    /** 最近 N 张图片的缩略图（JPEG base64），按修改时间倒序 */
    @PluginMethod
    public void recentImages(PluginCall call) {
        if (!hasAccess()) {
            call.reject("permission-denied");
            return;
        }
        JSObject response = new JSObject();
        JSArray items = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        String[] projection = {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATE_ADDED
        };
        try (Cursor cursor = resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                MediaStore.Images.Media.DATE_ADDED + " DESC"
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                while (cursor.moveToNext() && items.length() < RECENT_LIMIT) {
                    long id = cursor.getLong(idColumn);
                    String name = cursor.getString(nameColumn);
                    String thumbnail = thumbnailOf(id);
                    if (thumbnail == null) {
                        continue;
                    }
                    JSObject item = new JSObject();
                    item.put("id", String.valueOf(id));
                    item.put("name", name == null ? "" : name);
                    item.put("thumbnail", thumbnail);
                    items.put(item);
                }
            }
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
            return;
        }
        response.put("items", items);
        call.resolve(response);
    }

    /** 取原图（点缩略图后上传用）；过大时按长边 2000 缩放，避免一次传几十 MB */
    @PluginMethod
    public void readImage(PluginCall call) {
        if (!hasAccess()) {
            call.reject("permission-denied");
            return;
        }
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("缺少 id");
            return;
        }
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
        try {
            byte[] bytes = readScaled(uri, 2000, 88);
            if (bytes == null) {
                call.reject("读取图片失败");
                return;
            }
            JSObject result = new JSObject();
            result.put("base64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
            result.put("mimeType", "image/jpeg");
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private String thumbnailOf(long id) {
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        try {
            byte[] bytes = readScaled(uri, THUMB_SIZE, 82);
            return bytes == null ? null : android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 按最大边长缩放读取。
     * 先只解边界拿原始尺寸，再按需 inSampleSize 采样——直接 decode 大图会 OOM。
     */
    private byte[] readScaled(Uri uri, int maxEdge, int quality) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (java.io.InputStream in = resolver.openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            return null;
        }

        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / sample > maxEdge * 2) {
            sample *= 2;
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap bitmap;
        try (java.io.InputStream in = resolver.openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(in, null, options);
        }
        if (bitmap == null) {
            return null;
        }

        int longEdge = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (longEdge > maxEdge) {
            float scale = (float) maxEdge / longEdge;
            Bitmap scaled = Bitmap.createScaledBitmap(
                    bitmap,
                    Math.max(1, Math.round(bitmap.getWidth() * scale)),
                    Math.max(1, Math.round(bitmap.getHeight() * scale)),
                    true
            );
            if (scaled != bitmap) {
                bitmap.recycle();
            }
            bitmap = scaled;
        }

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out);
        bitmap.recycle();
        return out.toByteArray();
    }
}
