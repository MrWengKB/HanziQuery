plugins {
    id("com.android.application")
}

// 把仓库根目录的网页文件复制进 App 的 assets/www，网页更新后重新打包即可同步
val webRoot = rootProject.projectDir.parentFile
val webAssetsDir = layout.buildDirectory.dir("webassets")

val copyWeb by tasks.registering(Sync::class) {
    from(webRoot) {
        include("index.html", "style.css", "hanzilist.csv", "*.ttf", "js/**", "audio/**")
    }
    into(webAssetsDir.map { it.dir("www") })
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
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
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
