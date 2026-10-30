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
import android.text.Html;
import android.text.SpannableStringBuilder;
import android.text.TextUtils;
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
 * 发现更新的构建编号就显示发布说明里的更新内容（打包时从 version-history.md 第一段写入），再问是否下载；
 * 没网或出错时静默跳过，不影响使用。
 */
public class MainActivity extends Activity {

    private static final String LOCAL_HOST = WebViewAssetLoader.DEFAULT_DOMAIN; // appassets.androidplatform.net
    private static final String START_URL = "https://" + LOCAL_HOST + "/assets/www/index.html";

    private static final String RELEASE_API =
            "https://api.github.com/repos/MrWengKB/HanziQuery/releases/tags/apk-latest";
    private static final String RELEASE_PAGE =
            "https://github.com/MrWengKB/HanziQuery/releases/tag/apk-latest";
    // 版本号，例如 v2.56 → 2.56
    private static final Pattern VERSION_NO = Pattern.compile("[vV]\\s*(\\d+(?:\\.\\d+)*)");
    // 发布说明里的「第 N 次构建」，N 与 App 的 versionCode 相同
    private static final Pattern BUILD_NO = Pattern.compile("第\\s*(\\d+)\\s*次构建");
    // Markdown：# 标题、- 列表
    private static final Pattern MD_HEADING = Pattern.compile("^#{1,6}\\s*(.*)$");
    private static final Pattern MD_LIST_ITEM = Pattern.compile("^[-*+]\\s+(.*)$");

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
            try {
                String json = httpGet(RELEASE_API, "application/vnd.github+json");
                if (json == null) return;

                JSONObject release = new JSONObject(json);
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

                // 更新内容就在发布说明里（打包时写入，和这个 APK 一定对得上）；
                // 没有内容也照样提示更新，只是不显示内容
                CharSequence notes = null;
                String body = release.optString("body", "");
                if (hasHeading(body)) {
                    notes = markdownToStyled(firstSection(body));
                }

                // 最新版本号：取自发布标题，例如「安卓离线版 v2.56」
                Matcher vm = VERSION_NO.matcher(release.optString("name", ""));
                final String latestVersion = vm.find() ? vm.group(1) : null;

                final String downloadUrl = url;
                final CharSequence updateNotes = notes;
                runOnUiThread(() -> showUpdateDialog(downloadUrl, updateNotes, latestVersion));
            } catch (Exception ignored) {
                // 没网、超时、GitHub 暂时不可用：都静默跳过
            }
        }).start();
    }

    private void showUpdateDialog(String downloadUrl, CharSequence notes, String latestVersion) {
        if (isFinishing() || isDestroyed()) return;

        SpannableStringBuilder msg = new SpannableStringBuilder("有新版本可以下载。");

        // 当前版本 / 最新版本，方便用户比较
        String current = currentVersionName();
        if (current != null) {
            msg.append("\n当前版本：v").append(current);
        }
        if (latestVersion != null) {
            msg.append("\n最新版本：v").append(latestVersion);
        }
        if (notes != null && notes.length() > 0) {
            msg.append("\n\n").append(notes);
        }
        msg.append("\n\n是否下载并安装？下载完成后点开 APK 安装，就会直接覆盖旧版本。");

        new AlertDialog.Builder(this)
                .setTitle("发现新版本")
                .setMessage(msg) // 内容太长时弹窗会自动出现滚动条
                .setPositiveButton("下载安装", (dialog, which) -> openExternal(Uri.parse(downloadUrl)))
                .setNegativeButton("以后再说", null)
                .show();
    }

    /** 是否含有 # 标题 */
    private static boolean hasHeading(String md) {
        for (String line : md.split("\n")) {
            if (line.trim().startsWith("#")) return true;
        }
        return false;
    }

    /** 取出第一个 # 标题及其下面的内容，到下一个 # 标题为止（即最新一个版本） */
    private static String firstSection(String md) {
        StringBuilder out = new StringBuilder();
        boolean started = false;
        for (String line : md.replace("\r\n", "\n").split("\n", -1)) {
            boolean isHeading = line.trim().startsWith("#");
            if (isHeading && started) break;   // 遇到第二个标题就停
            if (isHeading) started = true;
            if (started) out.append(line).append('\n');
        }
        return started ? out.toString() : md; // 文件里没有标题时就显示全部
    }

    /** 把 Markdown 转成带格式的文字：# 标题加粗放大，- 列表变成「•」，**粗体** 加粗 */
    private static CharSequence markdownToStyled(String md) {
        return Html.fromHtml(markdownToHtml(md), Html.FROM_HTML_MODE_LEGACY);
    }

    private static String markdownToHtml(String md) {
        StringBuilder html = new StringBuilder();
        for (String raw : md.replace("\r\n", "\n").split("\n", -1)) {
            String line = raw.trim();
            Matcher h = MD_HEADING.matcher(line);
            Matcher li = MD_LIST_ITEM.matcher(line);
            if (line.isEmpty()) {
                html.append("<br>");
            } else if (h.matches()) {
                html.append("<b><big>").append(inlineHtml(h.group(1))).append("</big></b><br>");
            } else if (li.matches()) {
                html.append("&#8226;&nbsp;").append(inlineHtml(li.group(1))).append("<br>");
            } else {
                html.append(inlineHtml(line)).append("<br>");
            }
        }
        return html.toString()
                .replaceAll("(<br>){3,}", "<br><br>")   // 多个空行合并
                .replaceAll("(<br>)+$", "");            // 去掉结尾空行
    }

    /** 行内格式：先转义 HTML 特殊字符，再处理 **粗体**、[文字](链接)、`代码` */
    private static String inlineHtml(String text) {
        return TextUtils.htmlEncode(text)
                .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1")
                .replaceAll("\\*\\*(.+?)\\*\\*", "<b>$1</b>")
                .replace("`", "");
    }

    /** GET 请求，成功返回内容（UTF-8），否则返回 null */
    private static String httpGet(String url, String accept) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setUseCaches(false);
            conn.setRequestProperty("Accept", accept);
            conn.setRequestProperty("User-Agent", "HanziQuery-Android");
            if (conn.getResponseCode() != 200) return null;
            return readAll(conn.getInputStream());
        } finally {
            conn.disconnect();
        }
    }

    /** 当前安装的版本名称（取自 version-history.md，例如 2.55）；读不到时返回 null */
    private String currentVersionName() {
        try {
            String name = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            if (name == null || name.isEmpty() || name.equals("0.0")) return null;
            return name.replaceFirst("^[vV]", "");
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
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
