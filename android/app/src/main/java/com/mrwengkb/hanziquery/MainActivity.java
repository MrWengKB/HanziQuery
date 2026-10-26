package com.mrwengkb.hanziquery;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 离线版：网页文件打包在 assets/www 里，通过 WebViewAssetLoader 以 https 虚拟域名加载，
 * 这样网页里的 fetch('hanzilist.csv') 和字体文件都能正常读取，无需联网。
 *
 * 检查更新：启动时如果有网络，会查询 GitHub Releases 的 apk-latest，
 * 发现更新的构建编号就弹窗提示下载；没网或出错时静默跳过，不影响使用。
 */
public class MainActivity extends Activity {

    private static final String LOCAL_HOST = WebViewAssetLoader.DEFAULT_DOMAIN; // appassets.androidplatform.net
    private static final String START_URL = "https://" + LOCAL_HOST + "/assets/www/index.html";

    private static final String RELEASE_API =
            "https://api.github.com/repos/MrWengKB/HanziQuery/releases/tags/apk-latest";
    private static final String RELEASE_PAGE =
            "https://github.com/MrWengKB/HanziQuery/releases/tag/apk-latest";
    // 发布说明里的「第 N 次构建」，N 与 App 的 versionCode 相同
    private static final Pattern BUILD_NO = Pattern.compile("第\\s*(\\d+)\\s*次构建");

    // 如果详情弹窗开着，返回键先关闭弹窗
    private static final String CLOSE_MODAL_JS =
            "(function(){var m=document.getElementById('charModal');" +
            "if(m&&m.classList.contains('active')){if(typeof closeModal==='function'){closeModal();}" +
            "else{m.classList.remove('active');}return true;}return false;})()";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFF8FAFC);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (LOCAL_HOST.equals(uri.getHost())) {
                    return false; // 本地页面，留在 App 内
                }
                openExternal(uri); // 外部链接交给浏览器打开
                return true;
            }
        });

        webView.loadUrl(START_URL);

        if (savedInstanceState == null) {
            checkForUpdate();
        }
    }

    // ---------- 检查更新 ----------

    private void checkForUpdate() {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(RELEASE_API).openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setRequestProperty("Accept", "application/vnd.github+json");
                conn.setRequestProperty("User-Agent", "HanziQuery-Android");
                if (conn.getResponseCode() != 200) return;

                JSONObject release = new JSONObject(readAll(conn.getInputStream()));
                Matcher m = BUILD_NO.matcher(release.optString("body", ""));
                if (!m.find()) return;

                long latest = Long.parseLong(m.group(1));
                if (latest <= currentVersionCode()) return;

                // 优先直接下载 APK，找不到就打开发布页面
                String url = release.optString("html_url", RELEASE_PAGE);
                JSONArray assets = release.optJSONArray("assets");
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject a = assets.getJSONObject(i);
                        if (a.optString("name", "").endsWith(".apk")) {
                            url = a.optString("browser_download_url", url);
                            break;
                        }
                    }
                }

                final String downloadUrl = url;
                runOnUiThread(() -> showUpdateDialog(downloadUrl));
            } catch (Exception ignored) {
                // 没网、超时、GitHub 暂时不可用：都静默跳过
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void showUpdateDialog(String downloadUrl) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
                .setTitle("发现新版本")
                .setMessage("有新版本可以下载。下载完成后点开 APK 安装，就会直接覆盖旧版本。")
                .setPositiveButton("下载", (dialog, which) -> openExternal(Uri.parse(downloadUrl)))
                .setNegativeButton("以后再说", null)
                .show();
    }

    @SuppressWarnings("deprecation")
    private long currentVersionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return Long.MAX_VALUE; // 读不到版本号就不提示
        }
    }

    private static String readAll(InputStream in) throws Exception {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    // ---------- 通用 ----------

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        webView.evaluateJavascript(CLOSE_MODAL_JS, value -> {
            if ("true".equals(value)) {
                return;
            }
            if (webView.canGoBack()) {
                webView.goBack();
            } else {
                finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
