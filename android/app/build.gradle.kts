plugins {
    id("com.android.application")
}

// 把仓库根目录的网页文件复制进 App 的 assets/www，网页更新后重新打包即可同步
val webRoot = rootProject.projectDir.parentFile
val webAssetsDir = layout.buildDirectory.dir("webassets")

val copyWeb by tasks.registering(Sync::class) {
    from(webRoot) {
        include("index.html", "style.css", "hanzilist.csv", "*.ttf", "js/**", "audio/**", "README.md", "version-history.md")
    }
    into(webAssetsDir.map { it.dir("www") })
}

// 从 version-history.md 第一个 # 标题读出版本号，例如「# 更新内容 v2.51」→「2.51」
fun latestVersionName(): String {
    val file = java.io.File(webRoot, "version-history.md")
    if (!file.exists()) return "0.0"
    val heading = file.readLines(Charsets.UTF_8).firstOrNull { it.trim().startsWith("#") } ?: return "0.0"
    val withV = Regex("""[vV]\s*(\d+(?:\.\d+)*)""").find(heading)
    val anyNumber = Regex("""(\d+(?:\.\d+)+)""").find(heading)
    return (withV ?: anyNumber)?.groupValues?.get(1) ?: "0.0"
}

android {
    namespace = "com.mrwengkb.hanziquery"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.mrwengkb.hanziquery"
        minSdk = 26
        targetSdk = 34
        // 每次 GitHub Actions 构建自动递增版本号，方便覆盖安装
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        // 显示给用户看的版本名称，取自 version-history.md 的最新版本
        versionName = latestVersionName()
    }

    // 固定签名：每次构建签名一致，新版才能直接覆盖安装旧版
    signingConfigs {
        getByName("debug") {
            storeFile = file("hanziquery.keystore")
            storePassword = "android"
            keyAlias = "hanziquery"
            keyPassword = "android"
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
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
