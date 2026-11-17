package com.dsecho.app;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

/**
 * DS Echo 的宿主 Activity。
 *
 * 这里只做一件事：让 WebView 铺满整块屏幕（edge-to-edge）。
 *
 * 为什么必须这么做：
 * 默认模式（decorFitsSystemWindows = true）下，状态栏与导航栏所占区域由 Activity 的
 * 窗口底色填充。本机实测状态栏 126px + 导航栏 63px，窗口底色是 AppCompat DayNight 主题
 * 的 #303030，而 App 自己背景是 #151517，于是长屏手机上下各出现一条灰边。
 *
 * 铺满之后，整块屏幕由网页背景绘制，色块断层消失；同时 Android WebView 会通过
 * CSS 的 env(safe-area-inset-top / -bottom) 上报系统栏高度（本机实测 36px / 18px，
 * 即 126/3.5 与 63/3.5），由 global.css 给 #root 留出对应内边距。
 *
 * 不要改成在原生里给状态栏设置颜色：那只是把灰边换成别的颜色，
 * 用户在 App 内单独切换深浅色时仍会不一致。
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
