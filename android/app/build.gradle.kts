plugins {
    id("com.android.application")
}

// 把仓库根目录的网页文件复制进 App 的 assets/www，网页更新后重新打包即可同步
val webRoot = rootProject.projectDir.parentFile
val webAssetsDir = layout.buildDirectory.dir("webassets")

val copyWeb by tasks.registering(Sync::class) {
    from(webRoot) {
        include("index.html", "style.css", "hanzilist.csv", "*.ttf", "js/**", "audio/**", "README.md", "version-history.md", "privacy.html")
    }
    into(webAssetsDir.map { it.dir("www") })
}

// 从 version-history.md 第一个 # 标题读出版本号，例如「# 更新内容 v2.5.1」→「2.5.1」
fun latestVersionName(): String {
    // 注意：在 Gradle 脚本里 "java" 指的是 Java 插件设定，不能写 java.io.File，所以用 webRoot.resolve
    val historyFile = webRoot.resolve("version-history.md")
    if (!historyFile.exists()) return "0.0.0"
    val heading = historyFile.readLines(Charsets.UTF_8).firstOrNull { line -> line.trim().startsWith("#") } ?: return "0.0.0"
    val withV = Regex("""[vV]\s*(\d+(?:\.\d+)*)""").find(heading)
    val anyNumber = Regex("""(\d+(?:\.\d+)+)""").find(heading)
    return (withV ?: anyNumber)?.groupValues?.get(1) ?: "0.0.0"
}

android {
    namespace = "com.mrwengkb.hanziquery"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.mrwengkb.hanziquery"
        minSdk = 26
        targetSdk = 36
        // 每次 GitHub Actions 构建自动递增版本号，方便覆盖安装
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        // 显示给用户看的版本名称，取自 version-history.md 的最新版本
        versionName = latestVersionName()
    }

    // 签名：使用 GitHub Secrets 里的上传密钥（打包时由 workflow 解码到 HQ_KEYSTORE_FILE）。
    // 密钥不放在仓库里；本机打包时自己设置这四个环境变量即可
    val ksFile = System.getenv("HQ_KEYSTORE_FILE")
    signingConfigs {
        create("release") {
            if (!ksFile.isNullOrEmpty()) {
                storeFile = file(ksFile)
                storePassword = System.getenv("HQ_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HQ_KEY_ALIAS")
                keyPassword = System.getenv("HQ_KEY_PASSWORD")
            }
        }
    }

    // 两个版本：
    //   direct：直接下载安装的 APK，启动时检查 GitHub 上有没有新版本，由用户决定安装或忽略
    //   play：上架 Google Play 的 AAB，不能自己检查/下载更新（Play 政策规定只能由 Play 更新）
    flavorDimensions += "dist"
    productFlavors {
        create("direct") {
            dimension = "dist"
            buildConfigField("boolean", "UPDATE_CHECK", "true")
        }
        create("play") {
            dimension = "dist"
            buildConfigField("boolean", "UPDATE_CHECK", "false")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(webAssetsDir.get().asFile)
        }
    }

    // 音频和字体本来就压缩过，不要再压缩
    androidResources {
        noCompress.addAll(listOf("mp3", "ttf"))
    }
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
